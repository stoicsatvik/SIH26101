import { neon } from '@neondatabase/serverless';

const SESSION_COOKIE = 'sih_session';
const SESSION_DAYS = 7;
const PBKDF2_ITERATIONS = 210000;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}
function badRequest(message) { return json({ error: message }, 400); }
function unauthorized(message = 'Authentication required.') { return json({ error: message }, 401); }
function getSql(env) { if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not configured.'); return neon(env.DATABASE_URL); }
function errorMessage(error) { return String(error?.message || error || ''); }
function isMissingRelation(error) { const message = errorMessage(error).toLowerCase(); return message.includes('does not exist') && (message.includes('relation') || message.includes('column')); }
function databaseErrorResponse(error) {
  const lower = errorMessage(error).toLowerCase();
  if (lower.includes('database_url is not configured')) return json({ error: 'Database is not configured. Add the DATABASE_URL Worker secret.', code: 'DATABASE_NOT_CONFIGURED' }, 503);
  if (isMissingRelation(error)) return json({ error: 'Database schema is not initialized for this GyanSetu build. Apply migrations 001 and 002.', code: 'DATABASE_SCHEMA_MISSING' }, 503);
  if (lower.includes('connection') || lower.includes('fetch failed') || lower.includes('password authentication failed') || lower.includes('invalid connection')) return json({ error: 'Could not connect to the database. Check the Cloudflare DATABASE_URL secret.', code: 'DATABASE_CONNECTION_FAILED' }, 503);
  return null;
}
function bytesToHex(bytes) { return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join(''); }
function hexToBytes(hex) { const bytes = new Uint8Array(hex.length / 2); for (let i = 0; i < bytes.length; i += 1) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16); return bytes; }
async function sha256Hex(value) { const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return bytesToHex(new Uint8Array(digest)); }
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS }, key, 256);
  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${bytesToHex(salt)}$${bytesToHex(new Uint8Array(bits))}`;
}
async function verifyPassword(password, encoded) {
  const [algorithm, iterationsText, saltHex, expectedHex] = String(encoded || '').split('$');
  if (algorithm !== 'pbkdf2-sha256' || !iterationsText || !saltHex || !expectedHex) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: hexToBytes(saltHex), iterations: Number(iterationsText) }, key, 256);
  const actual = new Uint8Array(bits); const expected = hexToBytes(expectedHex); if (actual.length !== expected.length) return false;
  let diff = 0; for (let i = 0; i < actual.length; i += 1) diff |= actual[i] ^ expected[i]; return diff === 0;
}
function randomToken() { return bytesToHex(crypto.getRandomValues(new Uint8Array(32))); }
function parseCookies(request) {
  const cookie = request.headers.get('cookie') || '';
  return Object.fromEntries(cookie.split(';').map((part) => part.trim()).filter(Boolean).map((part) => { const index = part.indexOf('='); return index === -1 ? [part, ''] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))]; }));
}
function sessionCookie(token, maxAge = SESSION_DAYS * 24 * 60 * 60) { return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`; }
async function createSession(sql, userId) {
  const rawToken = randomToken(); const tokenHash = await sha256Hex(rawToken); const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await sql`INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES (${userId}, ${tokenHash}, ${expiresAt})`; return rawToken;
}
async function getCurrentUser(request, sql) {
  const rawToken = parseCookies(request)[SESSION_COOKIE]; if (!rawToken) return null; const tokenHash = await sha256Hex(rawToken);
  const rows = await sql`SELECT u.id, u.email, u.full_name, u.phone, u.employee_id, u.onboarding_completed, u.baseline_assessment_completed FROM user_sessions s JOIN app_users u ON u.id = s.user_id WHERE s.token_hash = ${tokenHash} AND s.revoked_at IS NULL AND s.expires_at > now() LIMIT 1`;
  return rows[0] || null;
}
async function requireUser(request, sql) { const user = await getCurrentUser(request, sql); if (!user) return { response: unauthorized() }; return { user }; }
async function readJson(request) { try { return await request.json(); } catch { return null; } }
function normalizeEmail(value) { return String(value || '').trim().toLowerCase(); }
function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
function toJsonValue(value) { if (value == null) return null; if (typeof value === 'string') { try { return JSON.parse(value); } catch { return value; } } return value; }
function assessmentBaseUrl(env) { const base = String(env.ASSESSMENT_API_URL || '').trim().replace(/\/$/, ''); if (!base) throw new Error('ASSESSMENT_API_URL is not configured.'); return base; }
async function assessmentService(env, path, { method = 'GET', body } = {}) {
  const headers = { 'content-type': 'application/json' }; if (env.ASSESSMENT_SERVICE_KEY) headers['x-gyansetu-service-key'] = env.ASSESSMENT_SERVICE_KEY;
  let response;
  try { response = await fetch(`${assessmentBaseUrl(env)}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }); }
  catch (error) { console.error('Assessment service fetch failed:', error); return { ok: false, status: 503, data: { error: 'Competency assessment service is unreachable.', code: 'ASSESSMENT_SERVICE_UNREACHABLE' } }; }
  let data; try { data = await response.json(); } catch { data = { detail: 'Assessment service returned an invalid response.' }; }
  if (!response.ok) return { ok: false, status: response.status, data: { error: data.detail || data.error || 'Assessment service request failed.', code: 'ASSESSMENT_SERVICE_ERROR' } };
  return { ok: true, status: response.status, data };
}
async function handleHealth(env) {
  if (!env.DATABASE_URL) return json({ ok: false, worker: true, databaseConfigured: false, assessmentServiceConfigured: Boolean(env.ASSESSMENT_API_URL) }, 503);
  const sql = getSql(env);
  try { await sql`SELECT 1 AS ok`; await sql`SELECT 1 FROM app_users LIMIT 1`; await sql`SELECT 1 FROM assessment_sessions LIMIT 1`; }
  catch (error) { if (isMissingRelation(error)) return json({ ok: false, worker: true, databaseConfigured: true, schemaReady: false, assessmentServiceConfigured: Boolean(env.ASSESSMENT_API_URL) }, 503); throw error; }
  return json({ ok: true, worker: true, databaseConfigured: true, schemaReady: true, assessmentServiceConfigured: Boolean(env.ASSESSMENT_API_URL) });
}
async function handleRegister(request, env) {
  const body = await readJson(request); if (!body) return badRequest('Invalid JSON body.');
  const email = normalizeEmail(body.email); const password = String(body.password || ''); const fullName = String(body.fullName || '').trim() || null; const context = body.registrationContext || {}; const phone = String(context.mobile || '').trim() || null; const employeeId = String(context.employeeId || '').trim() || null;
  if (!validEmail(email)) return badRequest('Enter a valid email address.'); if (password.length < 10) return badRequest('Password must be at least 10 characters.');
  const sql = getSql(env); const existing = await sql`SELECT id FROM app_users WHERE email = ${email} LIMIT 1`; if (existing.length) return json({ error: 'An account with this email already exists.' }, 409);
  const passwordHash = await hashPassword(password); const rows = await sql`INSERT INTO app_users (email, password_hash, full_name, phone, employee_id) VALUES (${email}, ${passwordHash}, ${fullName}, ${phone}, ${employeeId}) RETURNING id, email, full_name, onboarding_completed, baseline_assessment_completed`;
  const user = rows[0]; const token = await createSession(sql, user.id); return json({ user, next: '/onboarding.html' }, 201, { 'set-cookie': sessionCookie(token) });
}
async function handleLogin(request, env) {
  const body = await readJson(request); if (!body) return badRequest('Invalid JSON body.'); const email = normalizeEmail(body.email); const password = String(body.password || ''); if (!validEmail(email) || !password) return badRequest('Email and password are required.');
  const sql = getSql(env); const rows = await sql`SELECT id, email, full_name, password_hash, onboarding_completed, baseline_assessment_completed FROM app_users WHERE email = ${email} LIMIT 1`; const user = rows[0]; if (!user || !(await verifyPassword(password, user.password_hash))) return unauthorized('Incorrect email or password.');
  const token = await createSession(sql, user.id); const next = !user.onboarding_completed ? '/onboarding.html' : (!user.baseline_assessment_completed ? '/assessment.html' : '/dashboard.html');
  return json({ user: { id: user.id, email: user.email, full_name: user.full_name, onboarding_completed: user.onboarding_completed, baseline_assessment_completed: user.baseline_assessment_completed }, next }, 200, { 'set-cookie': sessionCookie(token) });
}
async function handleLogout(request, env) { const sql = getSql(env); const rawToken = parseCookies(request)[SESSION_COOKIE]; if (rawToken) { const tokenHash = await sha256Hex(rawToken); await sql`UPDATE user_sessions SET revoked_at = now() WHERE token_hash = ${tokenHash} AND revoked_at IS NULL`; } return json({ ok: true }, 200, { 'set-cookie': sessionCookie('', 0) }); }
async function handleMe(request, env) { const sql = getSql(env); const user = await getCurrentUser(request, sql); if (!user) return unauthorized(); return json({ user }); }
async function handleRoles(request, env) { const sql = getSql(env); const auth = await requireUser(request, sql); if (auth.response) return auth.response; const upstream = await assessmentService(env, '/roles'); if (!upstream.ok) return json(upstream.data, upstream.status); return json({ roles: upstream.data }); }
async function handleProfileSave(request, env) {
  const sql = getSql(env); const auth = await requireUser(request, sql); if (auth.response) return auth.response; const body = await readJson(request); if (!body) return badRequest('Invalid JSON body.');
  const profile = body.profile || {}; const roleId = String(profile.roleId || '').trim(); if (!roleId) return badRequest('Select the competency role that best matches the employee.'); const roleCheck = await assessmentService(env, `/roles/${encodeURIComponent(roleId)}/competencies`); if (!roleCheck.ok) return json(roleCheck.data, roleCheck.status);
  const education = Array.isArray(body.education) ? body.education : []; const experience = Array.isArray(body.experience) ? body.experience : []; const courses = Array.isArray(body.completedCourses) ? body.completedCourses : []; const skills = Array.isArray(body.skills) ? body.skills : [];
  const previous = await sql`SELECT role_id FROM user_profiles WHERE user_id = ${auth.user.id} LIMIT 1`; const roleChanged = previous.length > 0 && previous[0].role_id && previous[0].role_id !== roleId;
  await sql`INSERT INTO user_profiles (user_id, employment_status, current_job_title, designation, department, ministry_or_organization, years_experience, current_role_summary, target_role, role_id, updated_at) VALUES (${auth.user.id}, ${profile.employmentStatus || null}, ${profile.currentJobTitle || null}, ${profile.designation || null}, ${profile.department || null}, ${profile.organization || null}, ${profile.yearsExperience === '' || profile.yearsExperience == null ? null : Number(profile.yearsExperience)}, ${profile.currentRoleSummary || null}, ${profile.targetRole || null}, ${roleId}, now()) ON CONFLICT (user_id) DO UPDATE SET employment_status = EXCLUDED.employment_status, current_job_title = EXCLUDED.current_job_title, designation = EXCLUDED.designation, department = EXCLUDED.department, ministry_or_organization = EXCLUDED.ministry_or_organization, years_experience = EXCLUDED.years_experience, current_role_summary = EXCLUDED.current_role_summary, target_role = EXCLUDED.target_role, role_id = EXCLUDED.role_id, updated_at = now()`;
  await sql`DELETE FROM user_education WHERE user_id = ${auth.user.id}`;
  for (const item of education) { if (!item.degreeOrCertificate) continue; await sql`INSERT INTO user_education (user_id, qualification_level, degree_or_certificate, field_of_study, institution, start_year, end_year, is_current) VALUES (${auth.user.id}, ${item.qualificationLevel || 'Other'}, ${item.degreeOrCertificate}, ${item.fieldOfStudy || null}, ${item.institution || null}, ${item.startYear ? Number(item.startYear) : null}, ${item.endYear ? Number(item.endYear) : null}, ${Boolean(item.isCurrent)})`; }
  await sql`DELETE FROM user_work_experience WHERE user_id = ${auth.user.id}`;
  for (const item of experience) { if (!item.designation) continue; await sql`INSERT INTO user_work_experience (user_id, organization, designation, department, start_date, end_date, is_current, responsibilities) VALUES (${auth.user.id}, ${item.organization || null}, ${item.designation}, ${item.department || null}, ${item.startDate || null}, ${item.endDate || null}, ${Boolean(item.isCurrent)}, ${item.responsibilities || null})`; }
  await sql`DELETE FROM user_completed_courses WHERE user_id = ${auth.user.id}`;
  for (const item of courses) { if (!item.courseTitle) continue; await sql`INSERT INTO user_completed_courses (user_id, external_course_id, course_title, provider, completion_date, score, certificate_url) VALUES (${auth.user.id}, ${item.externalCourseId || null}, ${item.courseTitle}, ${item.provider || null}, ${item.completionDate || null}, ${item.score === '' || item.score == null ? null : Number(item.score)}, ${item.certificateUrl || null})`; }
  await sql`DELETE FROM user_skills WHERE user_id = ${auth.user.id} AND source = 'self_reported'`;
  for (const item of skills) { if (!item.skillName) continue; await sql`INSERT INTO user_skills (user_id, skill_name, self_reported_level, source) VALUES (${auth.user.id}, ${item.skillName}, ${item.level === '' || item.level == null ? null : Number(item.level)}, 'self_reported') ON CONFLICT (user_id, skill_name, source) DO UPDATE SET self_reported_level = EXCLUDED.self_reported_level`; }
  if (roleChanged) await sql`UPDATE app_users SET baseline_assessment_completed = false WHERE id = ${auth.user.id}`; await sql`UPDATE app_users SET onboarding_completed = true, updated_at = now() WHERE id = ${auth.user.id}`;
  const needsBaseline = roleChanged || !auth.user.baseline_assessment_completed; return json({ ok: true, role: roleCheck.data, next: needsBaseline ? '/assessment.html' : '/dashboard.html' });
}
async function handleProfileGet(request, env) {
  const sql = getSql(env); const auth = await requireUser(request, sql); if (auth.response) return auth.response;
  const [profileRows, education, experience, completedCourses, skills] = await Promise.all([sql`SELECT * FROM user_profiles WHERE user_id = ${auth.user.id} LIMIT 1`, sql`SELECT * FROM user_education WHERE user_id = ${auth.user.id} ORDER BY end_year DESC NULLS FIRST, created_at DESC`, sql`SELECT * FROM user_work_experience WHERE user_id = ${auth.user.id} ORDER BY is_current DESC, start_date DESC NULLS LAST`, sql`SELECT * FROM user_completed_courses WHERE user_id = ${auth.user.id} ORDER BY completion_date DESC NULLS LAST`, sql`SELECT * FROM user_skills WHERE user_id = ${auth.user.id} ORDER BY skill_name`]);
  return json({ user: auth.user, profile: profileRows[0] || null, education, experience, completedCourses, skills });
}
async function handleAssessmentGenerate(request, env) {
  const sql = getSql(env); const auth = await requireUser(request, sql); if (auth.response) return auth.response; const profileRows = await sql`SELECT role_id FROM user_profiles WHERE user_id = ${auth.user.id} LIMIT 1`; const roleId = profileRows[0]?.role_id; if (!roleId) return badRequest('Complete profile setup and select a competency role first.');
  const body = (await readJson(request)) || {}; const assessmentType = body.assessment_type === 'reassessment' ? 'reassessment' : 'baseline'; const questionCount = Number(body.question_count || 8); const mode = String(env.ASSESSMENT_MODE || 'live').toLowerCase() === 'mock' ? 'mock' : 'live';
  const upstream = await assessmentService(env, '/assessments/generate', { method: 'POST', body: { user_id: String(auth.user.id), role_id: roleId, assessment_type: assessmentType, question_count: questionCount, generation_mode: mode } }); if (!upstream.ok) return json(upstream.data, upstream.status);
  const data = upstream.data; const gradingQuestions = data.grading_questions; if (!Array.isArray(gradingQuestions) || !gradingQuestions.length) return json({ error: 'Assessment service did not return a grading payload.' }, 502);
  await sql`INSERT INTO assessment_sessions (assessment_id, user_id, role_id, assessment_type, grading_questions_json, status) VALUES (${data.assessment_id}, ${auth.user.id}, ${roleId}, ${assessmentType}, ${JSON.stringify(gradingQuestions)}::jsonb, 'pending') ON CONFLICT (assessment_id) DO NOTHING`;
  const publicData = { ...data }; delete publicData.grading_questions; return json(publicData);
}
async function persistAssessmentResult(sql, userId, session, result) {
  await sql`INSERT INTO assessment_attempts (assessment_id, user_id, role_id, assessment_type, overall_score, result_json) VALUES (${session.assessment_id}, ${userId}, ${session.role_id}, ${session.assessment_type}, ${Number(result.overall_score)}, ${JSON.stringify(result)}::jsonb) ON CONFLICT (assessment_id) DO UPDATE SET overall_score = EXCLUDED.overall_score, result_json = EXCLUDED.result_json`;
  await sql`DELETE FROM competency_results WHERE assessment_id = ${session.assessment_id}`; await sql`DELETE FROM sub_competency_results WHERE assessment_id = ${session.assessment_id}`;
  for (const competency of result.competencies || []) { await sql`INSERT INTO competency_results (assessment_id, user_id, competency_id, competency_name, current_score, required_score, gap) VALUES (${session.assessment_id}, ${userId}, ${competency.competency_id}, ${competency.competency_name}, ${Number(competency.current_score)}, ${Number(competency.required_score)}, ${Number(competency.gap)})`; for (const sub of competency.sub_competencies || []) { await sql`INSERT INTO sub_competency_results (assessment_id, user_id, competency_id, sub_competency_id, sub_competency_name, current_score, required_score, gap) VALUES (${session.assessment_id}, ${userId}, ${competency.competency_id}, ${sub.sub_competency_id}, ${sub.sub_competency_name}, ${Number(sub.current_score)}, ${Number(sub.required_score)}, ${Number(sub.gap)})`; } }
  await sql`UPDATE assessment_sessions SET status = 'submitted', submitted_at = now() WHERE assessment_id = ${session.assessment_id}`; if (session.assessment_type === 'baseline') await sql`UPDATE app_users SET baseline_assessment_completed = true, updated_at = now() WHERE id = ${userId}`;
}
async function handleAssessmentSubmit(request, env, assessmentId) {
  const sql = getSql(env); const auth = await requireUser(request, sql); if (auth.response) return auth.response; const body = await readJson(request); if (!body || !Array.isArray(body.responses)) return badRequest('Assessment responses are required.');
  const rows = await sql`SELECT * FROM assessment_sessions WHERE assessment_id = ${assessmentId} AND user_id = ${auth.user.id} LIMIT 1`; const session = rows[0]; if (!session) return json({ error: 'Assessment session was not found.' }, 404); if (session.status === 'submitted') return json({ error: 'This assessment has already been submitted.' }, 409);
  const mode = String(env.ASSESSMENT_MODE || 'live').toLowerCase() === 'mock' ? 'mock' : 'live'; const questions = toJsonValue(session.grading_questions_json);
  const upstream = await assessmentService(env, '/assessments/grade', { method: 'POST', body: { assessment_id: session.assessment_id, user_id: String(auth.user.id), role_id: session.role_id, assessment_type: session.assessment_type, questions, responses: body.responses, grading_mode: mode } }); if (!upstream.ok) return json(upstream.data, upstream.status);
  await persistAssessmentResult(sql, auth.user.id, session, upstream.data); return json({ ...upstream.data, next: '/dashboard.html' });
}
async function handleDashboard(request, env) {
  const sql = getSql(env); const auth = await requireUser(request, sql); if (auth.response) return auth.response;
  const [profileRows, attempts, learning] = await Promise.all([sql`SELECT * FROM user_profiles WHERE user_id = ${auth.user.id} LIMIT 1`, sql`SELECT assessment_id, role_id, assessment_type, overall_score, result_json, created_at FROM assessment_attempts WHERE user_id = ${auth.user.id} ORDER BY created_at DESC LIMIT 10`, sql`SELECT course_id, course_title, provider, status, completed_at FROM learning_activity WHERE user_id = ${auth.user.id} ORDER BY completed_at DESC`]);
  const normalizedAttempts = attempts.map((attempt) => ({ ...attempt, result_json: toJsonValue(attempt.result_json) })); return json({ user: auth.user, profile: profileRows[0] || null, latestAssessment: normalizedAttempts[0] || null, assessmentHistory: normalizedAttempts, learning });
}
async function handleLearningComplete(request, env) {
  const sql = getSql(env); const auth = await requireUser(request, sql); if (auth.response) return auth.response; const body = await readJson(request); if (!body?.course_id || !body?.course_title) return badRequest('course_id and course_title are required.');
  await sql`INSERT INTO learning_activity (user_id, course_id, course_title, provider, status, completed_at) VALUES (${auth.user.id}, ${body.course_id}, ${body.course_title}, ${body.provider || null}, 'completed', now()) ON CONFLICT (user_id, course_id) DO UPDATE SET status = 'completed', completed_at = now(), course_title = EXCLUDED.course_title, provider = EXCLUDED.provider`;
  return json({ ok: true, message: 'Learning completion recorded. Your competency score is unchanged until you complete a reassessment.', next: '/assessment.html?type=reassessment' });
}
async function handleApi(request, env) {
  const url = new URL(request.url); const key = `${request.method} ${url.pathname}`;
  if (key === 'GET /api/health') return handleHealth(env); if (key === 'POST /api/auth/register') return handleRegister(request, env); if (key === 'POST /api/auth/login') return handleLogin(request, env); if (key === 'POST /api/auth/logout') return handleLogout(request, env); if (key === 'GET /api/auth/me') return handleMe(request, env); if (key === 'GET /api/profile') return handleProfileGet(request, env); if (key === 'PUT /api/profile') return handleProfileSave(request, env); if (key === 'GET /api/competency/roles') return handleRoles(request, env); if (key === 'POST /api/assessment/generate') return handleAssessmentGenerate(request, env);
  if (request.method === 'POST' && url.pathname.startsWith('/api/assessment/') && url.pathname.endsWith('/submit')) { const assessmentId = decodeURIComponent(url.pathname.slice('/api/assessment/'.length, -'/submit'.length)); return handleAssessmentSubmit(request, env, assessmentId); }
  if (key === 'GET /api/dashboard') return handleDashboard(request, env); if (key === 'POST /api/learning/complete') return handleLearningComplete(request, env); return json({ error: 'API route not found.' }, 404);
}
export default { async fetch(request, env) { try { const url = new URL(request.url); if (url.pathname.startsWith('/api/')) return await handleApi(request, env); return env.ASSETS.fetch(request); } catch (error) { console.error('Worker request failed:', error); const databaseResponse = databaseErrorResponse(error); if (databaseResponse) return databaseResponse; const lower = errorMessage(error).toLowerCase(); if (lower.includes('assessment_api_url is not configured')) return json({ error: 'Assessment service URL is not configured on the Worker.', code: 'ASSESSMENT_SERVICE_NOT_CONFIGURED' }, 503); return json({ error: 'Server error.' }, 500); } } };
