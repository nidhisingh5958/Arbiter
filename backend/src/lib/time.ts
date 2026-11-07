export const nowIso = (): string => new Date().toISOString();

export function addSecondsIso(iso: string, seconds: number): string {
  return new Date(Date.parse(iso) + seconds * 1000).toISOString();
}

export function startOfUtcDayIso(date = new Date()): string {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString();
}

export function isoDatePlusDays(days: number, from = new Date()): string {
  return new Date(from.getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
