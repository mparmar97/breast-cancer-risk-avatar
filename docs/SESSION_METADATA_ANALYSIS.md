# Session metadata — what we would analyze (D4)

Each chat session can export **JSON** and **CSV** from the chat screen. Exports include consent status, risk branch, 5-year demonstration estimate, calculator inputs (when used), transcript with timestamps, time-on-task, analysis notes, and **all developer-panel diagnostics** for each assistant turn (flattened `developer_field` / `developer_value` rows plus a full `developer_json` blob per turn).

## Analyses we would run

1. **Branch differences:** Compare time-on-task and turn count for average vs elevated risk — does elevated risk produce longer or more action-focused conversations?
2. **Follow-up intent:** Among elevated-risk sessions, measure how often users ask about clinician contact, scheduling, or question preparation before the session ends.
3. **Barrier → readiness path:** Using adaptive-state diagnostics (when present), see which barriers (time, cost, access, fear) precede readiness moves into preparing/ready.
4. **Reliability:** Track safety overrides and Groq `fallbackReason` / `generationErrorCategory` rates to monitor when local fallback replaces dynamic replies.

These analyses are for prototype evaluation only; they are not clinical outcome measures.
