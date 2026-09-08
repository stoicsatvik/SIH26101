import { neon } from '@neondatabase/serverless';
import baseWorker from './worker.js';
import {
  COURSE_CATALOG,
  getAssessmentState,
  publicRole,
  resolveRole,
} from './assessment-engine.js';
import {
  createBaselineAssessmentResilient,
  submitBaselineAssessmentFast,
} from './resilient-assessment.js';
import {
  countLiveAiAssessmentsToday,
  createCachedAiAssessment,
  createInstantCuratedAssessment,
  dailyLiveAssessmentLimit,
} from './fast-assessment.js';

const DEMO_EMAIL = 'demo@gyansetu.app';
const SESSION_COOKIE = 'sih_session';
const SESSION_DAYS = 7;
const AI_HEALTH_CACHE_MS = 5 * 60 * 1000;
let aiHealthCache = null;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  });
}

function getSql(env) {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not configured.');
  return neon(env.DATABASE_URL);
}

function bytesToHex(bytes) {
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

function randomSessionToken() {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
}

function sessionCookie(token, maxAge = SESSION_DAYS * 24 * 60 * 60) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

async function createSession(sql, userId) {
  const token = randomSessionToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await sql`INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES (${userId}, ${tokenHash}, ${expiresAt})`;
  return token;
}

async function authUser(request, env) {
  const authUrl = new URL('/api/auth/me', request.url);
  const authRequest = new Request(authUrl, { method: 'GET', headers: request.headers });
  const response = await baseWorker.fetch(authRequest, env);
  if (!response.ok) return { response };
  const data = await response.json();
  return { user: data.user };
}

async function profileForUser(sql, userId) {
  const rows = await sql`SELECT * FROM user_profiles WHERE user_id = ${userId} LIMIT 1`;
  return rows[0] || {};
}

function aiLimitInfo(env) {
  return {
    providerFreeRequestsPerMinute: Number(env.OPENROUTER_FREE_RPM || 20),
    providerFreeRequestsPerDay: Number(env.OPENROUTER_FREE_RPD || 50),
    liveAssessmentStartsPerMinute: 6,
    liveAssessmentStartsPerDay: dailyLiveAssessmentLimit(env),
  };
}

async function handleAiHealth(env) {
  if (!env.OPENROUTER_API_KEY) {
    return json({
      ok: false,
      configured: false,
      reachable: false,
      model: env.OPENROUTER_MODEL || 'openrouter/free',
      limits: aiLimitInfo(env),
    }, 503);
  }

  if (aiHealthCache && aiHealthCache.expiresAt > Date.now()) {
    return json(aiHealthCache.data, aiHealthCache.status);
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/key', {
      headers: { authorization: `Bearer ${env.OPENROUTER_API_KEY}` },
    });
    const data = {
      ok: response.ok,
      configured: true,
      reachable: response.ok,
      providerStatus: response.status,
      model: env.OPENROUTER_MODEL || 'openrouter/free',
      limits: aiLimitInfo(env),
    };
    const status = response.ok ? 200 : 502;
    aiHealthCache = { data, status, expiresAt: Date.now() + AI_HEALTH_CACHE_MS };
    return json(data, status);
  } catch {
    const data = {
      ok: false,
      configured: true,
      reachable: false,
      model: env.OPENROUTER_MODEL || 'openrouter/free',
      limits: aiLimitInfo(env),
    };
    aiHealthCache = { data, status: 502, expiresAt: Date.now() + 60_000 };
    return json(data, 502);
  }
}

async function handleDemoLogin(env) {
  const sql = getSql(env);
  const rows = await sql`
    SELECT id, email, full_name, onboarding_completed
    FROM app_users
    WHERE email = ${DEMO_EMAIL}
    LIMIT 1
  `;
  const user = rows[0];
  if (!user) {
    return json({ error: 'Demo account is not initialized yet.', code: 'DEMO_ACCOUNT_MISSING' }, 503);
  }

  await Promise.all([
    sql`DELETE FROM user_skills WHERE user_id = ${user.id} AND source = 'assessment'`,
    sql`DELETE FROM user_sessions WHERE user_id = ${user.id} AND expires_at <= now()`,
  ]);
  const token = await createSession(sql, user.id);
  return json({
    ok: true,
    demo: true,
    user,
    next: '/dashboard.html',
  }, 200, { 'set-cookie': sessionCookie(token) });
}

async function handleDemoProfileGuard(request, env) {
  const auth = await authUser(request, env);
  if (auth.response) return auth.response;
  if (String(auth.user.email || '').toLowerCase() !== DEMO_EMAIL) return null;
  return json({
    error: 'The shared demo profile is read-only. Use a normal account to edit profile data.',
    code: 'DEMO_PROFILE_READ_ONLY',
  }, 403);
}

