import { randomBytes } from 'node:crypto';
import { centsToPayPalValue } from '@arbiter/shared';
import { hmacHex, safeEqualHex } from '../lib/crypto';
import { nowIso } from '../lib/time';
import {
  PayPalApiError,
  headerValue,
  type AuthorizationResult,
  type CaptureResult,
  type CreateOrderInput,
  type CreatePayoutInput,
  type PayPalGateway,
  type PayPalOrder,
  type PayoutResult,
  type RefundResult,
  type WebhookVerificationInput,
} from './types';

export type WebhookSink = (rawBody: string, headers: Record<string, string>) => Promise<unknown>;

interface MockOrder {
  id: string;
  status: 'CREATED' | 'PAYER_ACTION_REQUIRED' | 'APPROVED' | 'COMPLETED' | 'VOIDED';
  intent: 'CAPTURE' | 'AUTHORIZE';
  milestoneId: string;
  description: string;
  amountCents: number;
  currency: string;
  returnUrl: string;
  cancelUrl: string;
  captureId?: string;
  authorizationId?: string;
}

interface MockBatch {
  batchId: string;
  batchStatus: string;
  itemId: string;
  itemStatus: string;
  amountCents: number;
  currency: string;
  senderItemId: string;
  receiver: string;
}

const MOCK_ALGO = 'HMACSHA256-MOCK';
const shortId = (n = 8) => randomBytes(n).toString('hex').toUpperCase().slice(0, n * 2);

/** Simulated fee for the offline demo only — not PayPal's actual pricing. */
const simulatedFee = (cents: number) => Math.round(cents * 0.0349) + 49;

/**
 * In-memory PayPal simulator mirroring the sandbox flow (order → approve → capture/authorize →
 * payout). It delivers HMAC-signed webhooks through the same verification + idempotency path
 * as real PayPal events, and deliberately re-delivers some events to exercise de-duplication.
 */
export class MockPayPal implements PayPalGateway {
  readonly mode = 'mock' as const;
  private readonly orders = new Map<string, MockOrder>();
  private readonly batches = new Map<string, MockBatch>();
  private readonly byRequestId = new Map<string, unknown>();
  private sink: WebhookSink | null = null;
  private readonly timers = new Set<NodeJS.Timeout>();

  constructor(
    private readonly opts: { publicWebUrl: string; secret: string; payoutDelayMs: number; webhookDelayMs?: number },
  ) {}

  setWebhookSink(sink: WebhookSink): void {
    this.sink = sink;
  }

