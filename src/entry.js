import baseWorker from './worker.js';
import { getOpenRouterKeyStatus } from './openrouter.js';
import { handleAssessmentApi, isAssessmentApiPath } from './assessment-api.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

async function currentUser(request, env) {
  const url = new URL(request.url);
  url.pathname = '/api/auth/me';
  url.search = '';
  const authRequest = new Request(url.toString(), {
    method: 'GET',
    headers: request.headers,
  });
  const response = await baseWorker.fetch(authRequest, env);
  if (!response.ok) return null;
  try {
    const data = await response.json();
    return data?.user || null;
  } catch {
    return null;
  }
}

async function handleAiHealth(request, env) {
  if (!(await currentUser(request, env))) {
    return json({ error: 'Authentication required.' }, 401);
  }

  if (!env.OPENROUTER_API_KEY) {
    return json({
      ok: false,
      openRouterConfigured: false,
      openRouterReachable: false,
      code: 'OPENROUTER_NOT_CONFIGURED',
    }, 503);
  }

  try {
    const status = await getOpenRouterKeyStatus({ apiKey: env.OPENROUTER_API_KEY });
    if (!status.ok) {
      return json({
        ok: false,
        openRouterConfigured: true,
        openRouterReachable: false,
        code: 'OPENROUTER_AUTH_FAILED',
        providerStatus: status.status,
      }, 502);
    }

    return json({
      ok: true,
      openRouterConfigured: true,
      openRouterReachable: true,
    });
  } catch (error) {
    console.error('OpenRouter health check failed:', error);
    return json({
      ok: false,
      openRouterConfigured: true,
      openRouterReachable: false,
      code: 'OPENROUTER_UNREACHABLE',
    }, 502);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/api/ai/health') {
      return handleAiHealth(request, env);
    }

    if (isAssessmentApiPath(url.pathname)) {
      const user = await currentUser(request, env);
      if (!user) return json({ error: 'Authentication required.' }, 401);
      return handleAssessmentApi(request, env, user);
    }

    return baseWorker.fetch(request, env);
  },
};
