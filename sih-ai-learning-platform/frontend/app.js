const AUTH_CONFIG = {
  mode: "mock",
  workosStartUrl: "/auth/login",
  demoOtp: "123456",
};

const state = {
  loginMode: "password",
  otpRequested: false,
};

const form = document.querySelector("#auth-form");
const tabs = [...document.querySelectorAll(".auth-tab")];
const identityInput = document.querySelector("#identity");
const identityLabel = document.querySelector("#identity-label");
const passwordField = document.querySelector("#password-field");
const passwordInput = document.querySelector("#password");
const passwordMeta = document.querySelector("#password-meta");
const otpField = document.querySelector("#otp-field");
const otpInput = document.querySelector("#otp");
const otpHint = document.querySelector("#otp-hint");
const submitButton = document.querySelector("#submit-button");
const submitLabel = submitButton.querySelector("span");
const statusMessage = document.querySelector("#status-message");
const togglePasswordButton = document.querySelector("#toggle-password");
const parichayButton = document.querySelector("#parichay-button");
const forgotPasswordButton = document.querySelector("#forgot-password");

function setStatus(message = "", type = "info") {
  statusMessage.textContent = message;
  statusMessage.className = "status-message";

  if (!message) return;

  statusMessage.classList.add("is-visible", `is-${type}`);
}

function setFieldError(fieldId, message = "") {
  const field = document.querySelector(`#${fieldId}-field`) || document.querySelector(`[for="${fieldId}"]`);
  const error = document.querySelector(`#${fieldId}-error`);

  if (error) error.textContent = message;
  if (field) field.classList.toggle("has-error", Boolean(message));
}

function clearErrors() {
  ["identity", "password", "otp"].forEach((field) => setFieldError(field, ""));
  setStatus();
}

function updateMode(mode) {
  state.loginMode = mode;
  state.otpRequested = false;
  clearErrors();

  tabs.forEach((tab) => {
    const active = tab.dataset.mode === mode;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  });

  const isPassword = mode === "password";
  passwordField.classList.toggle("is-hidden", !isPassword);
  passwordMeta.classList.toggle("is-hidden", !isPassword);
  otpField.classList.add("is-hidden");

  identityLabel.textContent = isPassword
    ? "Official email or employee ID"
    : "Official email or mobile number";
  identityInput.placeholder = isPassword
    ? "name@department.gov.in"
    : "Email or +91 mobile number";

  submitLabel.textContent = isPassword ? "Log in" : "Request OTP";
  otpInput.value = "";
  otpHint.textContent = "Prototype OTP will be shown here after requesting it.";
}

function validateIdentity() {
  const identity = identityInput.value.trim();

  if (!identity) {
    setFieldError("identity", "Enter your official email, employee ID, or mobile number.");
    return false;
  }

  if (identity.length < 4) {
    setFieldError("identity", "That identifier looks too short.");
    return false;
  }

  setFieldError("identity", "");
  return true;
}

function validatePassword() {
  if (!passwordInput.value) {
    setFieldError("password", "Enter your password.");
    return false;
  }

  if (passwordInput.value.length < 6) {
    setFieldError("password", "Use at least 6 characters for this prototype.");
    return false;
  }

  setFieldError("password", "");
  return true;
}

function validateOtp() {
  const otp = otpInput.value.trim();

  if (!/^\d{6}$/.test(otp)) {
    setFieldError("otp", "Enter the 6-digit OTP.");
    return false;
  }

  if (otp !== AUTH_CONFIG.demoOtp) {
    setFieldError("otp", "Incorrect prototype OTP. Use 123456.");
    return false;
  }

  setFieldError("otp", "");
  return true;
}

function handOffToWorkOS() {
  const returnTo = encodeURIComponent(window.location.href);
  window.location.assign(`${AUTH_CONFIG.workosStartUrl}?returnTo=${returnTo}`);
}

function completeMockLogin(method) {
  submitButton.disabled = true;
  setStatus(`Prototype ${method} login validated. WorkOS will replace this client-side handoff.`, "success");

  window.setTimeout(() => {
    submitButton.disabled = false;
  }, 900);
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => updateMode(tab.dataset.mode));
});

togglePasswordButton.addEventListener("click", () => {
  const reveal = passwordInput.type === "password";
  passwordInput.type = reveal ? "text" : "password";
  togglePasswordButton.setAttribute("aria-label", reveal ? "Hide password" : "Show password");
});

identityInput.addEventListener("input", () => setFieldError("identity", ""));
passwordInput.addEventListener("input", () => setFieldError("password", ""));
otpInput.addEventListener("input", () => {
  otpInput.value = otpInput.value.replace(/\D/g, "").slice(0, 6);
  setFieldError("otp", "");
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  clearErrors();

  if (AUTH_CONFIG.mode === "workos") {
    handOffToWorkOS();
    return;
  }

  if (!validateIdentity()) return;

  if (state.loginMode === "password") {
    if (!validatePassword()) return;
    completeMockLogin("password");
    return;
  }

  if (!state.otpRequested) {
    state.otpRequested = true;
    otpField.classList.remove("is-hidden");
    otpHint.textContent = `Prototype OTP: ${AUTH_CONFIG.demoOtp}`;
    submitLabel.textContent = "Verify & log in";
    otpInput.focus();
    setStatus("OTP generated locally for UI testing. No message was sent.", "info");
    return;
  }

  if (!validateOtp()) return;
  completeMockLogin("OTP");
});

parichayButton.addEventListener("click", () => {
  if (AUTH_CONFIG.mode === "workos") {
    handOffToWorkOS();
    return;
  }

  setStatus("Parichay is a visual placeholder in this prototype. Route this button through your WorkOS/Cloudflare SSO handler during integration.", "info");
});

forgotPasswordButton.addEventListener("click", () => {
  setStatus("Password recovery is intentionally disabled until the identity provider is connected.", "info");
});

updateMode("password");
