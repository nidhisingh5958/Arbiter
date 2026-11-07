import { payPalValueToCents } from '@arbiter/shared';
import type { DecisionLog } from '../agent/decisionLog';
import { AppError, badRequest, errorMessage } from '../lib/errors';
import type { Logger } from '../lib/logger';
import { nowIso } from '../lib/time';
import type { PayPalGateway, PayPalWebhookEvent } from '../paypal/types';
import type { EventBus } from '../realtime/eventBus';
import type { Repositories } from '../repositories';
import type { FundingService } from './funding';
import type { PayoutService } from './payouts';

export interface WebhookDeps {
  repos: Repositories;
  paypal: PayPalGateway;
  funding: FundingService;
  payouts: PayoutService;
  decisionLog: DecisionLog;
  bus: EventBus;
  log: Logger;
}

export type WebhookResult = { status: 'processed' | 'duplicate'; eventId: string; eventType: string };

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {});
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

/**
 * PayPal webhook receiver: signature verification first (unsigned/invalid events are rejected),
 * then idempotency by PayPal event id, then idempotent state updates.
 */
export class WebhookService {
  constructor(private readonly d: WebhookDeps) {}

  async handle(rawBody: string, headers: Record<string, string | string[] | undefined>): Promise<WebhookResult> {
    let event: PayPalWebhookEvent;
    try {
      event = JSON.parse(rawBody) as PayPalWebhookEvent;
    } catch {
      throw badRequest('Webhook body is not valid JSON');
    }
    if (!str(event.id) || !str(event.event_type)) throw badRequest('Webhook event is missing id or event_type');
    const resource = obj(event.resource);
    const base = {
      id: event.id,
      event_type: event.event_type,
      resource_type: str(event.resource_type),
      resource_id: str(resource.id) ?? str(resource.payout_item_id) ?? str(obj(resource.batch_header).payout_batch_id),
      payload: rawBody.slice(0, 50_000),
      received_at: nowIso(),
      processed_at: null,
      duplicate_count: 0,
    };

    const verified = await this.d.paypal.verifyWebhookSignature({ headers, rawBody });
    if (!verified) {
      await this.d.repos.webhookEvents.insertIfNew({ ...base, verified: 0, processed: 0, error: 'Signature verification failed' });
      this.d.bus.publish({ type: 'webhook.received', eventId: event.id, eventType: event.event_type, verified: false, duplicate: false });
      throw new AppError(401, 'INVALID_SIGNATURE', 'Webhook signature verification failed');
    }

    const existing = await this.d.repos.webhookEvents.get(event.id);
    if (existing?.verified === 1) {
      await this.d.repos.webhookEvents.bumpDuplicate(event.id);
      this.d.bus.publish({ type: 'webhook.received', eventId: event.id, eventType: event.event_type, verified: true, duplicate: true });
      return { status: 'duplicate', eventId: event.id, eventType: event.event_type };
    }
    const inserted = await this.d.repos.webhookEvents.insertIfNew({ ...base, verified: 1, processed: 0, error: null });
    if (!inserted) {
      // A forged event with this id was stored earlier; this signed delivery supersedes it.
      await this.d.repos.webhookEvents.markVerified(event.id, rawBody.slice(0, 50_000));
    }
    this.d.bus.publish({ type: 'webhook.received', eventId: event.id, eventType: event.event_type, verified: true, duplicate: false });

    try {
      const milestoneId = await this.process(event, resource);
      await this.d.repos.webhookEvents.markProcessed(event.id, null);
      if (milestoneId) {
        await this.d.decisionLog.append({
          milestoneId,
          action: 'WEBHOOK',
          actor: 'paypal:webhook',
          inputs: { eventId: event.id },
          outputs: { eventType: event.event_type, resourceId: base.resource_id },
        });
      }
    } catch (err) {
      const message = errorMessage(err);
      this.d.log.error({ eventId: event.id, eventType: event.event_type, err: message }, 'webhook processing failed');
      await this.d.repos.webhookEvents.markProcessed(event.id, message);
    }
    return { status: 'processed', eventId: event.id, eventType: event.event_type };
  }

