const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_MODEL = 'openrouter/free';

function requiredApiKey(apiKey) {
  const value = String(apiKey || '').trim();
  if (!value) throw new Error('OPENROUTER_API_KEY is not configured.');
  return value;
}

export async function getOpenRouterKeyStatus({ apiKey, fetchImpl = fetch }) {
  const key = requiredApiKey(apiKey);
  const response = await fetchImpl(`${OPENROUTER_BASE_URL}/key`, {
    headers: { Authorization: `Bearer ${key}` },
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message = data?.error?.message || data?.error || `OpenRouter returned HTTP ${response.status}.`;
    return { ok: false, status: response.status, error: String(message) };
  }

  return {
    ok: true,
    status: response.status,
    usage: data?.data?.usage ?? data?.usage ?? null,
    limit_remaining: data?.data?.limit_remaining ?? data?.limit_remaining ?? null,
  };
}

export function buildQuestionResponseSchema(questionCount) {
  return {
    type: 'json_schema',
    json_schema: {
      name: 'gyansetu_assessment_questions',
      strict: true,
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['questions'],
        properties: {
          questions: {
            type: 'array',
            minItems: questionCount,
            maxItems: questionCount,
            items: {
              type: 'object',
              additionalProperties: false,
              required: [
                'question_id',
                'question',
                'options',
                'correct_answer',
                'competency_id',
                'sub_competency_id',
                'difficulty',
                'explanation',
              ],
              properties: {
                question_id: { type: 'string', minLength: 1 },
                question: { type: 'string', minLength: 8 },
                options: {
                  type: 'array',
                  minItems: 4,
                  maxItems: 4,
                  items: { type: 'string', minLength: 1 },
                },
                correct_answer: { type: 'string', enum: ['A', 'B', 'C', 'D'] },
                competency_id: { type: 'string', minLength: 1 },
                sub_competency_id: { type: 'string', minLength: 1 },
                difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
                explanation: { type: 'string', minLength: 1 },
              },
            },
          },
        },
      },
    },
  };
}

export function buildAssessmentPrompt({ role, plan }) {
  const coverage = plan.coverage.map((item) => {
    const competency = role.competencies.find((entry) => entry.competency_id === item.competency_id);
    const sub = competency?.sub_competencies?.find(
      (entry) => entry.sub_competency_id === item.sub_competency_id,
    );
    return {
      competency_id: item.competency_id,
      competency_name: competency?.name || item.competency_id,
      sub_competency_id: item.sub_competency_id,
      sub_competency_name: sub?.name || item.sub_competency_id,
      definition: sub?.definition || '',
      required_level: item.required_level,
      question_count: item.question_count,
    };
  });

  return JSON.stringify({
    task: 'Generate a diagnostic MCQ assessment for GyanSetu.',
    rules: [
      'Use only the supplied competencies and sub-competencies.',
      'Do not invent IDs.',
      'Each question must map to exactly one competency and one sub-competency.',
      'Use exactly four plausible options.',
      'correct_answer must be A, B, C, or D and correspond to the options array order.',
      'Avoid duplicates and trivial wording.',
      'Match question depth to required_level (1 Basic, 2 Developing, 3 Proficient, 4 Advanced).',
      'Return only the structured response requested by the schema.',
    ],
    role: {
      role_id: role.role_id,
      role_name: role.role_name,
      domain: role.domain,
    },
    question_count: plan.question_count,
    required_coverage: coverage,
  });
}

export async function generateAssessmentQuestions({
  apiKey,
  role,
  plan,
  fetchImpl = fetch,
  model = DEFAULT_MODEL,
}) {
  const key = requiredApiKey(apiKey);
  const response = await fetchImpl(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://sih26101.stoicsolutions-in.workers.dev',
      'X-Title': 'GyanSetu SIH26101 Prototype',
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: Math.min(8000, Math.max(2500, plan.question_count * 260)),
      response_format: buildQuestionResponseSchema(plan.question_count),
      messages: [
        {
          role: 'system',
          content:
            'You generate auditable diagnostic assessment questions. Follow the supplied framework exactly and never infer personal information.',
        },
        { role: 'user', content: buildAssessmentPrompt({ role, plan }) },
      ],
    }),
  });

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`OpenRouter returned a non-JSON response (HTTP ${response.status}).`);
  }

  if (!response.ok) {
    const message = data?.error?.message || data?.error || `OpenRouter returned HTTP ${response.status}.`;
    throw new Error(String(message));
  }

  const rawContent = data?.choices?.[0]?.message?.content;
  if (!rawContent) throw new Error('OpenRouter response did not contain message content.');

  if (typeof rawContent === 'object') return rawContent.questions || rawContent;

  let parsed;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    throw new Error('OpenRouter returned content that was not valid JSON.');
  }

  return parsed.questions || parsed;
}
