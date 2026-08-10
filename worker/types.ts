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
