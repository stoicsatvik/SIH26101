const form = document.querySelector('#register-form');
const status = document.querySelector('#register-status');

function show(message, type = 'info') {
  status.textContent = message;
  status.className = `status-message is-visible is-${type}`;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const fullName = document.querySelector('#full-name').value.trim();
  const email = document.querySelector('#register-email').value.trim();
  const password = document.querySelector('#register-password').value;

  try {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fullName, email, password }),
    });
    const data = await response.json();
    if (!response.ok) return show(data.error || 'Registration failed.', 'error');
    window.location.assign(data.next || '/onboarding.html');
  } catch {
    show('Could not reach the backend.', 'error');
  }
});
