import { classifyLocalState } from './behavioral/localClassifier';
import { selectDialogueStrategy } from './behavioral/policy';
import { normalizeAdaptiveState, type AdaptiveState } from './behavioral/state';
import { getTheoryConstruct } from './behavioral/theoryMap';
import { generateLocalResponse } from './llm/localGenerator';
import { getMockRiskResult, isRiskBranch, isRiskResult } from './mockRisk';
import { buildRetrievalQuery } from './rag/buildQuery';
import { getDialogueDesignEvidence, retrieveEvidence } from './rag/retrieve';
import { toDialogueDesignMetadata, toSourceMetadata } from './rag/types';
import { getFixedSafetyResponse } from './safety/safetyResponses';
import { validateResponse } from './safety/validateResponse';
import type { Env } from './types';

export type { Env };
export const WORKER_VERSION = '0.1.0';

// Used only when a chat request omits (or sends an invalid) risk result.
// The demonstration risk result never affects the fixed reply wording in
// this phase, but the generator's signature always expects one.
const DEFAULT_CHAT_RISK_RESULT = getMockRiskResult('average');

// Evidence retrieved and returned to the developer panel per turn.
const EVIDENCE_RESULT_LIMIT = 3;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

function handleHealth(): Response {
  return json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: WORKER_VERSION,
  });
}

async function readJsonBody(request: Request): Promise<unknown | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function handleMockRisk(request: Request): Promise<Response> {
  const body = await readJsonBody(request);
  const scenario = (body as { scenario?: unknown } | null)?.scenario;

  if (!isRiskBranch(scenario)) {
    return json({ error: "scenario must be 'average' or 'elevated'" }, 400);
  }

  return json(getMockRiskResult(scenario));
}

interface ChatRequestBody {
  message?: unknown;
  history?: unknown;
  riskResult?: unknown;
  previousState?: unknown;
}

/**
 * Phase 4 chat pipeline:
 *   validate request body -> validate non-empty message -> load
 *   conversation history -> classify adaptive state -> select dialogue
 *   strategy -> retrieve theory mapping -> check for fixed safety
 *   response -> build retrieval query -> retrieve top evidence entries ->
 *   generate evidence-grounded local response (when no fixed safety
 *   response applies) -> validate the final response -> return structured
 *   JSON.
 *
 * Retrieval always runs, even for safety-flagged messages, so the
 * developer panel can still show relevant source metadata — but the
 * fixed safety reply itself never depends on retrieval or generation.
 * Nothing is persisted server-side between requests.
 */
async function handleChat(request: Request): Promise<Response> {
  // 1. Validate request body.
  const body = await readJsonBody(request);
  const record = body as ChatRequestBody | null;

  // 2. Validate non-empty message.
  const message = record?.message;
  if (typeof message !== 'string' || message.trim().length === 0) {
    return json({ error: 'message must be a non-empty string' }, 400);
  }

  // 3. Load conversation history. Client-supplied only — the server keeps
  // no message history of its own, so this is accepted for forward
  // compatibility (e.g. future multi-turn retrieval context) but does not
  // yet change classification or retrieval.
  const history: unknown[] = Array.isArray(record?.history) ? record.history : [];
  void history;

  const riskResult = isRiskResult(record?.riskResult) ? record.riskResult : DEFAULT_CHAT_RISK_RESULT;
  const previousState = record?.previousState
    ? normalizeAdaptiveState(record.previousState as Partial<AdaptiveState>)
    : undefined;

  // 4. Classify adaptive state.
  const adaptiveState = classifyLocalState(message, previousState);

  // 5. Select dialogue strategy.
  const strategy = selectDialogueStrategy(adaptiveState);

  // 6. Retrieve theory mapping.
  const theoryConstruct = getTheoryConstruct(strategy);

  // 7. Check for a fixed safety response.
  const fixedSafetyReply = getFixedSafetyResponse(adaptiveState.safetyFlag);

  // 8. Build the retrieval query.
  const retrievalQuery = buildRetrievalQuery({ message, state: adaptiveState, strategy, riskResult });

  // 9. Retrieve the top evidence entries. Only ever "medical-rag" evidence
  // is retrieved here — this is the sole factual basis the response
  // generator is allowed to use. "dialogue-design" evidence (behavioral
  // theory / conversational-technique sources) is fetched separately,
  // below, strictly for developer diagnostics — it is never passed to
  // generateLocalResponse.
  const evidence = retrieveEvidence(retrievalQuery, { limit: EVIDENCE_RESULT_LIMIT, sourceUse: 'medical-rag' });

  // 10. Generate an evidence-grounded local response, unless a fixed
  // safety response overrides it.
  const candidateReply =
    fixedSafetyReply ?? generateLocalResponse({ strategy, state: adaptiveState, riskResult, evidence });

  // 11. Validate the final response.
  const reply = validateResponse(candidateReply);

  // Developer-only: the dialogue-design (behavioral-theory) evidence that
  // justifies the selected strategy's technique. Never used as medical
  // support and never blended with `sources` below.
  const dialogueDesignSources = getDialogueDesignEvidence(strategy).map(toDialogueDesignMetadata);

  // 12. Return structured JSON. Raw evidence text is never included —
  // only non-sensitive source metadata (see worker/rag/types.ts).
  return json({
    reply,
    adaptiveState,
    strategy,
    theoryConstruct,
    retrievalQuery,
    sources: evidence.map(toSourceMetadata),
    dialogueDesignSources,
    responseMode: 'local-rag-fallback',
    timestamp: new Date().toISOString(),
  });
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/health' && request.method === 'GET') {
      return handleHealth();
    }

    if (url.pathname === '/api/mock-risk' && request.method === 'POST') {
      return handleMockRisk(request);
    }

    if (url.pathname === '/api/chat' && request.method === 'POST') {
      return handleChat(request);
    }

    if (url.pathname.startsWith('/api/')) {
      return json({ error: 'Not found' }, 404);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
