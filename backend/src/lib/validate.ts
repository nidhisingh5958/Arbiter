import type { ZodType } from 'zod';
import { badRequest } from './errors';

export interface ValidationIssue {
  path: string;
  message: string;
}

export function formatIssues(issues: readonly { path: readonly PropertyKey[]; message: string }[]): ValidationIssue[] {
  return issues.map((i) => ({ path: i.path.map(String).join('.') || '(root)', message: i.message }));
}

/** Parse untrusted input with a zod schema; throws a 400 with readable issues on failure. */
export function parseOrThrow<T>(schema: ZodType<T>, data: unknown, label = 'request'): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = formatIssues(result.error.issues);
    const first = issues[0];
    throw badRequest(`Invalid ${label}: ${first ? `${first.path} — ${first.message}` : 'validation failed'}`, { issues });
  }
  return result.data;
}
