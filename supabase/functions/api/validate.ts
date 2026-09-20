/** Validação de entrada. Erro aqui é sempre VALIDATION_ERROR com o campo. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Offset obrigatório: "2026-09-20T14:30:00-03:00" ou "...Z".
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export class ValidationError extends Error {
  constructor(readonly field: string, message: string) {
    super(message);
  }
}

export function uuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw new ValidationError(field, `${field} deve ser um UUID.`);
  }
  return value;
}

export function isoWithOffset(value: unknown, field: string): string {
  if (typeof value !== 'string' || !ISO_WITH_OFFSET.test(value) || Number.isNaN(Date.parse(value))) {
    throw new ValidationError(field, `${field} deve ser ISO 8601 com offset explícito (ex.: 2026-09-20T14:30:00-03:00).`);
  }
  return value;
}

export function optionalIsoWithOffset(value: unknown, field: string): string | null {
  return value === undefined || value === null ? null : isoWithOffset(value, field);
}

export function dateOnly(value: unknown, field: string): string {
  if (typeof value !== 'string' || !DATE_ONLY.test(value)) {
    throw new ValidationError(field, `${field} deve ser uma data YYYY-MM-DD.`);
  }
  return value;
}

export function nonEmpty(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ValidationError(field, `${field} é obrigatório.`);
  }
  return value.trim();
}

export function days(value: string | null): number {
  const n = Number(value);
  if (!value || !Number.isInteger(n) || n < 1) {
    throw new ValidationError('days', 'days é obrigatório e deve ser um inteiro ≥ 1.');
  }
  return n;
}
