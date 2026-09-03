export function recommendCourses({ gaps, courses, limit = 5 }) {
  if (!Array.isArray(gaps) || !Array.isArray(courses)) {
    throw new TypeError('gaps and courses must be arrays.');
  }

  const actionable = gaps.filter((gap) => gap.gap_status === 'gap');
  if (actionable.length === 0) return [];

  const gapWeights = new Map();
  actionable.forEach((gap, index) => {
    const severity = Math.max(1, Number(gap.required_level || 1) - Number(gap.current_level || 1));
    const rankBoost = Math.max(1, actionable.length - index);
    gapWeights.set(gap.sub_competency_id, severity * 10 + rankBoost);
  });

  return courses
    .map((course) => {
      const tags = Array.isArray(course.sub_competency_ids) ? course.sub_competency_ids : [];
      const matched = tags.filter((tag) => gapWeights.has(tag));
      const score = matched.reduce((sum, tag) => sum + gapWeights.get(tag), 0);
      return {
        ...course,
        recommendation_score: score,
        matched_sub_competencies: matched,
      };
    })
    .filter((course) => course.recommendation_score > 0)
    .sort((a, b) => {
      if (b.recommendation_score !== a.recommendation_score) {
        return b.recommendation_score - a.recommendation_score;
      }
      return String(a.course_id || a.title || '').localeCompare(String(b.course_id || b.title || ''));
    })
    .slice(0, Math.max(0, Number(limit) || 0));
}
