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

for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    const health = await readJson('/api/health');
    const ai = await readJson('/api/ai/health');
    const healthy = health.response.ok && health.data?.databaseReachable === true && health.data?.schemaReady === true;
    const aiReady = ai.response.ok && ai.data?.configured === true && ai.data?.reachable === true;

    console.log(`Attempt ${attempt}/${attempts}: health=${health.response.status} ai=${ai.response.status}`);
    if (healthy && aiReady) {
      console.log('Live Worker smoke check passed: database/schema and OpenRouter are reachable.');
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
      });
      process.exit(1);
    }
  } catch (error) {
    console.error(`Attempt ${attempt}/${attempts} failed:`, String(error?.message || error));
    if (attempt === attempts) process.exit(1);
  }
  await sleep(delayMs);
}
