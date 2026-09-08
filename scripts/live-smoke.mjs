const BASE_URL = 'https://sih26101.stoicsolutions-in.workers.dev';
const attempts = 12;
const delayMs = 10_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readJson(path, init = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { accept: 'application/json', ...(init.headers || {}) },
  });
  let data = {};
  try { data = await response.json(); } catch { data = {}; }
  return { response, data };
}

async function readText(path) {
  const response = await fetch(`${BASE_URL}${path}`, { headers: { accept: 'text/html' } });
  return { response, text: await response.text() };
}

async function checkDemoFlow() {
  const login = await readText('/login.html');
  if (!login.response.ok || !login.text.includes('demo-login-button') || !login.text.includes('demo@gyansetu.app')) {
    return { ok: false, reason: 'demo login UI missing' };
  }

  const startedAt = Date.now();
  const demo = await readJson('/api/auth/demo', { method: 'POST' });
  if (!demo.response.ok || demo.data?.demo !== true) return { ok: false, reason: `demo login ${demo.response.status}` };
  const setCookie = demo.response.headers.get('set-cookie') || '';
  const cookie = setCookie.split(';')[0];
  if (!cookie.startsWith('sih_session=')) return { ok: false, reason: 'demo session cookie missing' };

  const dashboard = await readJson('/api/dashboard/state', { headers: { cookie } });
  if (!dashboard.response.ok || dashboard.data?.demo !== true) return { ok: false, reason: `demo dashboard ${dashboard.response.status}` };

  const assessment = await readJson('/api/assessments/start', { method: 'POST', headers: { cookie } });
  const elapsedMs = Date.now() - startedAt;
  const ready = assessment.response.ok
    && assessment.data?.questionCount === 10
    && assessment.data?.generationMode === 'instant-demo'
    && Array.isArray(assessment.data?.questions)
    && assessment.data.questions.length === 10;
  return { ok: ready, reason: ready ? 'ok' : `demo assessment ${assessment.response.status}`, elapsedMs };
}

for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    const [health, ai, dashboard, assessment, workspace] = await Promise.all([
      readJson('/api/health'),
      readJson('/api/ai/health'),
      readText('/dashboard.html'),
      readText('/assessment.html'),
      readText('/workspace.html'),
    ]);

    const healthy = health.response.ok && health.data?.databaseReachable === true && health.data?.schemaReady === true;
    const aiReady = ai.response.ok && ai.data?.configured === true && ai.data?.reachable === true;
    const limitsReady = ai.data?.limits?.providerFreeRequestsPerMinute === 20 && ai.data?.limits?.providerFreeRequestsPerDay === 50;
    const dashboardReady = dashboard.response.ok && dashboard.text.includes('./ui/gyansetu-logo.svg') && dashboard.text.includes('/api/dashboard/state') === false;
    const assessmentReady = assessment.response.ok && assessment.text.includes('Generate My Assessment') && assessment.text.includes('./assessment.js');
    const workspaceReady = workspace.response.ok && workspace.text.includes('./workspace.js');
    const demoFlow = healthy && aiReady ? await checkDemoFlow() : { ok: false, reason: 'services not ready' };

    console.log(`Attempt ${attempt}/${attempts}: health=${health.response.status} ai=${ai.response.status} dashboard=${dashboard.response.status} assessment=${assessment.response.status} workspace=${workspace.response.status} demo=${demoFlow.ok} demoMs=${demoFlow.elapsedMs ?? 'n/a'}`);
    if (healthy && aiReady && limitsReady && dashboardReady && assessmentReady && workspaceReady && demoFlow.ok) {
      console.log(`Live Worker smoke check passed: services are live and the public demo reached a 10-question instant assessment in ${demoFlow.elapsedMs}ms.`);
      process.exit(0);
    }

    if (attempt === attempts) {
      console.error('Live Worker smoke check failed.', {
        healthStatus: health.response.status,
        databaseReachable: health.data?.databaseReachable,
        schemaReady: health.data?.schemaReady,
        aiStatus: ai.response.status,
        aiConfigured: ai.data?.configured,
        aiReachable: ai.data?.reachable,
        limitsReady,
        dashboardReady,
        assessmentReady,
        workspaceReady,
        demoFlow,
      });
      process.exit(1);
    }
  } catch (error) {
    console.error(`Attempt ${attempt}/${attempts} failed:`, String(error?.message || error));
    if (attempt === attempts) process.exit(1);
  }
  await sleep(delayMs);
}
