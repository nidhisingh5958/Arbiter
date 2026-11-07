import type { MilestoneStatus } from './enums';

/**
 * The single source of truth for milestone lifecycle transitions.
 * Every status change in the backend goes through `assertTransition`.
 */
export const MILESTONE_TRANSITIONS: Readonly<Record<MilestoneStatus, readonly MilestoneStatus[]>> = {
  PENDING: ['FUNDING_REQUIRED'],
  FUNDING_REQUIRED: ['FUNDED', 'EXPIRED'],
  FUNDED: ['SUBMITTED', 'REFUNDED', 'EXPIRED'],
  SUBMITTED: ['VERIFYING'],
  VERIFYING: ['APPROVED', 'REJECTED', 'ESCALATED'],
  APPROVED: ['PAID', 'DISPUTED', 'ESCALATED'],
  REJECTED: ['SUBMITTED', 'VERIFYING', 'DISPUTED', 'REFUNDED'],
  ESCALATED: ['APPROVED', 'REJECTED', 'DISPUTED', 'REFUNDED', 'SUBMITTED', 'VERIFYING'],
  DISPUTED: ['APPROVED', 'REJECTED'],
  PAID: [],
  EXPIRED: [],
  REFUNDED: [],
};

export const TERMINAL_STATUSES: readonly MilestoneStatus[] = ['PAID', 'EXPIRED', 'REFUNDED'];

export class IllegalTransitionError extends Error {
  readonly from: MilestoneStatus;
  readonly to: MilestoneStatus;

  constructor(from: MilestoneStatus, to: MilestoneStatus) {
    super(`Illegal milestone transition ${from} → ${to}`);
    this.name = 'IllegalTransitionError';
    this.from = from;
    this.to = to;
  }
}

export function canTransition(from: MilestoneStatus, to: MilestoneStatus): boolean {
  return MILESTONE_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: MilestoneStatus, to: MilestoneStatus): void {
  if (!canTransition(from, to)) throw new IllegalTransitionError(from, to);
}

export function isTerminal(status: MilestoneStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/** Statuses in which funds are held by the platform (captured or authorized, not yet paid out/refunded). */
export const ESCROWED_STATUSES: readonly MilestoneStatus[] = [
  'FUNDED',
  'SUBMITTED',
  'VERIFYING',
  'APPROVED',
  'REJECTED',
  'ESCALATED',
  'DISPUTED',
];

export function isEscrowed(status: MilestoneStatus): boolean {
  return ESCROWED_STATUSES.includes(status);
}
