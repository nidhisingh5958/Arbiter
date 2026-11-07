import { z } from 'zod';

export const MILESTONE_STATUSES = [
  'PENDING',
  'FUNDING_REQUIRED',
  'FUNDED',
  'SUBMITTED',
  'VERIFYING',
  'APPROVED',
  'REJECTED',
  'ESCALATED',
  'DISPUTED',
  'PAID',
  'EXPIRED',
  'REFUNDED',
] as const;
export const MilestoneStatusSchema = z.enum(MILESTONE_STATUSES);
export type MilestoneStatus = z.infer<typeof MilestoneStatusSchema>;

export const CONTRACT_STATUSES = ['ACTIVE', 'COMPLETED', 'CANCELLED'] as const;
export const ContractStatusSchema = z.enum(CONTRACT_STATUSES);
export type ContractStatus = z.infer<typeof ContractStatusSchema>;

export const ROLES = ['buyer', 'contractor', 'admin'] as const;
export const RoleSchema = z.enum(ROLES);
export type Role = z.infer<typeof RoleSchema>;

export const VERIFICATION_TYPES = ['GITHUB_PR', 'URL', 'FILE'] as const;
export const VerificationTypeSchema = z.enum(VERIFICATION_TYPES);
export type VerificationType = z.infer<typeof VerificationTypeSchema>;

export const VERDICTS = ['APPROVE', 'REJECT', 'ESCALATE'] as const;
export const VerdictSchema = z.enum(VERDICTS);
export type Verdict = z.infer<typeof VerdictSchema>;

export const CHECK_STATUSES = ['PASS', 'FAIL', 'WARN', 'SKIP', 'ERROR'] as const;
export const CheckStatusSchema = z.enum(CHECK_STATUSES);
export type CheckStatus = z.infer<typeof CheckStatusSchema>;

export const SEVERITIES = ['info', 'low', 'medium', 'high', 'critical'] as const;
export const SeveritySchema = z.enum(SEVERITIES);
export type Severity = z.infer<typeof SeveritySchema>;

export const INSPECTION_CATEGORIES = ['deterministic', 'injection', 'llm', 'policy'] as const;
export type InspectionCategory = (typeof INSPECTION_CATEGORIES)[number];

export const PAYMENT_KINDS = ['ORDER', 'CAPTURE', 'AUTHORIZATION', 'PAYOUT', 'REFUND'] as const;
export type PaymentKind = (typeof PAYMENT_KINDS)[number];

export const PAYMENT_SOURCES = ['API', 'WEBHOOK', 'POLL', 'MOCK'] as const;
export type PaymentSource = (typeof PAYMENT_SOURCES)[number];

export const DECISION_ACTIONS = [
  'EXTRACTION',
  'DETERMINISTIC_CHECKS',
  'INJECTION_SCAN',
  'LLM_VERDICT',
  'POLICY_GATE',
  'FINAL_DECISION',
  'TOOL_CALL',
  'HUMAN_OVERRIDE',
  'DISPUTE',
  'WEBHOOK',
] as const;
export type DecisionAction = (typeof DECISION_ACTIONS)[number];

export const ESCROW_MODES = ['capture_then_payout', 'authorize_then_capture'] as const;
export const EscrowModeSchema = z.enum(ESCROW_MODES);
export type EscrowMode = z.infer<typeof EscrowModeSchema>;

export const DISPUTE_STATUSES = ['OPEN', 'RESOLVED_RELEASE', 'RESOLVED_REJECT'] as const;
export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];

export const MILESTONE_ACTIONS = [
  'FUND',
  'SUBMIT',
  'DISPUTE',
  'RESOLVE_APPROVE',
  'RESOLVE_REJECT',
  'REFUND',
  'WAIVE_WINDOW',
  'REVERIFY',
] as const;
export type MilestoneAction = (typeof MILESTONE_ACTIONS)[number];
