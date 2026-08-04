import type { SafetyFlag } from '../behavioral/state';

// Fixed, pre-approved safety responses. These always override any generated
// dialogue response — see worker/index.ts — and deliberately contain no
// phone numbers or specific service names, since availability varies by
// region and should not be hard-coded into the application.
const SAFETY_RESPONSES: Partial<Record<SafetyFlag, string>> = {
  diagnosis_request:
    'I cannot determine whether you have breast cancer. A risk estimate is not a diagnosis. A qualified healthcare professional would need to evaluate your history and other clinical information.',
  treatment_request:
    'I cannot recommend an individual treatment or medication. Those decisions require a qualified healthcare professional who understands your medical history.',
  urgent_symptom:
    'I cannot evaluate urgent symptoms. Please seek prompt medical care or contact an appropriate healthcare service.',
  emotional_crisis:
    "I'm sorry you are going through this. This application cannot safely support an immediate emotional crisis. Please contact a trusted person or an appropriate emergency or crisis-support service now.",
  out_of_scope:
    "I'm designed to explain this breast-cancer risk result and provide general educational information. I cannot answer that personal medical question safely.",
};

/** Returns the fixed safety response for a flag, or null if none applies. */
export function getFixedSafetyResponse(flag: SafetyFlag): string | null {
  return SAFETY_RESPONSES[flag] ?? null;
}
