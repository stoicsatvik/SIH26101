const educationList = document.querySelector('#education-list');
const experienceList = document.querySelector('#experience-list');
const courseList = document.querySelector('#course-list');
const skillList = document.querySelector('#skill-list');
const form = document.querySelector('#onboarding-form');
const statusBox = document.querySelector('#onboarding-status');
const roleSelect = document.querySelector('#role-id');
const roleDescription = document.querySelector('#role-description');
let roles = [];

function itemCard(kind, fields) {
  const article = document.createElement('article');
  article.className = 'repeat-card'; article.dataset.kind = kind;
  article.innerHTML = `<button type="button" class="remove-row" aria-label="Remove">×</button><div class="form-grid two-col">${fields}</div>`;
  article.querySelector('.remove-row').addEventListener('click', () => article.remove()); return article;
}
function addEducation() { educationList.append(itemCard('education', `<label>Qualification level<input data-key="qualificationLevel" placeholder="Bachelor's, Master's, Diploma..." /></label><label>Degree / certificate<input data-key="degreeOrCertificate" placeholder="B.Sc. Statistics" /></label><label>Field of study<input data-key="fieldOfStudy" /></label><label>Institution<input data-key="institution" /></label><label>Start year<input data-key="startYear" type="number" min="1950" max="2100" /></label><label>End year<input data-key="endYear" type="number" min="1950" max="2100" /></label>`)); }
function addExperience() { experienceList.append(itemCard('experience', `<label>Organisation<input data-key="organization" /></label><label>Designation<input data-key="designation" /></label><label>Department<input data-key="department" /></label><label>Start date<input data-key="startDate" type="date" /></label><label>End date<input data-key="endDate" type="date" /></label><label>Responsibilities<input data-key="responsibilities" /></label>`)); }
function addCourse() { courseList.append(itemCard('course', `<label>Course title<input data-key="courseTitle" /></label><label>Provider<input data-key="provider" placeholder="iGOT, institute, university..." /></label><label>Completion date<input data-key="completionDate" type="date" /></label><label>Score %<input data-key="score" type="number" min="0" max="100" step="0.1" /></label>`)); }
function addSkill() { skillList.append(itemCard('skill', `<label>Skill<input data-key="skillName" placeholder="Python, sampling, SQL..." /></label><label>Self-rated level (0–5)<input data-key="level" type="number" min="0" max="5" step="0.5" /></label>`)); }
function readCards(container) { return [...container.querySelectorAll('.repeat-card')].map((card) => { const result = {}; card.querySelectorAll('[data-key]').forEach((input) => { result[input.dataset.key] = input.type === 'checkbox' ? input.checked : input.value.trim(); }); return result; }); }
function show(message, type = 'info') { statusBox.textContent = message; statusBox.className = `status-message is-visible is-${type}`; }
function applyRegistrationContext() {
  try {
    const raw = sessionStorage.getItem('sih_registration_context'); if (!raw) return; const context = JSON.parse(raw);
    if (context.designation) document.querySelector('#designation').value = context.designation;
    if (context.ministryOrDepartment) document.querySelector('#department').value = context.ministryOrDepartment;
    if (context.organisation) document.querySelector('#organization').value = context.organisation;
    const firstExperience = experienceList.querySelector('.repeat-card');
    if (firstExperience) {
      if (context.organisation) firstExperience.querySelector('[data-key="organization"]').value = context.organisation;
      if (context.designation) firstExperience.querySelector('[data-key="designation"]').value = context.designation;
      if (context.ministryOrDepartment) firstExperience.querySelector('[data-key="department"]').value = context.ministryOrDepartment;
    }
  } catch { sessionStorage.removeItem('sih_registration_context'); }
}
function renderRoleDescription() { const role = roles.find((item) => item.role_id === roleSelect.value); roleDescription.textContent = role ? `${role.role_name} · ${role.domain}. ${role.description}` : ''; }
async function loadRoles() {
  roleSelect.disabled = true;
  try {
    const response = await fetch('/api/competency/roles'); if (response.status === 401) return location.assign('/login.html'); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not load roles.');
    roles = data.roles || []; roleSelect.innerHTML = '<option value="">Select role</option>' + roles.map((role) => `<option value="${role.role_id}">${role.role_name} — ${role.domain}</option>`).join('');
  } catch (error) { roleSelect.innerHTML = '<option value="">Role service unavailable</option>'; show(error.message || 'Could not load competency roles.', 'error'); }
  finally { roleSelect.disabled = false; }
}
roleSelect.addEventListener('change', renderRoleDescription);
document.querySelector('#add-education').addEventListener('click', addEducation); document.querySelector('#add-experience').addEventListener('click', addExperience); document.querySelector('#add-course').addEventListener('click', addCourse); document.querySelector('#add-skill').addEventListener('click', addSkill);
addEducation(); addExperience(); addCourse(); addSkill(); applyRegistrationContext();
form.addEventListener('submit', async (event) => {
  event.preventDefault(); if (!roleSelect.value) return show('Select the role that should drive this employee’s competency assessment.', 'error');
  const payload = { profile: { roleId: roleSelect.value, employmentStatus: document.querySelector('#employment-status').value, yearsExperience: document.querySelector('#years-experience').value, currentJobTitle: document.querySelector('#current-job-title').value.trim(), designation: document.querySelector('#designation').value.trim(), department: document.querySelector('#department').value.trim(), organization: document.querySelector('#organization').value.trim(), currentRoleSummary: document.querySelector('#current-role-summary').value.trim(), targetRole: document.querySelector('#target-role').value.trim() }, education: readCards(educationList), experience: readCards(experienceList), completedCourses: readCards(courseList), skills: readCards(skillList) };
  try {
    show('Saving profile and preparing your baseline assessment…', 'info'); const response = await fetch('/api/profile', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }); const data = await response.json();
    if (response.status === 401) return location.assign('/login.html'); if (!response.ok) return show(data.error || 'Could not save profile.', 'error'); sessionStorage.removeItem('sih_registration_context'); location.assign(data.next || '/assessment.html');
  } catch { show('Could not reach the backend.', 'error'); }
});
(async () => { try { const response = await fetch('/api/auth/me'); if (response.status === 401) return location.assign('/login.html'); await loadRoles(); } catch { show('Backend connection is not ready yet.', 'error'); } })();
