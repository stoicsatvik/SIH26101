const BASE_URL = 'https://sih26101.stoicsolutions-in.workers.dev';
const attempts = 12;
const delayMs = 10_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readJson(path) {
  const response = await fetch(`${BASE_URL}${path}`, { headers: { accept: 'application/json' } });
  let data = {};
  try { data = await response.json(); } catch { data = {}; }
  return { response, data };
}

async function readText(path) {
  const response = await fetch(`${BASE_URL}${path}`, { headers: { accept: 'text/html' } });
  return { response, text: await response.text() };
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
    const dashboardReady = dashboard.response.ok && dashboard.text.includes('./ui/gyansetu-logo.svg') && dashboard.text.includes('/api/dashboard/state') === false;
    const assessmentReady = assessment.response.ok && assessment.text.includes('Generate My Assessment') && assessment.text.includes('./assessment.js');
    const workspaceReady = workspace.response.ok && workspace.text.includes('./workspace.js');

    console.log(`Attempt ${attempt}/${attempts}: health=${health.response.status} ai=${ai.response.status} dashboard=${dashboard.response.status} assessment=${assessment.response.status} workspace=${workspace.response.status}`);
    if (healthy && aiReady && dashboardReady && assessmentReady && workspaceReady) {
      console.log('Live Worker smoke check passed: database/schema, OpenRouter, official-logo dashboard, assessment UI and workspace UI are live.');
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
        dashboardReady,
        assessmentReady,
        workspaceReady,
      });
      process.exit(1);
    }
  } catch (error) {
    console.error(`Attempt ${attempt}/${attempts} failed:`, String(error?.message || error));
    if (attempt === attempts) process.exit(1);
  }
  await sleep(delayMs);
}