  /** Returns the affected milestone id, if any. Every branch is safe to run twice. */
  private async process(event: PayPalWebhookEvent, r: Obj): Promise<string | null> {
    const { repos } = this.d;
    const type = event.event_type;

    if (type === 'CHECKOUT.ORDER.APPROVED') {
      const order = str(r.id) ? await repos.payments.findByOrderId(str(r.id)!, 'ORDER') : null;
      if (!order) return null;
      await repos.payments.update(order.id, { status: order.status === 'COMPLETED' ? 'COMPLETED' : 'APPROVED', last_event_id: event.id, updated_at: nowIso() });
      const m = await repos.milestones.getRow(order.milestone_id);
      if (m?.status === 'FUNDING_REQUIRED') {
        // Safety net: capture even if the buyer closed the tab before returning.
        await this.d.funding.complete('system:webhook', m.id, order.paypal_order_id!).catch((e) =>
          this.d.log.warn({ err: errorMessage(e) }, 'webhook-driven capture skipped'),
        );
      }
      return order.milestone_id;
    }

    if (type.startsWith('PAYMENT.CAPTURE.')) {
      const captureId = str(r.id);
      const status = str(r.status) ?? type.split('.').pop()!;
      if (type === 'PAYMENT.CAPTURE.REFUNDED') {
        const refund = captureId ? await repos.payments.findRefund(captureId) : null;
        if (refund) await repos.payments.update(refund.id, { status: 'COMPLETED', last_event_id: event.id, updated_at: nowIso() });
        return refund?.milestone_id ?? null;
      }
      const capture = captureId ? await repos.payments.findByCaptureId(captureId) : null;
      const fee = obj(obj(obj(r.seller_receivable_breakdown).paypal_fee)).value;
      if (capture) {
        await repos.payments.update(capture.id, {
          status,
          fee_cents: fee !== undefined ? payPalValueToCents(fee as string) : capture.fee_cents,
          last_event_id: event.id,
          source: 'WEBHOOK',
          updated_at: nowIso(),
        });
        this.d.bus.publish({ type: 'payment.updated', paymentId: capture.id, milestoneId: capture.milestone_id, kind: 'CAPTURE', status });
      }
      const milestoneId = capture?.milestone_id ?? str(r.custom_id);
      if (milestoneId && type === 'PAYMENT.CAPTURE.COMPLETED') {
        await this.d.funding.markFundedFromWebhook(milestoneId, `Capture ${captureId ?? ''} completed (webhook)`);
      }
      return milestoneId;
    }

    if (type.startsWith('PAYMENT.AUTHORIZATION.')) {
      const auth = str(r.id) ? await repos.payments.findByAuthorizationId(str(r.id)!) : null;
      if (auth) await repos.payments.update(auth.id, { status: str(r.status) ?? 'CREATED', last_event_id: event.id, updated_at: nowIso() });
      const milestoneId = auth?.milestone_id ?? str(r.custom_id);
      if (milestoneId && type === 'PAYMENT.AUTHORIZATION.CREATED') {
        await this.d.funding.markFundedFromWebhook(milestoneId, 'Authorization created (webhook)');
      }
      return milestoneId;
    }

    if (type.startsWith('PAYMENT.PAYOUTS-ITEM.')) {
      const batchId = str(r.payout_batch_id);
      const payment = batchId ? await repos.payments.findByBatchId(batchId) : null;
      if (!payment) return null;
      const fee = obj(r.payout_item_fee).value;
      await this.d.payouts.applyPayoutStatus(payment, {
        batchStatus: null,
        itemStatus: str(r.transaction_status) ?? type.split('.').pop()!,
        itemId: str(r.payout_item_id),
        feeCents: fee !== undefined ? payPalValueToCents(fee as string) : null,
        source: 'WEBHOOK',
        eventId: event.id,
      });
      return payment.milestone_id;
    }

    if (type.startsWith('PAYMENT.PAYOUTSBATCH.')) {
      const batchId = str(obj(r.batch_header).payout_batch_id);
      const payment = batchId ? await repos.payments.findByBatchId(batchId) : null;
      if (!payment || !batchId) return null;
      const details = await this.d.paypal.getPayoutBatch(batchId);
      await this.d.payouts.applyPayoutStatus(payment, {
        batchStatus: details.batchStatus,
        itemStatus: details.itemStatus,
        itemId: details.itemId,
        feeCents: details.feeCents,
        source: 'WEBHOOK',
        eventId: event.id,
      });
      return payment.milestone_id;
    }

    return null; // Unhandled event types are stored and acknowledged.
  }
}
