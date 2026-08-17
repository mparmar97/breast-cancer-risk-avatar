import type { ChatDiagnostics, ChatMessage, SessionData } from '../types';
import { SESSION_ANALYSIS_NOTES } from '../types';
import type { LiveAvatarSessionExportMeta } from '../liveavatar/types';

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadJson(filename: string, data: unknown): void {
  downloadBlob(
    filename,
    new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    }),
  );
}

export function downloadText(filename: string, text: string, mime = 'text/plain'): void {
  downloadBlob(filename, new Blob([text], { type: mime }));
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return csvEscape(value);
  if (typeof value === 'number' || typeof value === 'boolean') return csvEscape(String(value));
  return csvEscape(JSON.stringify(value));
}

export function computeTimeOnTaskSeconds(session: SessionData): number {
  if (!session.conversationStartedAt) return 0;
  const start = Date.parse(session.conversationStartedAt);
  const end = Date.parse(session.updatedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.round((end - start) / 1000);
}

/** Enrich a session snapshot for download (R8 / D4). */
export function buildSessionExport(
  session: SessionData,
  liveAvatarMeta?: LiveAvatarSessionExportMeta | null,
): SessionData & {
  timeOnTaskSeconds: number;
  analysisNotes: string;
  riskBranch: string | null;
  avatarMode?: 'live' | 'static';
  liveAvatarSandbox?: boolean;
  liveAvatarSessionStarted?: boolean;
  liveAvatarSessionDurationSeconds?: number;
  liveAvatarFailures?: number;
  avatarSpeechInterruptions?: number;
  embodimentPoliciesUsed?: string[];
} {
  return {
    ...session,
    timeOnTaskSeconds: computeTimeOnTaskSeconds(session),
    analysisNotes: SESSION_ANALYSIS_NOTES,
    riskBranch: session.riskResult?.riskBranch ?? null,
    avatarMode: liveAvatarMeta?.avatarMode ?? 'static',
    liveAvatarSandbox: liveAvatarMeta?.liveAvatarSandbox ?? true,
    liveAvatarSessionStarted: liveAvatarMeta?.liveAvatarSessionStarted ?? false,
    liveAvatarSessionDurationSeconds: liveAvatarMeta?.liveAvatarSessionDurationSeconds ?? 0,
    liveAvatarFailures: liveAvatarMeta?.liveAvatarFailures ?? 0,
    avatarSpeechInterruptions: liveAvatarMeta?.avatarSpeechInterruptions ?? 0,
    embodimentPoliciesUsed: liveAvatarMeta?.embodimentPoliciesUsed ?? [],
  };
}

/** Flatten nested developer diagnostics into dotted paths for CSV rows. */
export function flattenDeveloperFields(
  value: unknown,
  prefix = '',
  out: Array<{ field: string; value: string }> = [],
): Array<{ field: string; value: string }> {
  if (value === null || value === undefined) {
    if (prefix) out.push({ field: prefix, value: '' });
    return out;
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    out.push({ field: prefix, value: String(value) });
    return out;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      out.push({ field: prefix, value: '[]' });
      return out;
    }
    // Keep short scalar arrays as a single cell; nest objects.
    if (value.every((item) => ['string', 'number', 'boolean'].includes(typeof item) || item == null)) {
      out.push({ field: prefix, value: value.map((item) => String(item ?? '')).join('; ') });
      return out;
    }
    value.forEach((item, index) => {
      flattenDeveloperFields(item, prefix ? `${prefix}[${index}]` : `[${index}]`, out);
    });
    return out;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      out.push({ field: prefix, value: '{}' });
      return out;
    }
    for (const [key, nested] of entries) {
      const path = prefix ? `${prefix}.${key}` : key;
      flattenDeveloperFields(nested, path, out);
    }
    return out;
  }
  out.push({ field: prefix, value: String(value) });
  return out;
}

