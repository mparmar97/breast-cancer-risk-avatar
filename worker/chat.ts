interface ChatRule {
  test: (normalizedMessage: string) => boolean;
  reply: string;
}

// Deterministic, keyword-based demonstration replies. No LLM, RAG, or adaptive
// state engine is involved yet — that is planned for a later phase.
const CHAT_RULES: ChatRule[] = [
  {
    test: (message) => /\b(do i|does this mean i)\b.*\bcancer\b/.test(message),
    reply:
      'A risk estimate is not a diagnosis. It reflects a statistical likelihood based on demonstration inputs, not a medical evaluation — only a clinician can diagnose breast cancer, and only after appropriate testing.',
  },
  {
    test: (message) => /\b(scared|afraid|frightened|anxious|terrified)\b/.test(message),
    reply:
      "It's completely understandable to feel scared when thinking about this. Many people feel that way when discussing risk information — you are not alone, and it's okay to take this one step at a time.",
  },
  {
    test: (message) =>
      /\b(can'?t|cannot|can not)\b.*\bcall\b/.test(message) ||
      /\bwhile i(’|'| a)?m working\b/.test(message),
    reply:
      "That's a reasonable barrier — finding time during a workday can be hard. Would a lunch break, a quick call before or after work, or messaging through a patient portal be easier to fit in?",
  },
  {
    test: (message) => /\b(contact|call|see|talk to|reach out to)\b.*\bdoctor\b/.test(message),
    reply:
      'That sounds like a great next step. Bringing this demonstration result to your doctor can help start a more personalized conversation about your risk and what, if anything, makes sense for you.',
  },
];

const FALLBACK_REPLY =
  "Thanks for sharing that. This is a scripted demonstration guide, so I can only offer general information — not medical advice. Could you tell me a bit more about what's on your mind?";

export function getMockChatReply(message: string): string {
  const normalized = message.toLowerCase();
  const matchedRule = CHAT_RULES.find((rule) => rule.test(normalized));
  return matchedRule ? matchedRule.reply : FALLBACK_REPLY;
}
