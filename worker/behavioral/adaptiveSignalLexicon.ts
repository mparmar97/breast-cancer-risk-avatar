/**
 * Category synonym / indirect-cue patterns for adaptive-state detection.
 * Exact example sentences belong in tests only — production matches categories.
 */

/** Indirect or synonymous worry / fear language (maps to emotion worried). */
export const WORRY_SYNONYM_PATTERN =
  /\b(scared|afraid|frightened|worried|anxious|nervous|terrified|uneasy|tense|tensed|tension|panicky|panic|dread|stressed|stress(ed|ing)?|spooked|rattled|shaken|on edge|freaks?(ed|ing)?( me)? out|keeps? me (up|awake)|stomach (in knots|dropping)|heart (racing|pounding)|this (unnerves|unnerved|worries|bothers|haunts) me|makes? me (nervous|anxious|uneasy|worry|tense)|feel(ing)? (low|heavy|tense|tensed) about (this|it|the result)|i am (feeling )?tense[d]?|i'?m (feeling )?tense[d]?|cannot stop (thinking|worrying)|can't stop (thinking|worrying))\b/;

/** Overwhelm / cannot cope (maps to emotion overwhelmed). */
export const OVERWHELM_SYNONYM_PATTERN =
  /\b(overwhelmed|too much to (handle|process|take in)|can'?t (handle|cope|deal with)|cannot (handle|cope|deal with)|falling apart|drowning (in|with)|information overload|my (head|mind) is spinning|spinning|too many (numbers|details|things)|cannot process|can'?t process)\b/;

/** Dismissive / minimizing (maps to emotion dismissive). */
export const DISMISSIVE_SYNONYM_PATTERN =
  /\b(does not matter|doesn'?t matter|do not think this matters|don'?t think this matters|not a big deal|whatever|do not care|don'?t care|no biggie|not worth (worrying|thinking)|shrug( it)? off|overblown|making a big deal)\b/;

/** Delay / avoidance without using “putting it off” literally. */
export const DELAY_SYNONYM_PATTERN =
  /\b(keep putting it off|keeps getting put off|putting it off|put it off|keep delaying|keep postponing|procrastinat\w*|put off (calling|contacting|scheduling|messaging|following up)|been meaning to|keep meaning to|haven'?t gotten around to|have not gotten around to|keep sidestepping|keep avoiding|i('ll| will) (do|handle) it (later|someday)|someday (soon|maybe)|not getting to it)\b/;

/** Access / who-to-contact paraphrases. */
export const ACCESS_SYNONYM_PATTERN =
  /\b(who to contact|where to go|how to schedule|no doctor|do not have a doctor|don'?t have a doctor|cannot get an appointment|can'?t get an appointment|do not know where to start|don'?t know where to start|do not know who|don'?t know who|which doctor|what doctor|what kind of doctor|what type of doctor|lost on who to (call|contact|see)|no idea where to begin|stuck (on|with) finding (someone|a (doctor|clinician|clinic))|unclear who (to|i should) (call|see|contact))\b/;