async function handleDashboardState(request, env) {
  const auth = await authUser(request, env);
  if (auth.response) return auth.response;
  const sql = getSql(env);
  const profile = await profileForUser(sql, auth.user.id);
  const assessment = await getAssessmentState(sql, auth.user.id, profile);
  return json({
    user: auth.user,
    profile,
    assessment,
    demo: String(auth.user.email || '').toLowerCase() === DEMO_EMAIL,
    services: {
      database: true,
      openRouterConfigured: Boolean(env.OPENROUTER_API_KEY),
      emailConfigured: Boolean(env.RESEND_API_KEY && env.AUTH_FROM_EMAIL),
      openRouterLimits: aiLimitInfo(env),
    },
  });
}

async function handleCompetencies(request, env) {
  const auth = await authUser(request, env);
  if (auth.response) return auth.response;
  const sql = getSql(env);
  const profile = await profileForUser(sql, auth.user.id);
  return json({ role: publicRole(resolveRole(profile)) });
}

async function handleCatalog(request, env) {
  const auth = await authUser(request, env);
  if (auth.response) return auth.response;
  return json({ courses: COURSE_CATALOG });
}

async function handleStartAssessment(request, env) {
  const auth = await authUser(request, env);
  if (auth.response) return auth.response;
  const sql = getSql(env);
  const profile = await profileForUser(sql, auth.user.id);
  const isDemo = String(auth.user.email || '').toLowerCase() === DEMO_EMAIL;

  if (isDemo) {
    const assessment = await createInstantCuratedAssessment(sql, auth.user.id, profile, 'instant-demo');
    return json({ ok: true, quotaProtected: true, ...assessment });
  }

  const cached = await createCachedAiAssessment(sql, auth.user.id, profile);
  if (cached) {
    return json({ ok: true, quotaProtected: true, ...cached });
  }

  if (!env.OPENROUTER_API_KEY) {
    const assessment = await createInstantCuratedAssessment(sql, auth.user.id, profile, 'ai-unavailable-fallback');
    return json({ ok: true, quotaProtected: true, ...assessment });
  }

  const dailyUsed = await countLiveAiAssessmentsToday(sql);
  const dailyLimit = dailyLiveAssessmentLimit(env);
  if (dailyUsed >= dailyLimit) {
    const assessment = await createInstantCuratedAssessment(sql, auth.user.id, profile, 'daily-quota-fallback');
    return json({
      ok: true,
      quotaProtected: true,
      liveAiAssessmentsUsedToday: dailyUsed,
      liveAiAssessmentsPerDay: dailyLimit,
      ...assessment,
    });
  }

  if (env.AI_START_LIMITER) {
    const limiter = await env.AI_START_LIMITER.limit({ key: 'openrouter-free-global' });
    if (!limiter.success) {
      const assessment = await createInstantCuratedAssessment(sql, auth.user.id, profile, 'minute-quota-fallback');
      return json({ ok: true, quotaProtected: true, ...assessment });
    }
  }

  const assessment = await createBaselineAssessmentResilient(sql, env, auth.user.id, profile);
  return json({
    ok: true,
    quotaProtected: true,
    liveAiAssessmentsUsedToday: dailyUsed + 1,
    liveAiAssessmentsPerDay: dailyLimit,
    ...assessment,
  });
}

async function handleSubmitAssessment(request, env) {
  const auth = await authUser(request, env);
  if (auth.response) return auth.response;
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON body.' }, 400); }
  const sql = getSql(env);
  const result = await submitBaselineAssessmentFast(sql, auth.user.id, body);
  return json({ ok: true, result });
}

async function handleExtendedApi(request, env) {
  const url = new URL(request.url);
  const key = `${request.method} ${url.pathname}`;
  if (key === 'POST /api/auth/demo') return handleDemoLogin(env);
  if (key === 'PUT /api/profile') return handleDemoProfileGuard(request, env);
  if (key === 'GET /api/ai/health') return handleAiHealth(env);
  if (key === 'GET /api/dashboard/state') return handleDashboardState(request, env);
  if (key === 'GET /api/competencies') return handleCompetencies(request, env);
  if (key === 'GET /api/catalog') return handleCatalog(request, env);
  if (key === 'POST /api/assessments/start') return handleStartAssessment(request, env);
  if (key === 'POST /api/assessments/submit') return handleSubmitAssessment(request, env);
  return null;
}

export default {
  async fetch(request, env) {
    try {
      const extended = await handleExtendedApi(request, env);
      if (extended) return extended;
      return await baseWorker.fetch(request, env);
    } catch (error) {
      console.error('Extended GyanSetu request failed:', error);
      const message = String(error?.message || error || 'Server error.');
      const status = message.includes('OPENROUTER_API_KEY') ? 503 : message.includes('Answer every question') ? 400 : message.includes('does not belong') ? 403 : 500;
      return json({ error: status === 500 ? 'Server error.' : message, code: 'EXTENDED_API_ERROR' }, status);
    }
  },
};
