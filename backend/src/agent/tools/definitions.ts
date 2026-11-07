import { z, type ZodType } from 'zod';
import type { PaymentKind } from '@arbiter/shared';
import type { AppConfig } from '../../config/env';
import { newId } from '../../lib/crypto';
import { badRequest, conflict, notFound } from '../../lib/errors';
import type { Logger } from '../../lib/logger';
import { nowIso } from '../../lib/time';
import type { PayPalGateway } from '../../paypal/types';
import type { EventBus } from '../../realtime/eventBus';
import type { Repositories } from '../../repositories';
import type { MilestoneTransitions } from '../../services/transitions';
import { PolicyDeniedError, type ReleaseGrants } from '../policy/grants';
import type { PaymentsTable } from '../../db/types';

export interface ToolExecContext {
  /** Who is calling: `agent:payments`, `user:<id>`, `system:webhook`, `mcp:<id>` … */
  actor: string;
  /** Injected server-side from the policy engine; never visible to the model. */
  grantToken?: string;
  /** Restricts which tools this caller may use. */
  allowedTools?: string[];
}

export interface ToolDeps {
  config: AppConfig;
  repos: Repositories;
  paypal: PayPalGateway;
  grants: ReleaseGrants;
  transitions: MilestoneTransitions;
  bus: EventBus;
  log: Logger;
}

export interface ToolDefinition {
  name: string;
  description: string;
  movesMoney: boolean;
  humanOnly: boolean;
  input: ZodType;
  run(input: unknown, ctx: ToolExecContext, deps: ToolDeps): Promise<Record<string, unknown>>;
}

function defineTool<S extends ZodType>(def: {
  name: string;
  description: string;
  movesMoney: boolean;
  humanOnly?: boolean;
  input: S;
  run: (input: z.output<S>, ctx: ToolExecContext, deps: ToolDeps) => Promise<Record<string, unknown>>;
}): ToolDefinition {
  return {
    name: def.name,
    description: def.description,
    movesMoney: def.movesMoney,
    humanOnly: def.humanOnly ?? false,
    input: def.input,
    run: (input, ctx, deps) => def.run(input as z.output<S>, ctx, deps),
  };
}

const milestoneId = z.string().min(3).max(64).describe('ArbiterAI milestone id');

async function loadMilestone(deps: ToolDeps, id: string) {
  const m = await deps.repos.milestones.getRow(id);
  if (!m) throw notFound('Milestone');
  const c = await deps.repos.contracts.getRow(m.contract_id);
  if (!c) throw notFound('Contract');
  return { m, c };
}

async function recordPayment(deps: ToolDeps, row: Omit<PaymentsTable, 'id' | 'created_at' | 'updated_at'>): Promise<PaymentsTable> {
  const ts = nowIso();
  const full: PaymentsTable = { id: newId('pay'), created_at: ts, updated_at: ts, ...row };
  await deps.repos.payments.insert(full);
  deps.bus.publish({ type: 'payment.updated', paymentId: full.id, milestoneId: full.milestone_id, kind: full.kind as PaymentKind, status: full.status });
  return full;
}

