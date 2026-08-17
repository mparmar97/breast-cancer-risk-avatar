/**
 * Detect lifestyle-motivation requests and follow-ups: "motivate me",
 * prior ask for an activity choice, and user naming a concrete activity
 * or schedule slot (morning / before work / etc.).
 */

import { normalizeUserText } from './normalizeUserText';

const ACTIVITY_PATTERN =
  /\b(gym|workout|workouts|weight.?lift(?:ing)?|walk(?:ing)?|run(?:ning)?|jog(?:ging)?|yoga|swim(?:ming)?|cycl(?:e|ing)|bike|biking|hik(?:e|ing)|danc(?:e|ing)|pilates|cardio|aerobics|stretch(?:ing)?|crossfit|sport|tennis|soccer|basketball|lifting|movement)\b/i;

/** Assistant asked when / which part of the day to fit activity in. */
export function previousAskedLifestyleScheduleChoice(
  previousAssistantReply?: string | null,
): boolean {
  if (!previousAssistantReply) return false;
  return /\b(which part of (your )?(workday|morning|evening|afternoon|day|routine|schedule)|when (in|during|would|could)|most doable|fit .{0,40}(into|in) (your )?(day|routine|schedule|workday)|what time|morning or evening|before or after)\b/i.test(
    previousAssistantReply,
  );
}

/** True when the assistant reply is itself another nested schedule clarify ask. */
export function isLifestyleScheduleClarifyQuestion(text: string): boolean {
  return previousAskedLifestyleScheduleChoice(text);
}

export function namesChosenScheduleSlot(message: string): boolean {
  const normalized = normalizeUserText(message);
  return (
    /\b(morning|evening|afternoon|lunch(time)?|midday|before work|after work|after dinner|on (my )?break|weekends?|night|commute|morning session|evening session)\b/.test(
      normalized,
    ) || /\bbefore .{0,24}(work|routine)\b/.test(normalized)
  );
}

export function extractChosenScheduleLabel(message: string): string {
  const normalized = normalizeUserText(message);
  if (/\bbefore .{0,24}(work|routine)\b/.test(normalized) || /\bbefore work\b/.test(normalized)) {
    return 'before work';
  }
  if (/\bafter work\b/.test(normalized)) return 'after work';
  if (/\bafter dinner\b/.test(normalized)) return 'after dinner';
  if (/\blunch(time)?\b|\bmidday\b|\bon (my )?break\b/.test(normalized)) return 'around midday';
  if (/\bmorning\b/.test(normalized)) return 'in the morning';
  if (/\bevening\b|\bnight\b/.test(normalized)) return 'in the evening';
  if (/\bafternoon\b/.test(normalized)) return 'in the afternoon';
  if (/\bweekend/.test(normalized)) return 'on weekends';
  if (/\bcommute\b/.test(normalized)) return 'during the commute';
  return 'at that time';
}

export function extractActivityFromAssistantReply(previousAssistantReply?: string | null): string | null {
  if (!previousAssistantReply) return null;
  const normalized = normalizeUserText(previousAssistantReply);
  if (/\byoga\b/.test(normalized)) return 'yoga';
  if (/\bwalk(?:ing)?\b/.test(normalized)) return 'walking';
  if (/\brun(?:ning)?\b|\bjog(?:ging)?\b/.test(normalized)) return 'running';
  if (/\bgym\b/.test(normalized)) return 'going to the gym';
  if (/\bswim(?:ming)?\b/.test(normalized)) return 'swimming';
  if (/\bmovement\b/.test(normalized)) return 'a short movement break';
  const match = normalized.match(ACTIVITY_PATTERN);
  return match?.[0] ?? null;
}

export function isLifestyleScheduleChoiceTurn(
  latestMessage: string,
  previousAssistantReply?: string | null,
  lastRouteTopic?: string | null,
): boolean {
  if (!namesChosenScheduleSlot(latestMessage)) return false;
  if (previousAskedLifestyleScheduleChoice(previousAssistantReply)) return true;
  // Nested timing follow-up while still in lifestyle coaching (e.g. yoga + morning routine).
  if (
    lastRouteTopic === 'lifestyle_risk_information' &&
    previousAssistantReply &&
    /\b(yoga|movement|exercise|activity|workout)\b/i.test(previousAssistantReply) &&
    /\b(morning|evening|workday|routine|schedule|doable|fit)\b/i.test(previousAssistantReply)
  ) {
    return true;
  }
  return false;
}