const CSV_HEADER = [
  'row_type',
  'message_id',
  'timestamp',
  'role',
  'content',
  'risk_branch',
  'five_year_risk',
  'model',
  'time_on_task_seconds',
  'turn_count',
  'consent_given',
  'analysis_notes',
  'developer_field',
  'developer_value',
] as const;

function baseCells(
  exported: ReturnType<typeof buildSessionExport>,
  overrides: Partial<Record<(typeof CSV_HEADER)[number], unknown>> = {},
): string[] {
  const values: Record<(typeof CSV_HEADER)[number], unknown> = {
    row_type: '',
    message_id: '',
    timestamp: '',
    role: '',
    content: '',
    risk_branch: exported.riskResult?.riskBranch ?? '',
    five_year_risk: exported.riskResult?.fiveYearRisk ?? '',
    model: exported.riskResult?.model ?? '',
    time_on_task_seconds: exported.timeOnTaskSeconds,
    turn_count: exported.messages.length,
    consent_given: exported.consentGiven,
    analysis_notes: '',
    developer_field: '',
    developer_value: '',
    ...overrides,
  };
  return CSV_HEADER.map((key) => cell(values[key]));
}

function emitDeveloperRows(
  lines: string[],
  exported: ReturnType<typeof buildSessionExport>,
  diagnostics: ChatDiagnostics | null | undefined,
  message: Pick<ChatMessage, 'id' | 'timestamp'> | null,
  scopeLabel: string,
): void {
  if (!diagnostics) return;

  // Full JSON blob so nothing is lost.
  lines.push(
    baseCells(exported, {
      row_type: 'developer_json',
      message_id: message?.id ?? scopeLabel,
      timestamp: message?.timestamp ?? exported.updatedAt,
      role: 'assistant',
      developer_field: scopeLabel,
      developer_value: JSON.stringify(diagnostics),
    }).join(','),
  );

  for (const { field, value } of flattenDeveloperFields(diagnostics)) {
    lines.push(
      baseCells(exported, {
        row_type: 'developer',
        message_id: message?.id ?? scopeLabel,
        timestamp: message?.timestamp ?? exported.updatedAt,
        role: 'assistant',
        developer_field: field,
        developer_value: value,
      }).join(','),
    );
  }
}

/**
 * CSV with session summary, transcript messages, and every developer-panel
 * diagnostic field (flattened + full JSON per assistant turn).
 */
export function buildSessionCsv(
  session: SessionData,
  liveAvatarMeta?: LiveAvatarSessionExportMeta | null,
): string {
  const exported = buildSessionExport(session, liveAvatarMeta);
  const lines: string[] = [CSV_HEADER.join(',')];

  lines.push(
    baseCells(exported, {
      row_type: 'session',
      timestamp: exported.createdAt,
      analysis_notes: exported.analysisNotes,
      developer_field: 'calculatorInputs',
      developer_value: exported.riskResult?.calculatorInputs
        ? JSON.stringify(exported.riskResult.calculatorInputs)
        : '',
    }).join(','),
  );

  for (const message of exported.messages) {
    lines.push(
      baseCells(exported, {
        row_type: 'message',
        message_id: message.id,
        timestamp: message.timestamp,
        role: message.role,
        content: message.content,
      }).join(','),
    );

    if (message.role === 'assistant' && message.diagnostics) {
      emitDeveloperRows(lines, exported, message.diagnostics, message, 'turn');
    }
  }

  // Include latest diagnostics when older sessions lack per-message diagnostics.
  const hasPerMessageDiagnostics = exported.messages.some(
    (message) => message.role === 'assistant' && message.diagnostics,
  );
  if (exported.latestDiagnostics && !hasPerMessageDiagnostics) {
    const lastAssistant = [...exported.messages].reverse().find((message) => message.role === 'assistant');
    emitDeveloperRows(
      lines,
      exported,
      exported.latestDiagnostics,
      lastAssistant ?? null,
      'latest',
    );
  }

  return `${lines.join('\n')}\n`;
}
