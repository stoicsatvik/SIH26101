export class ApiError extends Error {
  constructor(message, status, payload = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
    this.code = payload?.code || null;
  }
}

async function request(path, options = {}) {
  const requestOptions = {
    credentials: 'same-origin',
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.headers || {}),
    },
  };

  if (options.body && typeof options.body !== 'string') {
    requestOptions.headers['Content-Type'] = 'application/json';
    requestOptions.body = JSON.stringify(options.body);
  }

  const response = await fetch(path, requestOptions);
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new ApiError(
      payload?.error || `Request failed with HTTP ${response.status}.`,
      response.status,
      payload,
    );
  }

  return payload;
}

export const api = {
  me() {
    return request('/api/auth/me');
  },

  profile() {
    return request('/api/profile');
  },

  logout() {
    return request('/api/auth/logout', { method: 'POST' });
  },

  startAssessment({ roleId = null, assessmentType = 'diagnostic' } = {}) {
    const body = { assessment_type: assessmentType };
    if (roleId) body.role_id = roleId;
    return request('/api/assessments/start', { method: 'POST', body });
  },

  assessment(assessmentId) {
    return request(`/api/assessments/${encodeURIComponent(assessmentId)}`);
  },

  submitAssessment(assessmentId, answers) {
    return request(`/api/assessments/${encodeURIComponent(assessmentId)}/submit`, {
      method: 'POST',
      body: { answers },
    });
  },

  assessmentResults(assessmentId) {
    return request(`/api/assessments/${encodeURIComponent(assessmentId)}/results`);
  },

  competencyProfile() {
    return request('/api/users/me/competency-profile');
  },
};
