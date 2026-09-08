const form = document.querySelector('#auth-form');
const identityInput = document.querySelector('#identity');
const passwordInput = document.querySelector('#password');
const submitButton = document.querySelector('#submit-button');
const demoLoginButton = document.querySelector('#demo-login-button');
const statusMessage = document.querySelector('#status-message');
const togglePasswordButton = document.querySelector('#toggle-password');

function setStatus(message = '', type = 'info') {
  if (!statusMessage) return;
  statusMessage.textContent = message;
  statusMessage.className = 'status-message';
  if (message) statusMessage.classList.add('is-visible', `is-${type}`);
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
    togglePasswordButton.classList.toggle('is-showing', show);
    togglePasswordButton.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    togglePasswordButton.setAttribute('title', show ? 'Hide password' : 'Show password');
  });
}

identityInput?.addEventListener('input', () => setFieldError('identity', ''));
passwordInput?.addEventListener('input', () => setFieldError('password', ''));

demoLoginButton?.addEventListener('click', async () => {
  setStatus();
  demoLoginButton.disabled = true;
  if (submitButton) submitButton.disabled = true;
  const label = demoLoginButton.querySelector('span');
  const originalLabel = label?.textContent || 'Continue as Demo';
  if (label) label.textContent = 'Opening demo…';
  setStatus('Starting a protected public demo session…', 'info');

  try {
    const response = await fetch('/api/auth/demo', {
      method: 'POST',
      credentials: 'include',
      headers: { accept: 'application/json' },
    });
    const data = await response.json();
    if (!response.ok) {
      setStatus(data.error || 'Could not start the demo session.', 'error');
      return;
    }
    setStatus('Demo ready. Redirecting…', 'success');
    window.location.replace(data.next || '/dashboard.html');
  } catch {
    setStatus('Could not reach the GyanSetu demo backend.', 'error');
  } finally {
    demoLoginButton.disabled = false;
    if (submitButton) submitButton.disabled = false;
    if (label) label.textContent = originalLabel;
  }
});

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus();
  if (!validate()) return;

  submitButton.disabled = true;
  if (demoLoginButton) demoLoginButton.disabled = true;
  setStatus('Signing in to GyanSetu…', 'info');

  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: identityInput.value.trim(),
        password: passwordInput.value,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      if (response.status === 503 && (data.code === 'DATABASE_NOT_CONFIGURED' || data.code === 'DATABASE_UNREACHABLE' || data.code === 'DATABASE_SCHEMA_MISSING')) {
        setStatus('GyanSetu account services are being connected. Please try again after the database setup is completed.', 'info');
        return;
      }
      setStatus(data.error || 'Sign-in failed.', 'error');
      return;
    }

    setStatus('Signed in. Redirecting…', 'success');
    window.location.replace(data.next || '/onboarding.html');
  } catch {
    setStatus('Could not reach the GyanSetu authentication backend.', 'error');
  } finally {
    submitButton.disabled = false;
    if (demoLoginButton) demoLoginButton.disabled = false;
  }
});