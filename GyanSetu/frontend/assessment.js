import { api, ApiError } from './api-client.js';

const $ = (selector) => document.querySelector(selector);
const assessmentId = new URLSearchParams(window.location.search).get('id');

const state = {
  assessment: null,
  questions: [],
  answers: new Map(),
  index: 0,
  submitting: false,
};

function initials(nameOrEmail) {
  const value = String(nameOrEmail || '').trim();
  if (!value) return 'GS';
  const parts = value.includes('@') ? [value.split('@')[0]] : value.split(/\s+/);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('') || 'GS';
}

function showMessage(message = '', isError = false) {
  const node = $('#assessment-message');
  if (!node) return;
  node.textContent = message;
  node.classList.toggle('is-error', isError);
}

function showToast(message) {
  const toast = $('#dashboard-toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('is-visible');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove('is-visible'), 2600);
}

function redirectToLogin() {
  window.location.assign('/login.html');
}

async function loadIdentity() {
  try {
    const data = await api.profile();
    const name = data?.user?.full_name || data?.user?.email || 'Employee';
    $('#user-chip-name').textContent = name;
    $('#user-avatar').textContent = initials(name);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirectToLogin();
  }
}

function normalizeOptions(question) {
  return Array.isArray(question?.options) ? question.options.map((option) => String(option)) : [];
}

function renderQuestion() {
  const question = state.questions[state.index];
  if (!question) return;

  const total = state.questions.length;
  const answered = state.answers.size;
  $('#question-position').textContent = `Question ${state.index + 1} of ${total}`;
  $('#answered-count').textContent = `${answered} answered`;
  $('#progress-bar').style.width = `${((state.index + 1) / total) * 100}%`;
  $('#question-difficulty').textContent = `${String(question.difficulty || 'diagnostic').toUpperCase()} • ${question.question_id || `Q${state.index + 1}`}`;
  $('#question-text').textContent = question.question || 'Question unavailable.';

  const optionList = $('#option-list');
  optionList.innerHTML = '';
  const selected = state.answers.get(question.question_id) || null;
  const labels = ['A', 'B', 'C', 'D'];

  normalizeOptions(question).forEach((option, optionIndex) => {
    const answer = labels[optionIndex];
    const label = document.createElement('label');
    label.className = `option-row${selected === answer ? ' is-selected' : ''}`;

    const input = document.createElement('input');
    input.type = 'radio';
    input.name = `answer-${question.question_id}`;
    input.value = answer;
    input.checked = selected === answer;
    input.addEventListener('change', () => {
      state.answers.set(question.question_id, answer);
      renderQuestion();
    });

    const letter = document.createElement('span');
    letter.className = 'option-letter';
    letter.textContent = answer;

    const text = document.createElement('span');
    text.className = 'option-text';
    text.textContent = option;

    label.append(input, letter, text);
    optionList.append(label);
  });

  $('#previous-button').disabled = state.index === 0;
  const onLast = state.index === total - 1;
  $('#next-button').classList.toggle('hidden', onLast);
  $('#submit-button').classList.toggle('hidden', !onLast);
  $('#submit-button').disabled = state.submitting;
}

function showQuiz() {
  $('#loading-card').classList.add('hidden');
  $('#result-card').classList.add('hidden');
  $('#quiz-card').classList.remove('hidden');
  $('#assessment-role').textContent = state.assessment?.role_id
    ? `Role: ${state.assessment.role_id}`
    : `${state.questions.length} questions`;
  renderQuestion();
}

function showLoadError(error) {
  const loading = $('#loading-card');
  loading.querySelector('.loading-spinner')?.classList.add('hidden');
  loading.querySelector('h2').textContent = 'Assessment could not be loaded';

  if (error instanceof ApiError && (error.status === 404 || error.code === 'ROUTE_NOT_FOUND')) {
    loading.querySelector('p').textContent = 'The quiz UI is ready, but the assessment API has not been merged/deployed on this branch yet.';
    return;
  }

  loading.querySelector('p').textContent = error.message || 'Unknown assessment loading error.';
}

async function loadAssessment() {
  if (!assessmentId) {
    window.location.assign('/dashboard.html');
    return;
  }

  const cacheKey = `gyansetu_assessment_${assessmentId}`;
  const cached = sessionStorage.getItem(cacheKey);
  if (cached) {
    try {
      const data = JSON.parse(cached);
      if (Array.isArray(data.questions) && data.questions.length) {
        state.assessment = data.assessment || { id: assessmentId };
        state.questions = data.questions;
        showQuiz();
        return;
      }
    } catch {
      sessionStorage.removeItem(cacheKey);
    }
  }

  try {
    const data = await api.assessment(assessmentId);
    state.assessment = data.assessment || { id: assessmentId };
    state.questions = Array.isArray(data.questions) ? data.questions : [];
    if (!state.questions.length) throw new Error('Assessment contains no questions.');
    showQuiz();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirectToLogin();
      return;
    }
    showLoadError(error);
  }
}

function nextQuestion() {
  if (state.index >= state.questions.length - 1) return;
  state.index += 1;
  showMessage('');
  renderQuestion();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function previousQuestion() {
  if (state.index <= 0) return;
  state.index -= 1;
  showMessage('');
  renderQuestion();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderResult(result) {
  $('#quiz-card').classList.add('hidden');
  $('#loading-card').classList.add('hidden');
  $('#result-card').classList.remove('hidden');

  const score = Number(result.overall_score || 0);
  $('#result-score').textContent = `${Math.round(score)}%`;
  $('#result-correct').textContent = `${result.total_correct ?? 0} / ${result.total_questions ?? state.questions.length}`;
  $('#result-gap-status').textContent = result.gap_mapping_status === 'mapping_required'
    ? 'Awaiting score → proficiency mapping'
    : (result.gap_mapping_status || 'Calculated');

  sessionStorage.removeItem(`gyansetu_assessment_${assessmentId}`);
}

async function submitAssessment() {
  if (state.submitting) return;
  if (state.answers.size !== state.questions.length) {
    const firstUnanswered = state.questions.findIndex((question) => !state.answers.has(question.question_id));
    if (firstUnanswered >= 0) state.index = firstUnanswered;
    showMessage(`Answer all ${state.questions.length} questions before submitting.`, true);
    renderQuestion();
    return;
  }

  state.submitting = true;
  $('#submit-button').disabled = true;
  $('#submit-button').textContent = 'Submitting…';
  showMessage('Scoring is being calculated by the backend.');

  const answers = state.questions.map((question) => ({
    question_id: question.question_id,
    selected_answer: state.answers.get(question.question_id),
  }));

  try {
    const result = await api.submitAssessment(assessmentId, answers);
    renderResult(result);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirectToLogin();
      return;
    }
    showMessage(error.message || 'Could not submit assessment.', true);
  } finally {
    state.submitting = false;
    $('#submit-button').disabled = false;
    $('#submit-button').textContent = 'Submit Assessment';
  }
}

async function logout() {
  try { await api.logout(); } catch { /* best effort */ }
  redirectToLogin();
}

function bindEvents() {
  $('#previous-button')?.addEventListener('click', previousQuestion);
  $('#next-button')?.addEventListener('click', nextQuestion);
  $('#submit-button')?.addEventListener('click', submitAssessment);
  $('#logout-button')?.addEventListener('click', logout);
  document.querySelectorAll('[data-coming-soon]').forEach((node) => {
    node.addEventListener('click', (event) => {
      event.preventDefault();
      showToast(`${node.dataset.comingSoon} will use this same application shell.`);
    });
  });
}

bindEvents();
loadIdentity();
loadAssessment();
