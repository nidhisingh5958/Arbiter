import type { MilestoneAction, MilestoneStatus, Role } from './enums';

export interface ActionContext {
  status: MilestoneStatus;
  role: Role;
  /** The viewer is the buyer on this contract. */
  isBuyer: boolean;
  /** The viewer is the contractor on this contract. */
  isContractor: boolean;
  /** A payout has already been initiated for this milestone. */
  hasPayout: boolean;
}

/**
 * Which human actions are available on a milestone. The backend enforces the same
 * rules; the frontend uses this only to decide which buttons to render.
 */
export function computeAllowedActions(ctx: ActionContext): MilestoneAction[] {
  const { status, role, isBuyer, isContractor, hasPayout } = ctx;
  const isAdmin = role === 'admin';
  const actions: MilestoneAction[] = [];

  if (isBuyer && status === 'FUNDING_REQUIRED') actions.push('FUND');
  if (isContractor && (status === 'FUNDED' || status === 'REJECTED' || status === 'ESCALATED')) actions.push('SUBMIT');

  const buyerCanDispute = isBuyer && status === 'APPROVED' && !hasPayout;
  const contractorCanDispute = isContractor && (status === 'REJECTED' || status === 'ESCALATED');
  if (buyerCanDispute || contractorCanDispute) actions.push('DISPUTE');

  const canResolve = (status === 'ESCALATED' && (isBuyer || isAdmin)) || (status === 'DISPUTED' && isAdmin);
  if (canResolve) actions.push('RESOLVE_APPROVE', 'RESOLVE_REJECT');

  if ((isBuyer || isAdmin) && (status === 'FUNDED' || status === 'REJECTED' || status === 'ESCALATED')) {
    actions.push('REFUND');
  }
  if (isBuyer && status === 'APPROVED' && !hasPayout) actions.push('WAIVE_WINDOW');
  if (isAdmin && (status === 'REJECTED' || status === 'ESCALATED')) actions.push('REVERIFY');

  return actions;
}
