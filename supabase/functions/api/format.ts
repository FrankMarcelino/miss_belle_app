/** Tradução entre o mundo do banco e o do contrato. */

export const BRT_OFFSET = '-03:00';

/** date + time do banco → ISO com offset fixo de Brasília. */
export function toIso(date: string, time: string): string {
  return `${date}T${time.slice(0, 5)}:00${BRT_OFFSET}`;
}

/** timestamptz do banco → ISO em hora de Brasília. */
export function stampToIso(stamp: string): string {
  const d = new Date(stamp);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}${BRT_OFFSET}`;
}

export const STATUS_TO_API: Record<string, string> = {
  scheduled: 'SCHEDULED',
  confirmed: 'CONFIRMED',
  completed: 'COMPLETED',
  cancelled: 'CANCELLED',
};

export const STATUS_FROM_API: Record<string, string> = {
  SCHEDULED: 'scheduled',
  CONFIRMED: 'confirmed',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function apiError(status: number, code: string, message: string, details?: unknown): Response {
  return json({ error: { code, message, details: details ?? {} } }, status);
}

/** Resposta dos RPCs ({ ok, http, code, message, details, body }) → HTTP. */
export function fromRpc(result: {
  ok: boolean; http: number; code?: string; message?: string; details?: unknown; body?: unknown;
}): Response {
  if (result.ok) return json(result.body, result.http);
  return apiError(result.http, result.code ?? 'ERROR', result.message ?? 'Erro.', result.details);
}
