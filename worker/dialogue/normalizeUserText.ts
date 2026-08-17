/**
 * Lightweight spelling normalization for short user replies.
 * Uses a small domain dictionary + edit distance — not full spellcheck.
 * Exact example sentences stay in tests; production matches categories.
 */

const DOMAIN_WORDS = [
  'question',
  'questions',
  'prepare',
  'preparing',
  'preparation',
  'clarify',
  'clarifying',
  'explanation',
  'explain',
  'number',
  'percentage',
  'estimate',
  'result',
  'doctor',
  'clinician',
  'professional',
  'healthcare',
  'diagnosis',
  'diagnose',
  'cancer',
  'breast',
  'worried',
  'afraid',
  'scared',
  'tense',
  'ready',
  'discuss',
  'appointment',
  'portal',
  'message',
  'draft',
  'exercise',
  'lifestyle',
  'health',
  'goodbye',
  'later',
  'thanks',
  'thank',
  'you',
  'welcome',
  'reach',
  'contact',
  'specialist',
] as const;

/** Common fixed misspellings seen in chat (before edit-distance). */
const FIXED_TYPOS: Array<[RegExp, string]> = [
  [/\bquetsion(s)?\b/gi, 'question$1'],
  [/\bqueston(s)?\b/gi, 'question$1'],
  [/\bqustion(s)?\b/gi, 'question$1'],
  [/\bqestion(s)?\b/gi, 'question$1'],
  [/\bquesion(s)?\b/gi, 'question$1'],
  [/\bpreapre\b/gi, 'prepare'],
  [/\bpreapare\b/gi, 'prepare'],
  [/\bprepair\b/gi, 'prepare'],
  [/\bclarifiy\b/gi, 'clarify'],
  [/\bclarfy\b/gi, 'clarify'],
  [/\bnuber\b/gi, 'number'],
  [/\bnumbr\b/gi, 'number'],
  [/\bdocter\b/gi, 'doctor'],
  [/\bproffesional\b/gi, 'professional'],
  [/\bbreastcancer\b/gi, 'breast cancer'],
  [/\bdiagnos\b/gi, 'diagnosis'],
  [/\bafriad\b/gi, 'afraid'],
  [/\bworried\b/gi, 'worried'],
  [/\bworrid\b/gi, 'worried'],
  [/\bdicuss\b/gi, 'discuss'],
  [/\bdiscus\b/gi, 'discuss'],
  [/\bgoodby\b/gi, 'goodbye'],
  [/\bseeyou\b/gi, 'see you'],
  [/\bthankyou\b/gi, 'thank you'],
  [/\btensed\b/gi, 'tense'],
  [/\brutine\b/gi, 'routine'],
  [/\broutien\b/gi, 'routine'],
];

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let i = 0; i < rows; i += 1) matrix[i][0] = i;
  for (let j = 0; j < cols; j += 1) matrix[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[a.length][b.length];
}

function maxDistanceFor(word: string): number {
  if (word.length <= 4) return 1;
  if (word.length <= 8) return 2;
  return 3;
}

function correctToken(token: string): string {
  if (!/^[a-z]+$/i.test(token)) return token;
  const lower = token.toLowerCase();
  if ((DOMAIN_WORDS as readonly string[]).includes(lower)) return lower;

  const allowed = maxDistanceFor(lower);
  let best: string | null = null;
  let bestDist = Infinity;
  for (const candidate of DOMAIN_WORDS) {
    if (Math.abs(candidate.length - lower.length) > allowed) continue;
    const dist = levenshtein(lower, candidate);
    if (dist < bestDist && dist <= allowed) {
      bestDist = dist;
      best = candidate;
    }
  }
  return best ?? lower;
}

/**
 * Normalize user text for intent/routing: lowercase, fixed typos, then
 * dictionary correction for domain keywords.
 */
export function normalizeUserText(
  message: string,
  options: { dictionaryCorrect?: boolean } = {},
): string {
  const dictionaryCorrect = options.dictionaryCorrect !== false;
  let text = message
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^a-z0-9%.\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  for (const [pattern, replacement] of FIXED_TYPOS) {
    text = text.replace(pattern, replacement);
  }

  if (dictionaryCorrect) {
    text = text
      .split(/\s+/)
      .map((token) => correctToken(token))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  return text;
}

export function mentionsQuestions(normalizedMessage: string): boolean {
  return /\bquestions?\b/.test(normalizedMessage);
}

export function mentionsClarifyNumber(normalizedMessage: string): boolean {
  return (
    /\b(clarif\w*|explain|number|percentage|estimate|result|what it means)\b/.test(normalizedMessage) &&
    !mentionsQuestions(normalizedMessage)
  );
}

export function mentionsPrepareQuestions(normalizedMessage: string): boolean {
  return (
    /\b(prepare|preparing|write|list|ask)\b.{0,40}\bquestions?\b/.test(normalizedMessage) ||
    /\bquestions?\b.{0,40}\b(doctor|clinician|professional|ask)\b/.test(normalizedMessage) ||
    /^(yes[,.]?\s+)?(prepare|preparing|questions?)\b/.test(normalizedMessage)
  );
}

/** Category: which clinician / who to contact (not naming a specific doctor). */
export function asksWhoToContact(message: string): boolean {
  const normalized = normalizeUserText(message);
  return (
    /\b(which|what) (doctor|clinician|physician|provider|specialist)\b/.test(normalized) ||
    /\bwhat (kind|type) of (doctor|clinician|physician|provider|specialist)\b/.test(normalized) ||
    /\bwho (should|do|can) i (reach out to|see|call|contact|talk to|go to)\b/.test(normalized) ||
    /\b(who to contact|where to (start|begin)|do not know who|don't know who)\b/.test(normalized) ||
    /\b(no doctor|do not have a doctor|don't have a doctor)\b/.test(normalized)
  );
}

/** Category: explain what the demonstration risk / estimate / percentage means. */
export function asksRiskExplanation(message: string): boolean {
  const normalized = normalizeUserText(message);
  return (
    /\bexplain\b.{0,40}\b(risk|estimate|percentage|percent|probability|number|result|score)\b/.test(
      normalized,
    ) ||
    /\bwhat (does|is)\b.{0,40}\b(risk|estimate|percentage|percent|probability|number|result|score)\b/.test(
      normalized,
    ) ||
    /\b(risk|estimate|percentage|percent|number|result)\b.{0,20}\bmean\b/.test(normalized) ||
    /\b(demonstration|demo)\b.{0,20}\brisk\b/.test(normalized)
  );
}