/** Time / schedule paraphrases. */
export const TIME_SYNONYM_PATTERN =
  /\b(no time|busy|work schedule|business hours|cannot call|can'?t call|cannot make calls|difficult to call|hard to call|too busy|while i am working|while i'?m working|during work|during the day|calling is hard|phone calls? (are )?difficult|working|juggling work|only free after (hours|work)|cannot step away|can'?t step away|tied up at work)\b/;

/** Cost / coverage paraphrases. */
export const COST_SYNONYM_PATTERN =
  /\b(afford|cost|expensive|insurance|payment|out of pocket|money|pricey|too (pricey|costly)|cannot swing|can'?t swing|coverage (worries|concerns)|bill(s)? (worry|scare|concern)|financial(ly)? (hard|tight|stress))\b/;

/** Mistrust paraphrases. */
export const MISTRUST_SYNONYM_PATTERN =
  /\b(do not trust|don'?t trust|dont trust|not sure i trust|skeptical of|do not believe|don'?t believe|dubious|sounds? fishy|hard to believe|questionable|not convinced|suspicious of)\b/;

/** Uncertainty about next action. */
export const UNCERTAINTY_SYNONYM_PATTERN =
  /\b(not sure (what|how|whether)|unsure (what|how|whether)|do not know what to (think|believe|do)|don'?t know what to (think|believe|do)|in the dark about|unclear (how|what) to)\b/;

/** Confidence / capability paraphrases. */
export const CONFIDENCE_SYNONYM_PATTERN =
  /\b(will be manageable|feels manageable|is manageable|manageable for me|i can (do|handle) (this|that|it)|i feel (capable|ready)|i think i can|feels doable|within my ability|i('m| am) able to|i can manage)\b/;

/** Preparing / intending follow-up paraphrases. */
export const PREPARING_SYNONYM_PATTERN =
  /\b(i want to (follow up|call|contact|schedule)|i plan to|i am trying to|i'?m trying to|now i might (send|call|message|contact)|i might (send|call|message) a (message|portal)|thinking about (reaching out|messaging|calling|contacting)|looking into (messaging|calling|contacting)|figuring out how to (reach|contact|message))\b/;

/** Ready action paraphrases. */
export const READY_ACTION_SYNONYM_PATTERN =
  /\b(i will (call|message|schedule|contact|talk to|follow up|reach out|send( it)?)|i'?ll (call|message|schedule|contact|talk to|follow up|reach out|send( it)?)|i am going to (call|message|schedule|contact|talk to|follow up|reach out|send( it)?)|i'?m going to (call|message|schedule|contact|talk to|follow up|reach out|send( it)?)|i('ve| have) decided to (call|message|contact|schedule|reach out))\b/;

// ---------------------------------------------------------------------------
// Dynamic feeling-phrase inference (covers unseen synonyms via fuzzy match)
// ---------------------------------------------------------------------------

const WORRY_SEEDS = [
  'worried',
  'worry',
  'anxious',
  'anxiety',
  'nervous',
  'scared',
  'afraid',
  'frightened',
  'terrified',
  'uneasy',
  'tense',
  'tensed',
  'tension',
  'stressed',
  'stress',
  'panicky',
  'panic',
  'dread',
  'spooked',
  'rattled',
  'shaken',
  'jittery',
  'antsy',
  'edgy',
  'restless',
  'apprehensive',
  'concerned',
  'troubled',
  'distressed',
  'alarmed',
  'fearful',
  'unnerved',
  'freaked',
  'upset',
  'unease',
] as const;

const OVERWHELM_SEEDS = [
  'overwhelmed',
  'overwhelming',
  'swamped',
  'flooded',
  'drowning',
  'spinning',
  'overload',
  'overloaded',
  'exhausted',
  'drained',
] as const;

const DISMISSIVE_SEEDS = [
  'dismissive',
  'indifferent',
  'unconcerned',
  'unbothered',
  'whatever',
  'apathetic',
] as const;

/** Neutral words that appear after "I am" but are not emotions. */
const NON_EMOTION_TOKENS = new Set([
  'here',
  'fine',
  'okay',
  'ok',
  'good',
  'ready',
  'done',
  'back',
  'curious',
  'asking',
  'wondering',
  'looking',
  'trying',
  'going',
  'thinking',
  'reading',
  'writing',
  'sending',
  'calling',
  'following',
  'not',
  'just',
  'still',
  'also',
  'only',
  'really',
  'very',
  'quite',
  'somewhat',
  'kinda',
  'kind',
  'bit',
  'little',
  'about',
  'the',
  'this',
  'that',
  'with',
  'from',
  'into',
]);

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

function maxFuzzyDistance(token: string): number {
  if (token.length <= 4) return 1;
  if (token.length <= 7) return 2;
  return 3;
}

function fuzzyMatchesSeed(token: string, seeds: readonly string[]): boolean {
  const t = token.toLowerCase().replace(/[^a-z]/g, '');
  // Short tokens false-positive too easily (e.g. who → now).
  if (t.length < 4 || NON_EMOTION_TOKENS.has(t)) return false;
  const allowed = maxFuzzyDistance(t);
  for (const seed of seeds) {
    if (t === seed) return true;
    if (seed.length < 4) continue;
    // Shared stem (tense/tensed/tension, worry/worried).
    if (t.length >= 4 && seed.length >= 4 && (t.startsWith(seed.slice(0, 4)) || seed.startsWith(t.slice(0, 4)))) {
      return true;
    }
    if (Math.abs(t.length - seed.length) > allowed) continue;
    if (levenshtein(t, seed) <= allowed) return true;
  }
  return false;
}

/**
 * Pull candidate feeling words from first-person frames like
 * "i am X", "i feel X", "feeling X", "makes me X".
 */
export function extractFeelingTokens(message: string): string[] {
  const text = message.toLowerCase();
  const tokens = new Set<string>();
  const frames = [
    /\b(?:i(?:'m| am)|i feel(?:ing)?|feeling|makes me|got me|has me|leaving me)\s+(?:a bit|quite|so|really|very|kinda|kind of|somewhat|pretty)?\s*([a-z]{3,20})\b/g,
    /\b(?:i(?:'m| am) feeling)\s+(?:a bit|quite|so|really|very)?\s*([a-z]{3,20})\b/g,
  ];
  for (const frame of frames) {
    let match: RegExpExecArray | null;
    while ((match = frame.exec(text)) !== null) {
      const token = match[1];
      if (token && !NON_EMOTION_TOKENS.has(token)) tokens.add(token);
    }
  }
  return [...tokens];
}

export type InferredEmotion = 'worried' | 'overwhelmed' | 'dismissive' | null;

/**
 * Infer emotion from feeling-phrase tokens + fuzzy seed match.
 * Handles unseen synonyms ("tensed", "jittery", "apprehensive") without
 * requiring every spelling in a regex.
 */
export function inferEmotionFromFeelingPhrase(message: string): InferredEmotion {
  if (OVERWHELM_SYNONYM_PATTERN.test(message)) return 'overwhelmed';
  if (DISMISSIVE_SYNONYM_PATTERN.test(message)) return 'dismissive';
  if (WORRY_SYNONYM_PATTERN.test(message)) return 'worried';

  const tokens = extractFeelingTokens(message);
  for (const token of tokens) {
    if (fuzzyMatchesSeed(token, OVERWHELM_SEEDS)) return 'overwhelmed';
    if (fuzzyMatchesSeed(token, DISMISSIVE_SEEDS)) return 'dismissive';
    if (fuzzyMatchesSeed(token, WORRY_SEEDS)) return 'worried';
  }
  return null;
}

/** True when any worry/overwhelm cue is present (regex or fuzzy feeling phrase). */
export function expressesWorryOrOverwhelm(message: string): boolean {
  const inferred = inferEmotionFromFeelingPhrase(message);
  return inferred === 'worried' || inferred === 'overwhelmed';
}

// ---------------------------------------------------------------------------
// Dynamic inference for remaining adaptive-state fields
// ---------------------------------------------------------------------------

const DELAY_SEEDS = [
  'delay',
  'delaying',
  'postpone',
  'postponing',
  'procrastinate',
  'procrastinating',
  'avoiding',
  'sidestepping',
  'someday',
] as const;

const ACCESS_SEEDS = [
  'contact',
  'schedule',
  'appointment',
  'doctor',
  'clinician',
  'begin',
  'start',
  'clinic',
  'referral',
] as const;

const TIME_SEEDS = [
  'busy',
  'working',
  'schedule',
  'hours',
  'juggling',
  'daytime',
  'workplace',
] as const;

const COST_SEEDS = [
  'afford',
  'expensive',
  'pricey',
  'costly',
  'insurance',
  'coverage',
  'payment',
  'money',
  'bill',
  'bills',
  'financial',
] as const;

const MISTRUST_SEEDS = [
  'trust',
  'believe',
  'skeptical',
  'dubious',
  'fishy',
  'questionable',
  'suspicious',
  'convinced',
  'doubt',
  'doubtful',
] as const;

const UNCERTAINTY_BARRIER_SEEDS = [
  'unsure',
  'uncertain',
  'unclear',
  'undecided',
] as const;

const CONFIDENCE_SEEDS = [
  'manageable',
  'doable',
  'capable',
  'able',
  'handle',
  'confident',
  'ready',
  'competent',
] as const;

const LOW_EFFICACY_SEEDS = [
  'helpless',
  'stuck',
  'powerless',
  'incapable',
  'unable',
] as const;

/** Timing/commitment cues for readiness. Omit short words like "now" (who→now false positive). */
const READY_SEEDS = ['decided', 'tonight', 'today', 'tomorrow', 'immediately'] as const;

const PREPARING_SEEDS = [
  'planning',
  'preparing',
  'trying',
  'intending',
  'figuring',
] as const;

const UNDERSTANDING_CORRECT_SEEDS = [
  'understand',
  'understood',
  'clear',
  'clicks',
  'gotcha',
  'sense',
  'realize',
  'realized',
] as const;

const UNDERSTANDING_PARTIAL_SEEDS = [
  'kinda',
  'sorta',
  'confused',
  'unclear',
  'fuzzy',
] as const;

function messageTokens(message: string): string[] {
  return message
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3);
}

function anyTokenMatchesSeeds(tokens: string[], seeds: readonly string[]): boolean {
  return tokens.some((token) => fuzzyMatchesSeed(token, seeds));
}

export type InferredBarrier =
  | 'delay'
  | 'access'
  | 'time'
  | 'cost'
  | 'mistrust'
  | 'uncertainty'
  | null;

/**
 * Infer barrier from synonym patterns + fuzzy token cues.
 * Order matches localClassifier priority (delay before access, etc.).
 */
export function inferBarrierFromMessage(message: string): InferredBarrier {
  if (DELAY_SYNONYM_PATTERN.test(message)) return 'delay';
  if (MISTRUST_SYNONYM_PATTERN.test(message)) return 'mistrust';
  if (ACCESS_SYNONYM_PATTERN.test(message)) return 'access';
  if (COST_SYNONYM_PATTERN.test(message)) return 'cost';
  if (TIME_SYNONYM_PATTERN.test(message)) return 'time';
  if (UNCERTAINTY_SYNONYM_PATTERN.test(message)) return 'uncertainty';

  const text = message.toLowerCase();
  const tokens = messageTokens(text);
  const hardship =
    /\b(cannot|can'?t|hard to|difficult to|unable to|too|no idea|do not know|don'?t know|lost on|stuck)\b/.test(
      text,
    );

  if (
    /\b(been meaning|keep meaning|gotten around|put(ting)? (it )?off|later|someday)\b/.test(text) ||
    anyTokenMatchesSeeds(tokens, DELAY_SEEDS)
  ) {
    if (/\b(put|putting|delay|postpone|procrastinat|avoid|sidestep|meaning to|gotten around)\b/.test(text)) {
      return 'delay';
    }
  }

  if (
    /\b(do not|don'?t|dont|not)\b.{0,20}\b(trust|believe|convinced)\b/.test(text) ||
    /\b(sounds?|seems?)\b.{0,12}\b(fishy|questionable|suspicious)\b/.test(text) ||
    (hardship && anyTokenMatchesSeeds(tokens, MISTRUST_SEEDS) && /\b(trust|believe|fishy|skeptic|doubt)\b/.test(text))
  ) {
    return 'mistrust';
  }

  if (
    /\b(who|where)\b.{0,30}\b(contact|call|start|begin|go)\b/.test(text) ||
    (hardship &&
      anyTokenMatchesSeeds(tokens, ACCESS_SEEDS) &&
      /\b(who|where|contact|call|doctor|clinic|appointment|start|begin)\b/.test(text))
  ) {
    return 'access';
  }

  if (
    (hardship && anyTokenMatchesSeeds(tokens, COST_SEEDS)) ||
    /\b(too )?(pricey|costly|expensive)\b/.test(text) ||
    /\bcannot afford|can'?t afford|out of pocket\b/.test(text)
  ) {
    return 'cost';
  }

  if (
    (hardship && anyTokenMatchesSeeds(tokens, TIME_SEEDS)) ||
    /\b(during work|after hours|business hours|while .{0,12}working)\b/.test(text)
  ) {
    return 'time';
  }

  if (
    hardship &&
    anyTokenMatchesSeeds(tokens, UNCERTAINTY_BARRIER_SEEDS) &&
    /\b(what|how|whether|next|contact|send)\b/.test(text)
  ) {
    return 'uncertainty';
  }

  return null;
}

export type InferredUnderstanding = 'correct' | 'partial' | null;

/** Infer understanding from clear / partial comprehension cues (not safety). */
export function inferUnderstandingFromMessage(message: string): InferredUnderstanding {
  if (
    /\bi (understand|know|realize|get it)\b[^.?!]*\b(probability|percentage|estimate|risk|chance|result|number)\b/.test(
      message,
    ) ||
    /\b(the number makes sense|i get the result|understand the (result|percentage|number)|that (clicks|makes sense now)|gotcha on the (percentage|number|estimate))\b/.test(
      message,
    )
  ) {
    return 'correct';
  }
  if (
    /\b(so i (might|could|may) have (cancer|it)|this means my risk is (higher|elevated)|not sure what (this|it) means|kind of means|so (i'?m|i am) (at )?higher risk)\b/.test(
      message,
    )
  ) {
    return 'partial';
  }

  const text = message.toLowerCase();
  const tokens = messageTokens(text);
  const aboutRisk = /\b(probability|percentage|estimate|risk|chance|result|number)\b/.test(text);
  if (aboutRisk && anyTokenMatchesSeeds(tokens, UNDERSTANDING_CORRECT_SEEDS)) {
    if (/\b(not sure|don'?t (really )?get|still unclear)\b/.test(text)) return 'partial';
    return 'correct';
  }
  if (
    aboutRisk &&
    (anyTokenMatchesSeeds(tokens, UNDERSTANDING_PARTIAL_SEEDS) ||
      /\b(kind of|sort of|kinda|sorta)\b/.test(text))
  ) {
    return 'partial';
  }
  return null;
}

export type InferredSelfEfficacy = 'low' | 'moderate' | 'high' | null;

/** Infer self-efficacy from capability / helplessness language. */
export function inferSelfEfficacyFromMessage(message: string): InferredSelfEfficacy {
  if (CONFIDENCE_SYNONYM_PATTERN.test(message)) return 'moderate';
  if (READY_ACTION_SYNONYM_PATTERN.test(message)) return 'high';

  const text = message.toLowerCase();
  const tokens = messageTokens(text);
  // Situational cannot (call while working / afford) is a barrier, not low efficacy.
  const situationalCannot =
    /\b(can'?t|cannot)\s+(call|make calls|afford)\b/.test(text) ||
    /\b(hard|difficult)\s+to\s+call\b/.test(text);

  if (
    !situationalCannot &&
    (/\b(i can'?t|i cannot|i am unable|i'?m unable|do not know how|don'?t know how|do not know (who|where)|don'?t know (who|where))\b/.test(
      text,
    ) ||
      anyTokenMatchesSeeds(tokens, LOW_EFFICACY_SEEDS))
  ) {
    return 'low';
  }
  if (anyTokenMatchesSeeds(tokens, CONFIDENCE_SEEDS) && /\b(i |it |feels? |seems? )/.test(text)) {
    if (/\b(very|totally|completely)\b/.test(text) && /\b(able|capable|confident|ready)\b/.test(text)) {
      return 'high';
    }
    return 'moderate';
  }
  return null;
}

export type InferredReadiness = 'not_considering' | 'considering' | 'preparing' | 'ready' | null;

/** Infer readiness from commitment / planning / avoidance language. */
export function inferReadinessFromMessage(message: string): InferredReadiness {
  if (READY_ACTION_SYNONYM_PATTERN.test(message)) return 'ready';
  if (PREPARING_SYNONYM_PATTERN.test(message)) return 'preparing';
  if (DISMISSIVE_SYNONYM_PATTERN.test(message)) return 'not_considering';

  const text = message.toLowerCase();
  const tokens = messageTokens(text);
  if (
    /\b(i will|i'?ll|i am going to|i'?m going to|i have decided|i'?ve decided)\b/.test(text) &&
    /\b(call|message|contact|schedule|reach|send|follow)\b/.test(text)
  ) {
    return 'ready';
  }
  // Exact short timing words only (not fuzzy — avoids who→now).
  if (
    /\b(now|today|tonight|tomorrow|immediately)\b/.test(text) &&
    /\b(i will|i'?ll|i am going to|i'?m going to|i have decided|i'?ve decided)\b/.test(text) &&
    /\b(call|message|contact|schedule|reach|send|follow)\b/.test(text)
  ) {
    return 'ready';
  }
  if (
    anyTokenMatchesSeeds(tokens, READY_SEEDS) &&
    /\b(call|message|contact|schedule|reach|send|follow|doctor|clinic)\b/.test(text)
  ) {
    return 'ready';
  }
  if (
    anyTokenMatchesSeeds(tokens, PREPARING_SEEDS) ||
    /\b(thinking about|looking into|figuring out|planning to|trying to)\b/.test(text)
  ) {
    return 'preparing';
  }
  if (/\b(maybe|might|considering|thinking)\b/.test(text) && /\b(call|contact|follow|message|next)\b/.test(text)) {
    return 'considering';
  }
  if (/\b(not interested|do not care|don'?t care|no point)\b/.test(text)) {
    return 'not_considering';
  }
  return null;
}

export interface InferredAdaptiveSignals {
  emotion: InferredEmotion;
  barrier: InferredBarrier;
  understanding: InferredUnderstanding;
  selfEfficacy: InferredSelfEfficacy;
  readiness: InferredReadiness;
}

/** Run dynamic synonym/fuzzy inference across adaptive-state fields (not safety). */
export function inferAdaptiveSignals(message: string): InferredAdaptiveSignals {
  return {
    emotion: inferEmotionFromFeelingPhrase(message),
    barrier: inferBarrierFromMessage(message),
    understanding: inferUnderstandingFromMessage(message),
    selfEfficacy: inferSelfEfficacyFromMessage(message),
    readiness: inferReadinessFromMessage(message),
  };
}
