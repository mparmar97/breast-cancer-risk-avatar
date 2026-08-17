/**
 * Detect when the user names a clinician specialty so the dialogue can
 * deliver preparation help immediately instead of clarifying subtype/focus.
 */

const SPECIALTY_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bbreast\s+oncologist\b/i, label: 'breast oncologist' },
  { pattern: /\boncologist\b/i, label: 'oncologist' },
  { pattern: /\bbreast\s+surgeon\b/i, label: 'breast surgeon' },
  { pattern: /\bsurgeon\b/i, label: 'breast surgeon' },
  { pattern: /\bradiologist\b/i, label: 'radiologist' },
  { pattern: /\bgynecologist\b|\bgynaecologist\b|\bgyn\b/i, label: 'gynecologist' },
  {
    pattern: /\b(primary care|family (doctor|physician|medicine)|pcp)\b/i,
    label: 'primary care clinician',
  },
  { pattern: /\bbreast\s+specialist\b/i, label: 'breast specialist' },
];

/** Exact / short specialty answers (e.g. after a menu of clinician types). */
const SHORT_SPECIALTY_PATTERN =
  /^(breast\s+)?(oncologist|surgeon|radiologist|gynecologist|gynaecologist|specialist|pcp)$/i;

export function detectClinicianSpecialty(message: string): string | null {
  const trimmed = message.trim();
  if (!trimmed) return null;

  if (SHORT_SPECIALTY_PATTERN.test(trimmed)) {
    const lower = trimmed.toLowerCase();
    if (lower === 'surgeon' || lower === 'breast surgeon') return 'breast surgeon';
    if (lower === 'oncologist' || lower === 'breast oncologist') {
      return lower.includes('breast') ? 'breast oncologist' : 'oncologist';
    }
    if (lower === 'radiologist') return 'radiologist';
    if (lower === 'gynecologist' || lower === 'gynaecologist') return 'gynecologist';
    if (lower === 'specialist' || lower === 'breast specialist') return 'breast specialist';
    if (lower === 'pcp') return 'primary care clinician';
  }

  for (const { pattern, label } of SPECIALTY_PATTERNS) {
    if (pattern.test(trimmed)) return label;
  }
  return null;
}

export function clinicianSpecialtyPrepFallback(specialty: string): string {
  return (
    `A ${specialty} can help interpret a demonstration risk estimate alongside a fuller personal and family history. ` +
    'Here are general questions people often bring to that visit: What does this estimate mean for me personally? ' +
    'Which parts of my history matter most here? Are any follow-up discussions or tests appropriate for my situation? ' +
    'What should I ask about next? These are preparation ideas only, not a personalized care plan.'
  );
}
