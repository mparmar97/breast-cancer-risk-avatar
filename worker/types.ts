export interface Env {
  ASSETS: Fetcher;

  /**
   * Optional Groq API key, provided only via `.dev.vars` locally or a
   * Wrangler *secret* (never a plaintext `vars` entry) in deployed
   * environments. When absent, the chat pipeline uses only the local,
   * deterministic classifier and response generator — see
   * docs/PHASE_5_GROQ_DYNAMIC_DIALOGUE.md. Never exposed to the frontend,
   * API responses, developer details, logs, error messages, or the
   * session export.
   */
  GROQ_API_KEY?: string;

  /** Optional Groq model override. Defaults to `openai/gpt-oss-20b` when absent. */
  GROQ_MODEL?: string;

  /**
   * When `"1"` / `"true"`, skip Groq for adaptive-state classification and use
   * the local classifier. Saves rate-limit budget for groq-dynamic-rag generation
   * (recommended on free-tier Groq). Default: Groq classification when keyed.
   */
  GROQ_LOCAL_CLASSIFICATION?: string;

  /**
   * LiveAvatar permanent API key — Worker secret only (`.dev.vars` locally or
   * `wrangler secret put LIVEAVATAR_API_KEY`). Never expose to the browser,
   * Vite env, API responses, developer panel, or session export.
   */
  LIVEAVATAR_API_KEY?: string;

  /** Non-secret: `"true"`/`"false"`. When false, static avatar + text only. */
  LIVEAVATAR_ENABLED?: string;

  /** Non-secret. Default local development: sandbox (`true`). */
  LIVEAVATAR_SANDBOX?: string;

  /**
   * Non-secret. `LITE` (preferred) = app Groq TTS + LiveAvatar video (1 credit/min).
   * `FULL` = LiveAvatar built-in TTS via speak_text (2 credits/min).
   */
  LIVEAVATAR_MODE?: string;

  /**
   * Non-secret avatar id. In sandbox mode the official Wayne test avatar is
   * used regardless (see worker/liveavatar/types.ts).
   */
  LIVEAVATAR_AVATAR_ID?: string;

  /**
   * Optional reusable FULL-mode context id. When absent, the Worker creates a
   * delivery-only context at session start (uses LIVEAVATAR_API_KEY).
   */
  LIVEAVATAR_CONTEXT_ID?: string;

  /** Optional voice id (required for some image avatars). */
  LIVEAVATAR_VOICE_ID?: string;

  /** Optional local safeguard; does not override LiveAvatar provider limits. */
  LIVEAVATAR_DEV_MAX_SESSION_SECONDS?: string;

  /**
   * Optional dedicated TTS key for a non-Groq adapter. LITE prefers GROQ_API_KEY
   * via Groq Orpheus TTS when present.
   */
  TTS_API_KEY?: string;

  /** Optional Groq TTS model override (default canopylabs/orpheus-v1-english). */
  GROQ_TTS_MODEL?: string;

  /** Optional Groq TTS voice override (default hannah). */
  GROQ_TTS_VOICE?: string;
}

export type RiskBranch = 'average' | 'elevated';

export interface RiskResult {
  model: string;
  fiveYearRisk: number;
  riskHorizon: string;
  riskBranch: RiskBranch;
  disclaimer: string;
  /** Present when the result came from the built-in educational form. */
  calculatorInputs?: import('./risk/simplifiedGail').CalculatorInputs;
}