  dispose(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  getMockOrder(orderId: string): MockOrder | null {
    return this.orders.get(orderId) ?? null;
  }

  approveOrder(orderId: string): MockOrder {
    const o = this.orders.get(orderId);
    if (!o) throw new PayPalApiError(404, 'RESOURCE_NOT_FOUND', `Order ${orderId} not found (mock state resets on restart)`);
    if (o.status === 'COMPLETED') return o;
    o.status = 'APPROVED';
    this.emit('CHECKOUT.ORDER.APPROVED', 'checkout-order', {
      id: o.id,
      status: 'APPROVED',
      intent: o.intent,
      purchase_units: [{ reference_id: o.milestoneId, custom_id: o.milestoneId }],
    });
    return o;
  }

  async createOrder(input: CreateOrderInput): Promise<PayPalOrder> {
    const cached = this.byRequestId.get(input.requestId) as PayPalOrder | undefined;
    if (cached) return cached;
    const id = `MOCK-${shortId(8)}`;
    this.orders.set(id, {
      id,
      status: 'PAYER_ACTION_REQUIRED',
      intent: input.intent,
      milestoneId: input.milestoneId,
      description: input.description,
      amountCents: input.amountCents,
      currency: input.currency,
      returnUrl: input.returnUrl,
      cancelUrl: input.cancelUrl,
    });
    const approveUrl = `${this.opts.publicWebUrl}/mock-paypal/checkout?token=${encodeURIComponent(id)}`;
    const result: PayPalOrder = { id, status: 'PAYER_ACTION_REQUIRED', approveUrl, raw: { id, status: 'PAYER_ACTION_REQUIRED', mock: true } };
    this.byRequestId.set(input.requestId, result);
    return result;
  }

  async getOrder(orderId: string) {
    const o = this.orders.get(orderId);
    if (!o) throw new PayPalApiError(404, 'RESOURCE_NOT_FOUND', `Order ${orderId} not found`);
    return { id: o.id, status: o.status, raw: { ...o, mock: true } };
  }

  async captureOrder(orderId: string, requestId: string): Promise<CaptureResult> {
    const cached = this.byRequestId.get(requestId) as CaptureResult | undefined;
    if (cached) return cached;
    const o = this.requireApproved(orderId, 'CAPTURE');
    if (!o.captureId) o.captureId = `MOCKCAP-${shortId(8)}`;
    o.status = 'COMPLETED';
    const result: CaptureResult = {
      orderId,
      captureId: o.captureId,
      status: 'COMPLETED',
      amountCents: o.amountCents,
      feeCents: simulatedFee(o.amountCents),
      currency: o.currency,
      raw: { id: o.captureId, status: 'COMPLETED', mock: true },
    };
    this.byRequestId.set(requestId, result);
    const resource = {
      id: o.captureId,
      status: 'COMPLETED',
      custom_id: o.milestoneId,
      amount: { currency_code: o.currency, value: centsToPayPalValue(o.amountCents) },
      seller_receivable_breakdown: { paypal_fee: { currency_code: o.currency, value: centsToPayPalValue(simulatedFee(o.amountCents)) } },
      supplementary_data: { related_ids: { order_id: orderId } },
    };
    // Delivered twice on purpose: the receiver must de-duplicate by event id.
    this.emit('PAYMENT.CAPTURE.COMPLETED', 'capture', resource, { duplicate: true });
    return result;
  }

  async authorizeOrder(orderId: string, requestId: string): Promise<AuthorizationResult> {
    const cached = this.byRequestId.get(requestId) as AuthorizationResult | undefined;
    if (cached) return cached;
    const o = this.requireApproved(orderId, 'AUTHORIZE');
    if (!o.authorizationId) o.authorizationId = `MOCKAUTH-${shortId(8)}`;
    o.status = 'COMPLETED';
    const expiresAt = new Date(Date.now() + 29 * 86_400_000).toISOString();
    const result: AuthorizationResult = {
      orderId,
      authorizationId: o.authorizationId,
      status: 'CREATED',
      amountCents: o.amountCents,
      expiresAt,
      raw: { id: o.authorizationId, status: 'CREATED', expiration_time: expiresAt, mock: true },
    };
    this.byRequestId.set(requestId, result);
    this.emit('PAYMENT.AUTHORIZATION.CREATED', 'authorization', {
      id: o.authorizationId,
      status: 'CREATED',
      custom_id: o.milestoneId,
      amount: { currency_code: o.currency, value: centsToPayPalValue(o.amountCents) },
      supplementary_data: { related_ids: { order_id: orderId } },
    });
    return result;
  }

  async captureAuthorization(authorizationId: string, amountCents: number, currency: string, requestId: string) {
    const cached = this.byRequestId.get(requestId) as CaptureResult | undefined;
    if (cached) return cached;
    const result: CaptureResult = {
      orderId: null,
      captureId: `MOCKCAP-${shortId(8)}`,
      status: 'COMPLETED',
      amountCents,
      feeCents: simulatedFee(amountCents),
      currency,
      raw: { authorizationId, mock: true },
    };
    this.byRequestId.set(requestId, result);
    return result;
  }

  async voidAuthorization(): Promise<void> {
    // Nothing to release in the simulator.
  }

  async refundCapture(captureId: string, amountCents: number, currency: string, requestId: string): Promise<RefundResult> {
    const cached = this.byRequestId.get(requestId) as RefundResult | undefined;
    if (cached) return cached;
    const refundId = `MOCKREF-${shortId(8)}`;
    const result = { refundId, status: 'COMPLETED', raw: { id: refundId, captureId, mock: true } };
    this.byRequestId.set(requestId, result);
    this.emit('PAYMENT.CAPTURE.REFUNDED', 'refund', {
      id: refundId,
      status: 'COMPLETED',
      amount: { currency_code: currency, value: centsToPayPalValue(amountCents) },
      links: [{ rel: 'up', href: `mock://captures/${captureId}` }],
      capture_id: captureId,
    });
    return result;
  }

  async createPayout(input: CreatePayoutInput): Promise<PayoutResult> {
    const cached = this.byRequestId.get(input.requestId) as PayoutResult | undefined;
    if (cached) return cached;
    const batch: MockBatch = {
      batchId: `MOCKBATCH${shortId(6)}`,
      batchStatus: 'PENDING',
      itemId: `MOCKITEM${shortId(6)}`,
      itemStatus: 'PENDING',
      amountCents: input.amountCents,
      currency: input.currency,
      senderItemId: input.senderItemId,
      receiver: input.receiverEmail,
    };
    this.batches.set(batch.batchId, batch);
    const result: PayoutResult = {
      batchId: batch.batchId,
      batchStatus: 'PENDING',
      itemId: null,
      itemStatus: null,
      feeCents: null,
      raw: { batch_header: { payout_batch_id: batch.batchId, batch_status: 'PENDING' }, mock: true },
    };
    this.byRequestId.set(input.requestId, result);

    this.later(this.opts.payoutDelayMs, () => {
      const failed = /fail/i.test(batch.receiver);
      batch.itemStatus = failed ? 'FAILED' : 'SUCCESS';
      batch.batchStatus = failed ? 'DENIED' : 'SUCCESS';
      this.emit(failed ? 'PAYMENT.PAYOUTS-ITEM.FAILED' : 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED', 'payouts_item', {
        payout_item_id: batch.itemId,
        payout_batch_id: batch.batchId,
        transaction_status: batch.itemStatus,
        payout_item_fee: { currency: batch.currency, value: '0.25' },
        payout_item: {
          sender_item_id: batch.senderItemId,
          receiver: batch.receiver,
          amount: { currency: batch.currency, value: centsToPayPalValue(batch.amountCents) },
        },
      });
    });
    return result;
  }