/** Broad ask for motivational support (with or without naming exercise yet). */
export function asksMotivationSupport(message: string): boolean {
  const normalized = normalizeUserText(message);
  if (/\b(medication|chemotherapy|radiation|treatment plan|prescribe)\b/.test(normalized)) {
    return false;
  }
  return (
    /\b(motivate|motivated|motivation|motivational|encourage|encouragement|cheer me (up|on)|keep me (going|motivated)|inspire me|stay motivated|keep motivated)\b/.test(
      normalized,
    ) ||
    /\b(want|need|looking for|give me|tips?|advice|help).{0,40}\b(motivate|motivated|motivation|encourag)\b/.test(
      normalized,
    ) ||
    /\b(can you|could you|will you|please).{0,30}\b(motivate|motivated)\b/.test(normalized) ||
    /\bmotivational guide\b/.test(normalized) ||
    // "tips to stay motivated to do yoga" / "tips for setting up routine"
    /\b(tips?|advice).{0,40}\b(yoga|exercise|workout|routine|habit|activity|fitness)\b/.test(normalized) ||
    /\b(set(ting)? up|build(ing)?|start(ing)?).{0,24}\b(a )?routine\b/.test(normalized)
  );
}

export function previousAskedLifestyleActivityChoice(
  previousAssistantReply?: string | null,
): boolean {
  if (!previousAssistantReply) return false;
  return /\b(what is one activity|activity you (already do|could keep|would like)|keep this week|realistic healthy step|motivational guide for (keeping|maintaining)|one small.{0,40}(activity|step))\b/i.test(
    previousAssistantReply,
  );
}

export function namesChosenActivity(message: string): boolean {
  const normalized = normalizeUserText(message);
  if (!ACTIVITY_PATTERN.test(normalized)) return false;
  // Preference / habit naming, or a bare activity after a coach ask.
  return (
    /\b(i (like|love|enjoy|prefer|do|did)|i('m| am) (into|doing)|going to the|keep|trying|try|start(?:ed|ing)?)\b/.test(
      normalized,
    ) ||
    /^(the )?gym\b/.test(normalized) ||
    normalized.split(/\s+/).length <= 6
  );
}

export function extractChosenActivityLabel(message: string): string {
  const normalized = normalizeUserText(message);
  if (/\bgym\b/.test(normalized)) return 'going to the gym';
  if (/\bwalk(?:ing)?\b/.test(normalized)) return 'walking';
  if (/\brun(?:ning)?\b|\bjog(?:ging)?\b/.test(normalized)) return 'running';
  if (/\byoga\b/.test(normalized)) return 'yoga';
  if (/\bswim(?:ming)?\b/.test(normalized)) return 'swimming';
  if (/\bcycl(?:e|ing)\b|\bbike\b|\bbiking\b/.test(normalized)) return 'cycling';
  if (/\bhik(?:e|ing)\b/.test(normalized)) return 'hiking';
  if (/\bdanc(?:e|ing)\b/.test(normalized)) return 'dancing';
  if (/\bpilates\b/.test(normalized)) return 'pilates';
  if (/\bweight.?lift(?:ing)?\b|\blifting\b/.test(normalized)) return 'strength training';
  if (/\bworkout/.test(normalized)) return 'workouts';
  if (/\bcardio\b|\baerobics\b/.test(normalized)) return 'cardio';
  const match = normalized.match(ACTIVITY_PATTERN);
  return match?.[0] ?? 'that activity';
}

export function isLifestyleActivityChoiceTurn(
  latestMessage: string,
  previousAssistantReply?: string | null,
  lastRouteTopic?: string | null,
): boolean {
  if (!namesChosenActivity(latestMessage)) return false;
  if (previousAskedLifestyleActivityChoice(previousAssistantReply)) return true;
  if (lastRouteTopic === 'lifestyle_risk_information') return true;
  // Standalone preference naming still counts as lifestyle motivation content.
  return /\b(i (like|love|enjoy|prefer) (doing |to )?(the )?|going to the gym)\b/i.test(
    normalizeUserText(latestMessage),
  );
}
