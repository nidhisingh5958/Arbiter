import type { CheckStatus, Severity } from '@arbiter/shared';
import type { UntrustedSource } from '../../llm/prompts';

/**
 * A deterministic check result. `message` must never contain attacker-controlled free text
 * (PR titles, file names, page copy): it is shown to the LLM as trusted fact. Such content
 * belongs in `evidence` (UI only) or in `untrusted` sources (delimited for the LLM).
 */
export interface CheckResult {
  name: string;
  status: CheckStatus;
  severity: Severity;
  message: string;
  evidence: Record<string, unknown>;
}

export interface VerifierOutput {
  checks: CheckResult[];
  untrusted: UntrustedSource[];
  facts: Record<string, unknown>;
}

export const pass = (name: string, message: string, evidence: Record<string, unknown> = {}): CheckResult => ({
  name,
  status: 'PASS',
  severity: 'info',
  message,
  evidence,
});

export const fail = (name: string, severity: Severity, message: string, evidence: Record<string, unknown> = {}): CheckResult => ({
  name,
  status: 'FAIL',
  severity,
  message,
  evidence,
});

export const warn = (name: string, message: string, evidence: Record<string, unknown> = {}): CheckResult => ({
  name,
  status: 'WARN',
  severity: 'low',
  message,
  evidence,
});

export const errored = (name: string, message: string, evidence: Record<string, unknown> = {}): CheckResult => ({
  name,
  status: 'ERROR',
  severity: 'medium',
  message,
  evidence,
});

export interface CheckSummary {
  deterministicPass: boolean;
  errored: boolean;
  failed: CheckResult[];
}

/** Hard gate: any FAIL or ERROR means the deterministic layer did not pass. */
export function summarizeChecks(checks: CheckResult[]): CheckSummary {
  const failed = checks.filter((c) => c.status === 'FAIL' || c.status === 'ERROR');
  return {
    deterministicPass: checks.length > 0 && failed.length === 0,
    errored: checks.some((c) => c.status === 'ERROR'),
    failed,
  };
}