export const TOOLS: ToolDefinition[] = [
  defineTool({
    name: 'create_order',
    description: 'Create a PayPal Orders v2 order that funds one milestone into the platform escrow (sandbox). Returns the buyer approval URL.',
    movesMoney: false,
    input: z.object({ milestone_id: milestoneId }),
    async run({ milestone_id }, _ctx, deps) {
      const { m, c } = await loadMilestone(deps, milestone_id);
      if (m.status !== 'FUNDING_REQUIRED') throw conflict(`Milestone is ${m.status}; only FUNDING_REQUIRED milestones can be funded`);
      const requestId = newId('ord');
      const web = deps.config.publicWebUrl;
      const order = await deps.paypal.createOrder({
        milestoneId: m.id,
        contractId: c.id,
        description: `${c.title} — ${m.title}`,
        amountCents: m.amount_cents,
        currency: m.currency,
        intent: deps.config.escrowMode === 'capture_then_payout' ? 'CAPTURE' : 'AUTHORIZE',
        returnUrl: `${web}/funding/return?milestoneId=${encodeURIComponent(m.id)}`,
        cancelUrl: `${web}/funding/cancel?milestoneId=${encodeURIComponent(m.id)}`,
        requestId,
      });
      if (!order.approveUrl) throw badRequest('PayPal did not return an approval link for this order');
      await recordPayment(deps, {
        milestone_id: m.id,
        contract_id: c.id,
        kind: 'ORDER',
        status: order.status,
        amount_cents: m.amount_cents,
        fee_cents: null,
        currency: m.currency,
        paypal_order_id: order.id,
        paypal_capture_id: null,
        paypal_authorization_id: null,
        payout_batch_id: null,
        payout_item_id: null,
        refund_id: null,
        request_id: requestId,
        approve_url: order.approveUrl,
        source: deps.paypal.mode === 'mock' ? 'MOCK' : 'API',
        last_event_id: null,
        raw: JSON.stringify(order.raw).slice(0, 8000),
      });
      return { order_id: order.id, status: order.status, approve_url: order.approveUrl };
    },
  }),

  defineTool({
    name: 'capture_order',
    description: 'Capture (or authorize, depending on ESCROW_MODE) a buyer-approved order into the platform escrow balance.',
    movesMoney: true,
    input: z.object({ milestone_id: milestoneId, order_id: z.string().min(3).max(64) }),
    async run({ milestone_id, order_id }, _ctx, deps) {
      const { m, c } = await loadMilestone(deps, milestone_id);
      const order = await deps.repos.payments.findByOrderId(order_id, 'ORDER');
      if (!order || order.milestone_id !== m.id) throw badRequest('This PayPal order does not belong to the milestone');
      const source = deps.paypal.mode === 'mock' ? 'MOCK' : 'API';

      if (deps.config.escrowMode === 'capture_then_payout') {
        const existing = await deps.repos.payments.latestOfKind(m.id, 'CAPTURE');
        if (existing && existing.paypal_order_id === order_id && existing.status === 'COMPLETED') {
          return { mode: 'capture', status: existing.status, capture_id: existing.paypal_capture_id, idempotent: true };
        }
        const cap = await deps.paypal.captureOrder(order_id, `cap-${order_id}`);
        await deps.repos.payments.update(order.id, { status: 'COMPLETED', updated_at: nowIso() });
        const known = await deps.repos.payments.findByCaptureId(cap.captureId);
        if (!known) {
          await recordPayment(deps, {
            milestone_id: m.id,
            contract_id: c.id,
            kind: 'CAPTURE',
            status: cap.status,
            amount_cents: cap.amountCents,
            fee_cents: cap.feeCents,
            currency: cap.currency,
            paypal_order_id: order_id,
            paypal_capture_id: cap.captureId,
            paypal_authorization_id: null,
            payout_batch_id: null,
            payout_item_id: null,
            refund_id: null,
            request_id: `cap-${order_id}`,
            approve_url: null,
            source,
            last_event_id: null,
            raw: JSON.stringify(cap.raw).slice(0, 8000),
          });
        }
        return { mode: 'capture', status: cap.status, capture_id: cap.captureId, amount_cents: cap.amountCents };
      }

      const existingAuth = await deps.repos.payments.latestOfKind(m.id, 'AUTHORIZATION');
      if (existingAuth && existingAuth.paypal_order_id === order_id) {
        return { mode: 'authorize', status: existingAuth.status, authorization_id: existingAuth.paypal_authorization_id, idempotent: true };
      }
      const auth = await deps.paypal.authorizeOrder(order_id, `auth-${order_id}`);
      await deps.repos.payments.update(order.id, { status: 'COMPLETED', updated_at: nowIso() });
      await recordPayment(deps, {
        milestone_id: m.id,
        contract_id: c.id,
        kind: 'AUTHORIZATION',
        status: auth.status,
        amount_cents: auth.amountCents,
        fee_cents: null,
        currency: m.currency,
        paypal_order_id: order_id,
        paypal_capture_id: null,
        paypal_authorization_id: auth.authorizationId,
        payout_batch_id: null,
        payout_item_id: null,
        refund_id: null,
        request_id: `auth-${order_id}`,
        approve_url: null,
        source,
        last_event_id: null,
        raw: JSON.stringify(auth.raw).slice(0, 8000),
      });
      return { mode: 'authorize', status: auth.status, authorization_id: auth.authorizationId, expires_at: auth.expiresAt };
    },
  }),

  defineTool({
    name: 'create_payout',
    description:
      'Pay the contractor for an APPROVED milestone via PayPal Payouts. Amount and recipient are resolved server-side. Requires a release grant from the policy engine.',
    movesMoney: true,
    input: z.object({ milestone_id: milestoneId, memo: z.string().max(200).optional() }),
    async run({ milestone_id, memo }, ctx, deps) {
      const { m, c } = await loadMilestone(deps, milestone_id);
      if (m.status !== 'APPROVED') throw new PolicyDeniedError(`Milestone is ${m.status}; payouts require APPROVED`);
      if (await deps.repos.payments.activePayout(m.id)) throw conflict('A payout already exists for this milestone');
      if (await deps.repos.disputes.openFor(m.id)) throw new PolicyDeniedError('An open dispute pauses payouts');
      const grant = await deps.grants.consume(ctx.grantToken, m.id, m.amount_cents);

      const contractor = await deps.repos.users.get(c.contractor_id);
      if (!contractor?.paypalEmail) throw badRequest('The contractor has no PayPal payout email on file');
      const source = deps.paypal.mode === 'mock' ? 'MOCK' : 'API';

      if (deps.config.escrowMode === 'authorize_then_capture') {
        const auth = await deps.repos.payments.latestOfKind(m.id, 'AUTHORIZATION');
        if (!auth?.paypal_authorization_id) throw conflict('No PayPal authorization found to capture for this milestone');
        const cap = await deps.paypal.captureAuthorization(auth.paypal_authorization_id, m.amount_cents, m.currency, `capauth-${auth.paypal_authorization_id}`);
        await deps.repos.payments.update(auth.id, { status: 'CAPTURED', updated_at: nowIso() });
        if (!(await deps.repos.payments.findByCaptureId(cap.captureId))) {
          await recordPayment(deps, {
            milestone_id: m.id,
            contract_id: c.id,
            kind: 'CAPTURE',
            status: cap.status,
            amount_cents: cap.amountCents,
            fee_cents: cap.feeCents,
            currency: cap.currency,
            paypal_order_id: auth.paypal_order_id,
            paypal_capture_id: cap.captureId,
            paypal_authorization_id: auth.paypal_authorization_id,
            payout_batch_id: null,
            payout_item_id: null,
            refund_id: null,
            request_id: `capauth-${auth.paypal_authorization_id}`,
            approve_url: null,
            source,
            last_event_id: null,
            raw: JSON.stringify(cap.raw).slice(0, 8000),
          });
        }
      }

      const requestId = `po-${m.id}-${grant.id}`.slice(0, 100);
      const payout = await deps.paypal.createPayout({
        senderBatchId: `arb-${m.id}-${grant.id}`.slice(0, 120),
        senderItemId: m.id,
        receiverEmail: contractor.paypalEmail,
        amountCents: m.amount_cents,
        currency: m.currency,
        note: memo ? `ArbiterAI: ${memo}`.slice(0, 200) : `ArbiterAI milestone payout — ${m.title}`.slice(0, 200),
        emailSubject: 'You have a milestone payout from ArbiterAI (sandbox)',
        requestId,
      });
      const row = await recordPayment(deps, {
        milestone_id: m.id,
        contract_id: c.id,
        kind: 'PAYOUT',
        status: payout.batchStatus,
        amount_cents: m.amount_cents,
        fee_cents: payout.feeCents,
        currency: m.currency,
        paypal_order_id: null,
        paypal_capture_id: null,
        paypal_authorization_id: null,
        payout_batch_id: payout.batchId,
        payout_item_id: payout.itemId,
        refund_id: null,
        request_id: requestId,
        approve_url: null,
        source,
        last_event_id: null,
        raw: JSON.stringify(payout.raw).slice(0, 8000),
      });
      return { payout_batch_id: payout.batchId, batch_status: payout.batchStatus, payment_id: row.id, grant: grant.kind };
    },
  }),

  defineTool({
    name: 'get_payout_status',
    description: 'Read the status of a PayPal payout batch and its item.',
    movesMoney: false,
    input: z.object({ payout_batch_id: z.string().min(3).max(64) }),
    async run({ payout_batch_id }, _ctx, deps) {
      const res = await deps.paypal.getPayoutBatch(payout_batch_id);
      return { payout_batch_id, batch_status: res.batchStatus, item_status: res.itemStatus, payout_item_id: res.itemId };
    },
  }),

  defineTool({
    name: 'hold_milestone',
    description: 'Hold an APPROVED milestone instead of paying it, escalating it to human review with a reason.',
    movesMoney: false,
    input: z.object({ milestone_id: milestoneId, reason: z.string().min(3).max(300) }),
    async run({ milestone_id, reason }, ctx, deps) {
      const { m } = await loadMilestone(deps, milestone_id);
      if (m.status !== 'APPROVED') return { held: false, status: m.status, note: 'Milestone is not awaiting release' };
      await deps.transitions.transition(m.id, 'ESCALATED', {
        patch: { decision_verdict: 'ESCALATE', decision_summary: `Held by payments agent: ${reason}`, release_at: null },
        actorId: null,
        actorRole: ctx.actor,
        reason,
      });
      return { held: true, status: 'ESCALATED' };
    },
  }),

  defineTool({
    name: 'refund_capture',
    description: 'Refund the buyer for a funded milestone (refund the capture, or void the authorization). Human-initiated only.',
    movesMoney: true,
    humanOnly: true,
    input: z.object({ milestone_id: milestoneId, reason: z.string().min(3).max(300) }),
    async run({ milestone_id, reason }, _ctx, deps) {
      const { m, c } = await loadMilestone(deps, milestone_id);
      if (await deps.repos.payments.activePayout(m.id)) throw conflict('Funds were already paid out; refund is not possible');
      const source = deps.paypal.mode === 'mock' ? 'MOCK' : 'API';
      const base = {
        milestone_id: m.id,
        contract_id: c.id,
        kind: 'REFUND',
        amount_cents: m.amount_cents,
        fee_cents: null,
        currency: m.currency,
        paypal_order_id: null,
        payout_batch_id: null,
        payout_item_id: null,
        approve_url: null,
        source,
        last_event_id: null,
      } as const;

      const capture = await deps.repos.payments.latestOfKind(m.id, 'CAPTURE');
      if (capture?.paypal_capture_id) {
        const requestId = `ref-${capture.paypal_capture_id}`;
        const res = await deps.paypal.refundCapture(capture.paypal_capture_id, m.amount_cents, m.currency, requestId, reason);
        await recordPayment(deps, {
          ...base,
          status: res.status,
          paypal_capture_id: capture.paypal_capture_id,
          paypal_authorization_id: null,
          refund_id: res.refundId,
          request_id: requestId,
          raw: JSON.stringify(res.raw).slice(0, 8000),
        });
        return { refund_id: res.refundId, status: res.status };
      }
      const auth = await deps.repos.payments.latestOfKind(m.id, 'AUTHORIZATION');
      if (auth?.paypal_authorization_id) {
        const requestId = `void-${auth.paypal_authorization_id}`;
        await deps.paypal.voidAuthorization(auth.paypal_authorization_id, requestId);
        await deps.repos.payments.update(auth.id, { status: 'VOIDED', updated_at: nowIso() });
        await recordPayment(deps, {
          ...base,
          status: 'VOIDED',
          paypal_capture_id: null,
          paypal_authorization_id: auth.paypal_authorization_id,
          refund_id: null,
          request_id: requestId,
          raw: null,
        });
        return { voided_authorization_id: auth.paypal_authorization_id, status: 'VOIDED' };
      }
      throw conflict('No captured or authorized funds found for this milestone');
    },
  }),
];
