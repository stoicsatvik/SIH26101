const form = document.querySelector('#register-form');
const status = document.querySelector('#register-status');
const progressStepper = document.querySelector('.progress-stepper');
const progressSteps = [...document.querySelectorAll('[data-progress-step]')];
const formSteps = [...document.querySelectorAll('[data-step]')];
const jurisdictionButtons = [...document.querySelectorAll('[data-jurisdiction]')];
const ministrySelect = document.querySelector('#ministry-select');
const organisationSelect = document.querySelector('#organisation-select');
const designationSelect = document.querySelector('#designation-select');
const emailInput = document.querySelector('#register-email');
const sendOtpButton = document.querySelector('#send-otp-button');
const otpPanel = document.querySelector('#demo-otp-panel');
const otpCodeLabel = document.querySelector('#demo-otp-code');
const otpInput = document.querySelector('#email-otp');
const verifyOtpButton = document.querySelector('#verify-otp-button');
const verificationCard = document.querySelector('#email-verification-card');
const verificationState = document.querySelector('#email-verification-state');
const continueButton = document.querySelector('#continue-step-two');
const backButton = document.querySelector('#back-step-one');
const helpButton = document.querySelector('#organisation-help');

const directory = {
  Center: {
    'Ministry of Statistics and Programme Implementation': [
      'National Statistical Office',
      'Central Statistics Office',
      'Survey Coordination Division',
    ],
    'Ministry of Personnel, Public Grievances and Pensions': [
      'Department of Personnel and Training',
      'Capacity Building Commission',
    ],
    'Ministry of Finance': [
      'Department of Economic Affairs',
      'Department of Expenditure',
    ],
    'Ministry of Electronics and Information Technology': [
      'Digital India Corporation',
      'National Informatics Centre',
    ],
  },
  State: {
    'Government of Maharashtra': [
      'Directorate of Economics and Statistics, Maharashtra',
      'General Administration Department, Maharashtra',
    ],
    'Government of Karnataka': [
      'Directorate of Economics and Statistics, Karnataka',
      'Department of Personnel and Administrative Reforms, Karnataka',
    ],
    'Government of Delhi': [
      'Directorate of Economics and Statistics, Delhi',
      'Services Department, Delhi',
    ],
    'Government of Tamil Nadu': [
      'Department of Economics and Statistics, Tamil Nadu',
      'Human Resources Management Department, Tamil Nadu',
    ],
  },
};

const designations = [
  'Statistical Officer',
  'Senior Statistical Officer',
  'Assistant Director',
  'Deputy Director',
  'Joint Director',
  'Director',
  'Section Officer',
  'Under Secretary',
  'Deputy Secretary',
  'Other',
];

const state = {
  jurisdiction: 'Center',
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
  select.innerHTML = `<option value="">${placeholder}</option>`;
  values.forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
}

function updateDirectory() {
  const ministries = Object.keys(directory[state.jurisdiction]);
  fillSelect(ministrySelect, ministries, state.jurisdiction === 'Center' ? 'Select ministry' : 'Select state department');
  fillSelect(organisationSelect, [], 'Select organisation');
  organisationSelect.disabled = true;
}

function updateOrganisations() {
  const selectedMinistry = ministrySelect.value;
  const organisations = directory[state.jurisdiction][selectedMinistry] || [];
  fillSelect(organisationSelect, organisations, 'Select organisation');
  organisationSelect.disabled = organisations.length === 0;
  updateContinueState();
}

