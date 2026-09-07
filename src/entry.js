import { neon } from '@neondatabase/serverless';
import baseWorker from './worker.js';
import {
  createBaselineAssessment,
  getAssessmentState,
  publicRole,
  resolveRole,
  submitBaselineAssessment,
} from './assessment-engine.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function getSql(env) {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not configured.');
  return neon(env.DATABASE_URL);
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

async function handleAiHealth(env) {
  if (!env.OPENROUTER_API_KEY) {
    return json({ ok: false, configured: false, reachable: false, model: env.OPENROUTER_MODEL || 'openrouter/free' }, 503);
  }
  try {
    const response = await fetch('https://openrouter.ai/api/v1/key', {
      headers: { authorization: `Bearer ${env.OPENROUTER_API_KEY}` },
    });
    return json({
      ok: response.ok,
      configured: true,
      reachable: response.ok,
      providerStatus: response.status,
      model: env.OPENROUTER_MODEL || 'openrouter/free',
    }, response.ok ? 200 : 502);
  } catch {
    return json({ ok: false, configured: true, reachable: false, model: env.OPENROUTER_MODEL || 'openrouter/free' }, 502);
  }
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
    services: {
      database: true,
      openRouterConfigured: Boolean(env.OPENROUTER_API_KEY),
      emailConfigured: Boolean(env.RESEND_API_KEY && env.AUTH_FROM_EMAIL),
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

async function handleStartAssessment(request, env) {
  const auth = await authUser(request, env);
  if (auth.response) return auth.response;
  const sql = getSql(env);
  const profile = await profileForUser(sql, auth.user.id);
  if (!env.OPENROUTER_API_KEY) {
    return json({ error: 'OpenRouter is not configured on the Worker.', code: 'OPENROUTER_NOT_CONFIGURED' }, 503);
  }
  const assessment = await createBaselineAssessment(sql, env, auth.user.id, profile);
  return json({ ok: true, ...assessment });
}

async function handleSubmitAssessment(request, env) {
  const auth = await authUser(request, env);
  if (auth.response) return auth.response;
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON body.' }, 400); }
  const sql = getSql(env);
  const result = await submitBaselineAssessment(sql, env, auth.user.id, body);
  return json({ ok: true, result });
}

async function handleExtendedApi(request, env) {
  const url = new URL(request.url);
  const key = `${request.method} ${url.pathname}`;
  if (key === 'GET /api/ai/health') return handleAiHealth(env);
  if (key === 'GET /api/dashboard/state') return handleDashboardState(request, env);
  if (key === 'GET /api/competencies') return handleCompetencies(request, env);
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
