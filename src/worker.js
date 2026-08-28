import { neon } from '@neondatabase/serverless';

const SESSION_COOKIE = 'sih_session';
const SESSION_DAYS = 7;
const PBKDF2_ITERATIONS = 210000;

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

function badRequest(message) {
  return json({ error: message }, 400);
}

function unauthorized(message = 'Authentication required.') {
  return json({ error: message }, 401);
}

function getSql(env) {
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured.');
  }
  return neon(env.DATABASE_URL);
}

function bytesToHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt,
      iterations: PBKDF2_ITERATIONS,
    },
    key,
    256,
  );
  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${bytesToHex(salt)}$${bytesToHex(new Uint8Array(bits))}`;
}

async function verifyPassword(password, encoded) {
  const [algorithm, iterationsText, saltHex, expectedHex] = String(encoded || '').split('$');
  if (algorithm !== 'pbkdf2-sha256' || !iterationsText || !saltHex || !expectedHex) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: hexToBytes(saltHex),
      iterations: Number(iterationsText),
    },
    key,
    256,
  );
  const actual = new Uint8Array(bits);
  const expected = hexToBytes(expectedHex);
  if (actual.length !== expected.length) return false;

  let diff = 0;
  for (let i = 0; i < actual.length; i += 1) diff |= actual[i] ^ expected[i];
  return diff === 0;
}

function randomToken() {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
}

function parseCookies(request) {
  const cookie = request.headers.get('cookie') || '';
  return Object.fromEntries(
    cookie.split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
      const index = part.indexOf('=');
      return index === -1 ? [part, ''] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
    }),
  );
}

function sessionCookie(token, maxAge = SESSION_DAYS * 24 * 60 * 60) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

async function createSession(sql, userId) {
  const rawToken = randomToken();
  const tokenHash = await sha256Hex(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await sql`INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES (${userId}, ${tokenHash}, ${expiresAt})`;
  return rawToken;
}

async function getCurrentUser(request, sql) {
  const rawToken = parseCookies(request)[SESSION_COOKIE];
  if (!rawToken) return null;
  const tokenHash = await sha256Hex(rawToken);
  const rows = await sql`
    SELECT u.id, u.email, u.full_name, u.phone, u.onboarding_completed
    FROM user_sessions s
    JOIN app_users u ON u.id = s.user_id
    WHERE s.token_hash = ${tokenHash}
      AND s.revoked_at IS NULL
      AND s.expires_at > now()
    LIMIT 1
  `;
  return rows[0] || null;
}

async function requireUser(request, sql) {
  const user = await getCurrentUser(request, sql);
  if (!user) return { response: unauthorized() };
  return { user };
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function handleRegister(request, env) {
  const body = await readJson(request);
  if (!body) return badRequest('Invalid JSON body.');

  const email = normalizeEmail(body.email);
  const password = String(body.password || '');
  const fullName = String(body.fullName || '').trim() || null;

  if (!validEmail(email)) return badRequest('Enter a valid email address.');
  if (password.length < 10) return badRequest('Password must be at least 10 characters.');

  const sql = getSql(env);
  const existing = await sql`SELECT id FROM app_users WHERE email = ${email} LIMIT 1`;
  if (existing.length) return json({ error: 'An account with this email already exists.' }, 409);

  const passwordHash = await hashPassword(password);
  const rows = await sql`
    INSERT INTO app_users (email, password_hash, full_name)
    VALUES (${email}, ${passwordHash}, ${fullName})
    RETURNING id, email, full_name, onboarding_completed
  `;
  const user = rows[0];
  const token = await createSession(sql, user.id);

  return json(
    { user, next: '/onboarding.html' },
    201,
    { 'set-cookie': sessionCookie(token) },
  );
}

async function handleLogin(request, env) {
  const body = await readJson(request);
  if (!body) return badRequest('Invalid JSON body.');

  const email = normalizeEmail(body.email);
  const password = String(body.password || '');
  if (!validEmail(email) || !password) return badRequest('Email and password are required.');

  const sql = getSql(env);
  const rows = await sql`
    SELECT id, email, full_name, password_hash, onboarding_completed
    FROM app_users
    WHERE email = ${email}
    LIMIT 1
  `;
  const user = rows[0];
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return unauthorized('Incorrect email or password.');
  }

  const token = await createSession(sql, user.id);
  return json(
    {
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        onboarding_completed: user.onboarding_completed,
      },
      next: user.onboarding_completed ? '/dashboard.html' : '/onboarding.html',
    },
    200,
    { 'set-cookie': sessionCookie(token) },
  );
}

async function handleLogout(request, env) {
  const sql = getSql(env);
  const rawToken = parseCookies(request)[SESSION_COOKIE];
  if (rawToken) {
    const tokenHash = await sha256Hex(rawToken);
    await sql`UPDATE user_sessions SET revoked_at = now() WHERE token_hash = ${tokenHash} AND revoked_at IS NULL`;
  }
  return json({ ok: true }, 200, { 'set-cookie': sessionCookie('', 0) });
}

async function handleMe(request, env) {
  const sql = getSql(env);
  const user = await getCurrentUser(request, sql);
  if (!user) return unauthorized();
  return json({ user });
}

async function handleProfileSave(request, env) {
  const sql = getSql(env);
  const auth = await requireUser(request, sql);
  if (auth.response) return auth.response;
  const body = await readJson(request);
  if (!body) return badRequest('Invalid JSON body.');

  const profile = body.profile || {};
  const education = Array.isArray(body.education) ? body.education : [];
  const experience = Array.isArray(body.experience) ? body.experience : [];
  const courses = Array.isArray(body.completedCourses) ? body.completedCourses : [];
  const skills = Array.isArray(body.skills) ? body.skills : [];

  await sql`
    INSERT INTO user_profiles (
      user_id, employment_status, current_job_title, designation, department,
      ministry_or_organization, years_experience, current_role_summary, target_role, updated_at
    ) VALUES (
      ${auth.user.id}, ${profile.employmentStatus || null}, ${profile.currentJobTitle || null},
      ${profile.designation || null}, ${profile.department || null}, ${profile.organization || null},
      ${profile.yearsExperience === '' || profile.yearsExperience == null ? null : Number(profile.yearsExperience)},
      ${profile.currentRoleSummary || null}, ${profile.targetRole || null}, now()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      employment_status = EXCLUDED.employment_status,
      current_job_title = EXCLUDED.current_job_title,
      designation = EXCLUDED.designation,
      department = EXCLUDED.department,
      ministry_or_organization = EXCLUDED.ministry_or_organization,
      years_experience = EXCLUDED.years_experience,
      current_role_summary = EXCLUDED.current_role_summary,
      target_role = EXCLUDED.target_role,
      updated_at = now()
  `;

  await sql`DELETE FROM user_education WHERE user_id = ${auth.user.id}`;
  for (const item of education) {
    if (!item.degreeOrCertificate) continue;
    await sql`
      INSERT INTO user_education (
        user_id, qualification_level, degree_or_certificate, field_of_study,
        institution, start_year, end_year, is_current
      ) VALUES (
        ${auth.user.id}, ${item.qualificationLevel || 'Other'}, ${item.degreeOrCertificate},
        ${item.fieldOfStudy || null}, ${item.institution || null},
        ${item.startYear ? Number(item.startYear) : null}, ${item.endYear ? Number(item.endYear) : null},
        ${Boolean(item.isCurrent)}
      )
    `;
  }

  await sql`DELETE FROM user_work_experience WHERE user_id = ${auth.user.id}`;
  for (const item of experience) {
    if (!item.designation) continue;
    await sql`
      INSERT INTO user_work_experience (
        user_id, organization, designation, department, start_date, end_date, is_current, responsibilities
      ) VALUES (
        ${auth.user.id}, ${item.organization || null}, ${item.designation}, ${item.department || null},
        ${item.startDate || null}, ${item.endDate || null}, ${Boolean(item.isCurrent)}, ${item.responsibilities || null}
      )
    `;
  }

  await sql`DELETE FROM user_completed_courses WHERE user_id = ${auth.user.id}`;
  for (const item of courses) {
    if (!item.courseTitle) continue;
    await sql`
      INSERT INTO user_completed_courses (
        user_id, external_course_id, course_title, provider, completion_date, score, certificate_url
      ) VALUES (
        ${auth.user.id}, ${item.externalCourseId || null}, ${item.courseTitle}, ${item.provider || null},
        ${item.completionDate || null}, ${item.score === '' || item.score == null ? null : Number(item.score)},
        ${item.certificateUrl || null}
      )
    `;
  }

  await sql`DELETE FROM user_skills WHERE user_id = ${auth.user.id} AND source = 'self_reported'`;
  for (const item of skills) {
    if (!item.skillName) continue;
    await sql`
      INSERT INTO user_skills (user_id, skill_name, self_reported_level, source)
      VALUES (${auth.user.id}, ${item.skillName}, ${item.level === '' || item.level == null ? null : Number(item.level)}, 'self_reported')
      ON CONFLICT (user_id, skill_name, source) DO UPDATE SET self_reported_level = EXCLUDED.self_reported_level
    `;
  }

  await sql`UPDATE app_users SET onboarding_completed = true, updated_at = now() WHERE id = ${auth.user.id}`;
  return json({ ok: true, next: '/dashboard.html' });
}

async function handleProfileGet(request, env) {
  const sql = getSql(env);
  const auth = await requireUser(request, sql);
  if (auth.response) return auth.response;

  const [profileRows, education, experience, completedCourses, skills] = await Promise.all([
    sql`SELECT * FROM user_profiles WHERE user_id = ${auth.user.id} LIMIT 1`,
    sql`SELECT * FROM user_education WHERE user_id = ${auth.user.id} ORDER BY end_year DESC NULLS FIRST, created_at DESC`,
    sql`SELECT * FROM user_work_experience WHERE user_id = ${auth.user.id} ORDER BY is_current DESC, start_date DESC NULLS LAST`,
    sql`SELECT * FROM user_completed_courses WHERE user_id = ${auth.user.id} ORDER BY completion_date DESC NULLS LAST`,
    sql`SELECT * FROM user_skills WHERE user_id = ${auth.user.id} ORDER BY skill_name`,
  ]);

  return json({
    user: auth.user,
    profile: profileRows[0] || null,
    education,
    experience,
    completedCourses,
    skills,
  });
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  const key = `${request.method} ${url.pathname}`;

  if (key === 'POST /api/auth/register') return handleRegister(request, env);
  if (key === 'POST /api/auth/login') return handleLogin(request, env);
  if (key === 'POST /api/auth/logout') return handleLogout(request, env);
  if (key === 'GET /api/auth/me') return handleMe(request, env);
  if (key === 'GET /api/profile') return handleProfileGet(request, env);
  if (key === 'PUT /api/profile') return handleProfileSave(request, env);

  return json({ error: 'API route not found.' }, 404);
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (url.pathname.startsWith('/api/')) {
        return await handleApi(request, env);
      }
      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error(error);
      return json({ error: 'Server error.' }, 500);
    }
  },
};