function resetEmailVerification() {
  state.otp = null;
  state.emailVerified = false;
  state.verifiedEmail = '';
  otpPanel.hidden = true;
  otpInput.value = '';
  otpCodeLabel.textContent = '------';
  verificationCard.classList.remove('is-verified');
  verificationState.textContent = 'Not verified';
  updateContinueState();
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function looksLikeGovernmentEmail(email) {
  const normalized = email.toLowerCase();
  return /@(gov\.in|nic\.in)$/.test(normalized) || /\.(gov|nic)\.in$/.test(normalized);
}

function generateOtp() {
  const random = new Uint32Array(1);
  crypto.getRandomValues(random);
  return String(100000 + (random[0] % 900000));
}

function stepOneReady() {
  return Boolean(
    ministrySelect.value &&
    organisationSelect.value &&
    designationSelect.value &&
    state.emailVerified &&
    state.verifiedEmail === emailInput.value.trim().toLowerCase()
  );
}

function updateContinueState() {
  continueButton.disabled = !stepOneReady();
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

  progressStepper.classList.toggle('is-step-two', stepNumber === 2);
  show();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

jurisdictionButtons.forEach((button) => {
  button.addEventListener('click', () => {
    state.jurisdiction = button.dataset.jurisdiction;
    jurisdictionButtons.forEach((item) => {
      const selected = item === button;
      item.classList.toggle('is-selected', selected);
      item.setAttribute('aria-pressed', String(selected));
    });
    updateDirectory();
  });
});

ministrySelect.addEventListener('change', updateOrganisations);
organisationSelect.addEventListener('change', updateContinueState);
designationSelect.addEventListener('change', updateContinueState);

emailInput.addEventListener('input', () => {
  if (emailInput.value.trim().toLowerCase() !== state.verifiedEmail) resetEmailVerification();
});

sendOtpButton.addEventListener('click', () => {
  const email = emailInput.value.trim().toLowerCase();
  if (!validEmail(email)) return show('Enter a valid email address before requesting an OTP.', 'error');

  state.otp = generateOtp();
  state.emailVerified = false;
  state.verifiedEmail = '';
  otpCodeLabel.textContent = state.otp;
  otpPanel.hidden = false;
  verificationCard.classList.remove('is-verified');
  verificationState.textContent = 'OTP sent';

  if (looksLikeGovernmentEmail(email)) {
    show('Demo OTP generated. In the production integration this would be delivered to the government email.', 'info');
  } else {
    show('Demo OTP generated. Official iGOT self-registration normally requires an eligible government email or MDO onboarding.', 'info');
  }

  otpInput.focus();
});

verifyOtpButton.addEventListener('click', () => {
  if (!state.otp) return show('Request an OTP first.', 'error');
  if (otpInput.value.trim() !== state.otp) return show('That OTP does not match the generated demo code.', 'error');

  state.emailVerified = true;
  state.verifiedEmail = emailInput.value.trim().toLowerCase();
  verificationCard.classList.add('is-verified');
  verificationState.textContent = 'Verified';
  show('Email verified for this prototype session.', 'success');
  updateContinueState();
});

continueButton.addEventListener('click', () => {
  if (!stepOneReady()) return show('Complete the organisation details and verify the email before continuing.', 'error');
  setStep(2);
});

backButton.addEventListener('click', () => setStep(1));

helpButton.addEventListener('click', () => {
  show('Prototype note: MDO help routing is not connected yet. For the demo, select the closest available organisation.', 'info');
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  show();

  if (!stepOneReady()) {
    setStep(1);
    return show('Please finish Step 1 first.', 'error');
  }

  const fullName = document.querySelector('#full-name').value.trim();
  const group = document.querySelector('#group-select').value;
  const mobile = document.querySelector('#mobile-number').value.trim();
  const password = document.querySelector('#register-password').value;
  const declarationAccepted = document.querySelector('#declaration-checkbox').checked;

  if (!fullName) return show('Enter your full name.', 'error');
  if (!group) return show('Select your group.', 'error');
  if (password.length < 10) return show('Password must be at least 10 characters.', 'error');
  if (!declarationAccepted) return show('Confirm the declaration before creating the account.', 'error');

  const registrationContext = {
    jurisdiction: state.jurisdiction,
    ministryOrDepartment: ministrySelect.value,
    organisation: organisationSelect.value,
    designation: designationSelect.value,
    group,
    mobile,
    email: state.verifiedEmail,
    emailVerifiedInPrototype: true,
  };

  sessionStorage.setItem('sih_registration_context', JSON.stringify(registrationContext));

  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  show('Creating your prototype account…', 'info');

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

fillSelect(designationSelect, designations, 'Select designation');
updateDirectory();
updateContinueState();
