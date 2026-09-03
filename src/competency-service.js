import competencyFramework from '../sih-ai-learning-platform/mock-db/competency-mockdb-userrole.json' with { type: 'json' };

function normalizeRoleKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function getFramework() {
  return competencyFramework;
}

export function listRoles() {
  return (competencyFramework.roles || []).map((role) => ({
    role_id: role.role_id,
    role_name: role.role_name,
    domain: role.domain || null,
    description: role.description || null,
    competency_count: Array.isArray(role.competencies) ? role.competencies.length : 0,
    sub_competency_count: (role.competencies || []).reduce(
      (total, competency) => total + (Array.isArray(competency.sub_competencies) ? competency.sub_competencies.length : 0),
      0,
    ),
  }));
}

export function findRole(roleIdOrName) {
  const wanted = normalizeRoleKey(roleIdOrName);
  if (!wanted) return null;

  return (
    (competencyFramework.roles || []).find((role) => normalizeRoleKey(role.role_id) === wanted) ||
    (competencyFramework.roles || []).find((role) => normalizeRoleKey(role.role_name) === wanted) ||
    null
  );
}

export function resolveRoleFromCandidates(candidates = []) {
  for (const candidate of candidates) {
    const role = findRole(candidate);
    if (role) return role;
  }
  return null;
}

export function getFrameworkVersion() {
  return String(competencyFramework.framework_version || competencyFramework.version || 'prototype');
}

export function getRequiredLevels(role) {
  const competencyLevels = new Map();
  const subCompetencyLevels = new Map();

  for (const competency of role?.competencies || []) {
    competencyLevels.set(competency.competency_id, Number(competency.required_level || 1));
    for (const sub of competency.sub_competencies || []) {
      subCompetencyLevels.set(sub.sub_competency_id, Number(sub.required_level || competency.required_level || 1));
    }
  }

  return { competencyLevels, subCompetencyLevels };
}