  async getPayoutBatch(batchId: string): Promise<PayoutResult> {
    const b = this.batches.get(batchId);
    // After a restart the simulator has no memory of the batch; treat it as settled.
    if (!b) return { batchId, batchStatus: 'SUCCESS', itemId: null, itemStatus: 'SUCCESS', feeCents: null, raw: { mock: true } };
    return {
      batchId,
      batchStatus: b.batchStatus,
      itemId: b.itemStatus === 'PENDING' ? null : b.itemId,
      itemStatus: b.itemStatus === 'PENDING' ? null : b.itemStatus,
      feeCents: b.itemStatus === 'SUCCESS' ? 25 : null,
      raw: { ...b, mock: true },
    };
  }

  async verifyWebhookSignature(input: WebhookVerificationInput): Promise<boolean> {
    const id = headerValue(input.headers, 'paypal-transmission-id');
    const time = headerValue(input.headers, 'paypal-transmission-time');
    const sig = headerValue(input.headers, 'paypal-transmission-sig');
    const algo = headerValue(input.headers, 'paypal-auth-algo');
    if (!id || !time || !sig || algo !== MOCK_ALGO) return false;
    return safeEqualHex(sig, signMockWebhook(this.opts.secret, id, time, input.rawBody));
  }

  private requireApproved(orderId: string, intent: 'CAPTURE' | 'AUTHORIZE'): MockOrder {
    const o = this.orders.get(orderId);
    if (!o) throw new PayPalApiError(404, 'RESOURCE_NOT_FOUND', `Order ${orderId} not found (mock state resets on restart)`);
    if (o.intent !== intent) throw new PayPalApiError(422, 'ACTION_DOES_NOT_MATCH_INTENT', `Order intent is ${o.intent}`);
    if (o.status !== 'APPROVED' && o.status !== 'COMPLETED') {
      throw new PayPalApiError(422, 'ORDER_NOT_APPROVED', 'Payer has not yet approved the order for payment');
    }
    return o;
  }

  private emit(eventType: string, resourceType: string, resource: Record<string, unknown>, opts: { duplicate?: boolean } = {}): void {
    if (!this.sink) return;
    const event = {
      id: `WH-MOCK-${shortId(10)}`,
      event_version: '1.0',
      create_time: nowIso(),
      resource_type: resourceType,
      event_type: eventType,
      summary: `Simulated ${eventType}`,
      resource,
    };
    const rawBody = JSON.stringify(event);
    const deliver = () => {
      const transmissionId = `mock-${shortId(8)}`;
      const time = nowIso();
      const headers = {
        'paypal-transmission-id': transmissionId,
        'paypal-transmission-time': time,
        'paypal-auth-algo': MOCK_ALGO,
        'paypal-cert-url': 'mock://arbiterai/cert',
        'paypal-transmission-sig': signMockWebhook(this.opts.secret, transmissionId, time, rawBody),
        'content-type': 'application/json',
      };
      void this.sink?.(rawBody, headers).catch(() => undefined);
    };
    const delay = this.opts.webhookDelayMs ?? 400;
    this.later(delay, deliver);
    if (opts.duplicate) this.later(delay + 900, deliver);
  }

  private later(ms: number, fn: () => void): void {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    t.unref?.();
    this.timers.add(t);
  }
}

export function signMockWebhook(secret: string, transmissionId: string, time: string, rawBody: string): string {
  return hmacHex(secret, `${transmissionId}|${time}|${rawBody}`);
}

export { MOCK_ALGO };
