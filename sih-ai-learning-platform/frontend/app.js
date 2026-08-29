const form = document.querySelector('#auth-form');
const identityInput = document.querySelector('#identity');
const passwordInput = document.querySelector('#password');
const submitButton = document.querySelector('#submit-button');
const statusMessage = document.querySelector('#status-message');
const togglePasswordButton = document.querySelector('#toggle-password');

function setStatus(message = '', type = 'info') {
  if (!statusMessage) return;
  statusMessage.textContent = message;
  statusMessage.className = 'status-message';
  if (message) statusMessage.classList.add('is-visible', `is-${type}`);
}

function friendlyApiError(message = '') {
  const text = String(message || '');

  if (text.includes('DATABASE_URL') || text.toLowerCase().includes('database is not configured')) {
    return {
      message: 'Prototype account storage is being connected. Sign-in will be available as soon as database setup finishes.',
      type: 'info',
    };
  }

  if (text.toLowerCase().includes('schema') || text.toLowerCase().includes('app_users')) {
    return {
      message: 'The prototype database is connected but still completing account setup. Please retry shortly.',
      type: 'info',
    };
  }

  return { message: text || 'Sign-in failed.', type: 'error' };
}

function setFieldError(fieldId, message = '') {
  const field = document.querySelector(`[for="${fieldId}"]`);
  const error = document.querySelector(`#${fieldId}-error`);
  if (error) error.textContent = message;
  if (field) field.classList.toggle('has-error', Boolean(message));
}

function validate() {
  const email = identityInput.value.trim();
  const password = passwordInput.value;
  let ok = true;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setFieldError('identity', 'Enter a valid email address.');
    ok = false;
  } else setFieldError('identity', '');

  if (!password) {
    setFieldError('password', 'Enter your prototype account password.');
    ok = false;
  } else setFieldError('password', '');

  return ok;
}

if (togglePasswordButton) {
  togglePasswordButton.addEventListener('click', () => {
    const show = passwordInput.type === 'password';
    passwordInput.type = show ? 'text' : 'password';
    togglePasswordButton.textContent = show ? 'Hide' : 'Show';
    togglePasswordButton.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });
}

identityInput?.addEventListener('input', () => setFieldError('identity', ''));
passwordInput?.addEventListener('input', () => setFieldError('password', ''));

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus();
  if (!validate()) return;

  submitButton.disabled = true;
  setStatus('Signing in…', 'info');

  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: identityInput.value.trim(),
        password: passwordInput.value,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      const friendly = friendlyApiError(data.error);
      setStatus(friendly.message, friendly.type);
      return;
    }

    setStatus('Signed in. Redirecting…', 'success');
    window.location.assign(data.next || '/onboarding.html');
  } catch {
    setStatus('The authentication service is temporarily unavailable. Please retry in a moment.', 'error');
  } finally {
    submitButton.disabled = false;
  }
});
