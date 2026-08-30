const form = document.querySelector('#register-form');
const status = document.querySelector('#register-status');
const progressStepper = document.querySelector('.progress-stepper');
const progressSteps = [...document.querySelectorAll('[data-progress-step]')];
const formSteps = [...document.querySelectorAll('[data-step]')];
const organisationSelect = document.querySelector('#organisation-select');
const designationSelect = document.querySelector('#designation-select');
const emailInput = document.querySelector('#register-email');
const sendOtpButton = document.querySelector('#send-otp-button');
const otpPanel = document.querySelector('#demo-otp-panel');
const otpCodeLabel = document.querySelector('#demo-otp-code');
const otpInput = document.querySelector('#email-otp');
const verifyOtpButton = document.querySelector('#verify-otp-button');
const verificationState = document.querySelector('#email-verification-state');
const continueButton = document.querySelector('#continue-step-two');
const backButton = document.querySelector('#back-step-one');
const storyStepOne = document.querySelector('#register-story-step-one');
const storyStepTwo = document.querySelector('#register-story-step-two');

const organisations = [
  'National Statistical Office (NSO)',
  'Central Statistics Office (CSO)',
  'Survey Coordination Division',
  'Data Informatics & Innovation Division',
  'Field Operations Division',
  'Other MoSPI Unit',
];

const designations = [
  'Field Enumerator',
  'Statistical Officer',
  'Senior Statistical Officer',
  'Data Analyst',
  'Data Supervisor',
  'Assistant Director',
  'Deputy Director',
  'Joint Director',
  'Director',
  'Other',
];

const state = {
  otp: null,
  emailVerified: false,
  verifiedEmail: '',
};

function show(message = '', type = 'info') {
  if (!status) return;
  status.textContent = message;
  status.className = 'status-message';
  if (message) status.classList.add('is-visible', `is-${type}`);
}

function fillSelect(select, values, placeholder) {
  if (!select) return;
  select.innerHTML = `<option value="">${placeholder}</option>`;
  values.forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function generateOtp() {
  const random = new Uint32Array(1);
  crypto.getRandomValues(random);
  return String(100000 + (random[0] % 900000));
}

function resetEmailVerification() {
  state.otp = null;
  state.emailVerified = false;
  state.verifiedEmail = '';
  if (otpPanel) otpPanel.hidden = true;
  if (otpInput) otpInput.value = '';
  if (otpCodeLabel) otpCodeLabel.textContent = '------';
  if (verificationState) verificationState.textContent = 'Not verified';
  updateContinueState();
}

function stepOneReady() {
  return Boolean(
    organisationSelect?.value &&
    designationSelect?.value &&
    state.emailVerified &&
    state.verifiedEmail === emailInput?.value.trim().toLowerCase()
  );
}

function updateContinueState() {
  if (continueButton) continueButton.disabled = !stepOneReady();
}

function setStep(stepNumber) {
  formSteps.forEach((step) => {
    const active = Number(step.dataset.step) === stepNumber;
    step.hidden = !active;
    step.classList.toggle('is-active', active);
  });

  progressSteps.forEach((step) => {
    const number = Number(step.dataset.progressStep);
    step.classList.toggle('is-active', number === stepNumber);
    step.classList.toggle('is-complete', number < stepNumber);
  });

  progressStepper?.classList.toggle('is-step-two', stepNumber === 2);
  document.body.dataset.registerStep = String(stepNumber);
  if (storyStepOne) storyStepOne.hidden = stepNumber !== 1;
  if (storyStepTwo) storyStepTwo.hidden = stepNumber !== 2;
  show();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

organisationSelect?.addEventListener('change', updateContinueState);
designationSelect?.addEventListener('change', updateContinueState);

emailInput?.addEventListener('input', () => {
  if (emailInput.value.trim().toLowerCase() !== state.verifiedEmail) resetEmailVerification();
});

sendOtpButton?.addEventListener('click', () => {
  const email = emailInput.value.trim().toLowerCase();
  if (!validEmail(email)) return show('Enter a valid email address before requesting an OTP.', 'error');

  state.otp = generateOtp();
  state.emailVerified = false;
  state.verifiedEmail = '';
  otpCodeLabel.textContent = state.otp;
  otpPanel.hidden = false;
  verificationState.textContent = 'OTP generated';
  show('Demo OTP generated. In production this will be delivered through the configured email service.', 'info');
  otpInput.focus();
});

verifyOtpButton?.addEventListener('click', () => {
  if (!state.otp) return show('Request an OTP first.', 'error');
  if (otpInput.value.trim() !== state.otp) return show('That OTP does not match the generated demo code.', 'error');

  state.emailVerified = true;
  state.verifiedEmail = emailInput.value.trim().toLowerCase();
  verificationState.textContent = 'Verified';
  show('Email verified for this prototype session.', 'success');
  updateContinueState();
});

continueButton?.addEventListener('click', () => {
  if (!stepOneReady()) return show('Select your organisation and designation, then verify the email before continuing.', 'error');
  setStep(2);
});

backButton?.addEventListener('click', () => setStep(1));

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  show();

  if (!stepOneReady()) {
    setStep(1);
    return show('Please finish Step 1 first.', 'error');
  }

  const fullName = document.querySelector('#full-name')?.value.trim() || '';
  const employeeId = document.querySelector('#employee-id')?.value.trim() || '';
  const mobile = document.querySelector('#mobile-number')?.value.trim() || '';
  const password = document.querySelector('#register-password')?.value || '';
  const confirmPassword = document.querySelector('#confirm-password')?.value || '';

  if (!fullName) return show('Enter your full name.', 'error');
  if (!employeeId) return show('Enter your employee / personnel ID.', 'error');
  if (!/^\d{10}$/.test(mobile.replace(/\D/g, ''))) return show('Enter a valid 10-digit mobile number.', 'error');
  if (password.length < 10) return show('Password must be at least 10 characters.', 'error');
  if (password !== confirmPassword) return show('Password and confirm password do not match.', 'error');

  const registrationContext = {
    jurisdiction: 'Center',
    ministryOrDepartment: 'Ministry of Statistics & Programme Implementation (MoSPI)',
    organisation: organisationSelect.value,
    designation: designationSelect.value,
    employeeId,
    mobile,
    group: 'Other / Not applicable',
    email: state.verifiedEmail,
    emailVerifiedInPrototype: true,
  };

  sessionStorage.setItem('sih_registration_context', JSON.stringify(registrationContext));

  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  show('Creating your GyanSetu prototype account…', 'info');

  try {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        fullName,
        email: state.verifiedEmail,
        password,
        registrationContext,
      }),
    });
    const data = await response.json();
    if (!response.ok) return show(data.error || 'Registration failed.', 'error');
    show('Account created. Opening profile setup…', 'success');
    window.location.assign(data.next || '/onboarding.html');
  } catch {
    show('Could not reach the backend.', 'error');
  } finally {
    submitButton.disabled = false;
  }
});

fillSelect(organisationSelect, organisations, 'Select organisation');
fillSelect(designationSelect, designations, 'Select designation');
updateContinueState();
setStep(1);
