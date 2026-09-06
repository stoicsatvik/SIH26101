import { api, ApiError } from './api-client.js';

const $ = (selector) => document.querySelector(selector);

const state = {
  profileData: null,
  startingAssessment: false,
};

function greetingForHour(hour) {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function initials(nameOrEmail) {
  const value = String(nameOrEmail || '').trim();
  if (!value) return 'GS';
  const parts = value.includes('@') ? [value.split('@')[0]] : value.split(/\s+/);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('') || 'GS';
}

function humanRole(profile) {
  return profile?.designation || profile?.current_job_title || profile?.target_role || 'Employee';
}

function organizationLine(profile) {
  const department = profile?.department || null;
  const organization = profile?.ministry_or_organization || null;
  if (department && organization) return `${organization} / ${department}`;
  return organization || department || 'Organization / Department';
}

function setText(selector, value) {
  const node = $(selector);
  if (node) node.textContent = value;
}

function showToast(message) {
  const toast = $('#dashboard-toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('is-visible');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove('is-visible'), 2800);
}

function setInlineStatus(message = '', type = '') {
  const status = $('#assessment-inline-status');
  if (!status) return;
  status.textContent = message;
  status.classList.remove('is-error', 'is-success');
  if (type) status.classList.add(type === 'error' ? 'is-error' : 'is-success');
}

function renderProfile(data) {
  state.profileData = data;
  const user = data.user || {};
  const profile = data.profile || {};
  const name = user.full_name || user.email || 'Employee';
  const role = humanRole(profile);
  const org = organizationLine(profile);
  const greeting = greetingForHour(new Date().getHours());

  setText('#greeting-title', `${greeting}, ${name} 👋`);
  setText('#greeting-meta-role', role);
  setText('#greeting-meta-org', org);
  setText('#user-chip-name', name);
  setText('#user-avatar', initials(name));
  setText('#role-card-value', `Mapped to ${role}`);
}

async function loadProfile() {
  try {
    const data = await api.profile();
    renderProfile(data);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      window.location.assign('/login.html');
      return;
    }
    setInlineStatus(error.message || 'Could not load your profile.', 'error');
  }
}

async function startAssessment() {
  if (state.startingAssessment) return;
  state.startingAssessment = true;
  const button = $('#start-assessment');
  const previous = button?.innerHTML;
  if (button) {
    button.disabled = true;
    button.textContent = 'Preparing assessment…';
  }
  setInlineStatus('Generating or selecting validated questions. This can take a few seconds.');

  try {
    const result = await api.startAssessment();
    const assessmentId = result?.assessment?.id || result?.assessment_id || result?.id;
    if (!assessmentId) throw new Error('Assessment API returned no assessment id.');

    sessionStorage.setItem(
      `gyansetu_assessment_${assessmentId}`,
      JSON.stringify({ assessment: result.assessment || null, questions: result.questions || [] }),
    );
    setInlineStatus('Assessment ready. Opening quiz…', 'success');
    window.location.assign(`/assessment.html?id=${encodeURIComponent(assessmentId)}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      window.location.assign('/login.html');
      return;
    }

    if (error instanceof ApiError && (error.status === 404 || error.code === 'ROUTE_NOT_FOUND')) {
      setInlineStatus('Assessment API is not deployed on this branch yet. The dashboard wiring is ready for it.', 'error');
    } else if (error instanceof ApiError && error.code === 'ROLE_NOT_RESOLVED') {
      setInlineStatus('Your profile role does not map to the competency framework yet. Pick/confirm a demo role first.', 'error');
    } else {
      setInlineStatus(error.message || 'Could not start the assessment.', 'error');
    }
  } finally {
    state.startingAssessment = false;
    if (button) {
      button.disabled = false;
      if (previous) button.innerHTML = previous;
    }
  }
}

async function logout() {
  const button = $('#logout-button');
  if (button) button.disabled = true;
  try {
    await api.logout();
  } catch {
    // Session removal on the server is best effort from the UI perspective.
  } finally {
    window.location.assign('/login.html');
  }
}

function bindComingSoon() {
  document.querySelectorAll('[data-coming-soon]').forEach((element) => {
    element.addEventListener('click', (event) => {
      event.preventDefault();
      showToast(`${element.dataset.comingSoon} is the next UI module, not a dead link.`);
    });
  });
}

function bindEvents() {
  $('#start-assessment')?.addEventListener('click', startAssessment);
  $('#logout-button')?.addEventListener('click', logout);
  $('#notification-button')?.addEventListener('click', () => showToast('Notifications module is not connected yet.'));
  $('#learn-more-button')?.addEventListener('click', () => showToast('Project overview page will be connected after the dashboard flow is stable.'));
  bindComingSoon();
}

bindEvents();
loadProfile();
