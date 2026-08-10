/**
 * Detect lifestyle-motivation requests and follow-ups: "motivate me",
 * prior ask for an activity choice, and user naming a concrete activity.
 */

import { normalizeUserText } from './normalizeUserText';

const ACTIVITY_PATTERN =
  /\b(gym|workout|workouts|weight.?lift(?:ing)?|walk(?:ing)?|run(?:ning)?|jog(?:ging)?|yoga|swim(?:ming)?|cycl(?:e|ing)|bike|biking|hik(?:e|ing)|danc(?:e|ing)|pilates|cardio|aerobics|stretch(?:ing)?|crossfit|sport|tennis|soccer|basketball|lifting)\b/i;

/** Broad ask for motivational support (with or without naming exercise yet). */
export function asksMotivationSupport(message: string): boolean {
  const normalized = normalizeUserText(message);
  if (/\b(medication|chemotherapy|radiation|treatment plan|prescribe)\b/.test(normalized)) {
    return false;
  }
  return (
    /\b(motivate|motivation|motivational|encourage|encouragement|cheer me (up|on)|keep me (going|motivated)|inspire me)\b/.test(
      normalized,
    ) ||
    /\b(want|need|looking for).{0,40}\b(someone to )?motivate\b/.test(normalized) ||
    /\b(can you|could you|will you|please).{0,30}\bmotivate\b/.test(normalized) ||
    /\bmotivational guide\b/.test(normalized)
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
