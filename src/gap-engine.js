export function buildGapAnalysis({ subCompetencyResults, requiredLevels, scoreToLevel = null }) {
  if (!Array.isArray(subCompetencyResults)) {
    throw new TypeError('subCompetencyResults must be an array.');
  }

  const entries = subCompetencyResults.map((result) => {
    const requiredLevel = Number(requiredLevels?.get(result.sub_competency_id) || 1);
    const currentScore = Number(result.score_percentage || 0);

    if (typeof scoreToLevel !== 'function') {
      return {
        competency_id: result.competency_id,
        sub_competency_id: result.sub_competency_id,
        required_level: requiredLevel,
        current_score: currentScore,
        current_level: null,
        gap_status: 'mapping_required',
      };
    }

    const currentLevel = Number(scoreToLevel(currentScore));
    if (!Number.isInteger(currentLevel) || currentLevel < 1 || currentLevel > 4) {
      throw new Error('scoreToLevel must return an integer from 1 to 4.');
    }

    let gapStatus = 'met';
    if (currentLevel < requiredLevel) gapStatus = 'gap';
    else if (currentLevel > requiredLevel) gapStatus = 'exceeded';

    return {
      competency_id: result.competency_id,
      sub_competency_id: result.sub_competency_id,
      required_level: requiredLevel,
      current_score: currentScore,
      current_level: currentLevel,
      gap_status: gapStatus,
    };
  });

  return entries.sort((a, b) => {
    if (a.gap_status === 'gap' && b.gap_status !== 'gap') return -1;
    if (b.gap_status === 'gap' && a.gap_status !== 'gap') return 1;
    return a.current_score - b.current_score;
  });
}
