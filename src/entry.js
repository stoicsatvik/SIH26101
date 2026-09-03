import baseWorker from './worker.js';
import { getOpenRouterKeyStatus } from './openrouter.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

async function authenticated(request, env) {
  const url = new URL(request.url);
  url.pathname = '/api/auth/me';
  url.search = '';
  const authRequest = new Request(url.toString(), {
    method: 'GET',
    headers: request.headers,
  });
  const response = await baseWorker.fetch(authRequest, env);
  return response.ok;
}

async function handleAiHealth(request, env) {
  if (!(await authenticated(request, env))) {
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
    return baseWorker.fetch(request, env);
  },
};
