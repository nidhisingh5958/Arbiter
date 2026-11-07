import { centsToPayPalValue, payPalValueToCents } from '@arbiter/shared';
import type { Logger } from '../lib/logger';
import { sleep } from '../lib/time';
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

interface RestConfig {
  clientId: string;
  clientSecret: string;
  baseUrl: string;
  webhookId: string | null;
  brandName: string;
}

interface RequestOptions {
  body?: unknown;
  rawBody?: string;
  requestId?: string;
  prefer?: boolean;
}

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- PayPal response payloads are deeply nested; narrowed at use sites.

/**
 * Typed PayPal REST client (sandbox). OAuth2 client-credentials with token caching,
 * PayPal-Request-Id idempotency on every mutating call, and bounded retries on 5xx/429.
 * Credentials live only here — never in prompts, tool inputs or logs.
 */
export class PayPalRestClient implements PayPalGateway {
  readonly mode = 'sandbox' as const;
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly cfg: RestConfig,
    private readonly log: Logger,
  ) {}

  async createOrder(input: CreateOrderInput): Promise<PayPalOrder> {
    const res = await this.request('POST', '/v2/checkout/orders', {
      requestId: input.requestId,
      prefer: true,
      body: {
        intent: input.intent,
        purchase_units: [
          {
            reference_id: input.milestoneId,
            custom_id: input.milestoneId,
            description: input.description.slice(0, 127),
            amount: { currency_code: input.currency, value: centsToPayPalValue(input.amountCents) },
          },
        ],
        payment_source: {
          paypal: {
            experience_context: {
              brand_name: this.cfg.brandName,
              user_action: 'PAY_NOW',
              shipping_preference: 'NO_SHIPPING',
              landing_page: 'LOGIN',
              return_url: input.returnUrl,
              cancel_url: input.cancelUrl,
            },
          },
        },
      },
    });
    const links: { rel: string; href: string }[] = res.links ?? [];
    const approve = links.find((l) => l.rel === 'payer-action') ?? links.find((l) => l.rel === 'approve');
    return { id: res.id, status: res.status, approveUrl: approve?.href ?? null, raw: res };
  }

  async getOrder(orderId: string) {
    const res = await this.request('GET', `/v2/checkout/orders/${encodeURIComponent(orderId)}`);
    return { id: res.id as string, status: res.status as string, raw: res };
  }

  async captureOrder(orderId: string, requestId: string): Promise<CaptureResult> {
    let res: Json;
    try {
      res = await this.request('POST', `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, { requestId, prefer: true });
    } catch (err) {
      // Already captured (e.g. by the webhook safety net) — read the order instead of failing.
      if (err instanceof PayPalApiError && err.issue === 'ORDER_ALREADY_CAPTURED') {
        res = (await this.getOrder(orderId)).raw as Json;
      } else throw err;
    }
    const capture = res.purchase_units?.[0]?.payments?.captures?.[0];
    if (!capture) throw new PayPalApiError(502, 'NO_CAPTURE', `PayPal returned no capture for order ${orderId}`);
    return parseCapture(capture, orderId);
  }

  async authorizeOrder(orderId: string, requestId: string): Promise<AuthorizationResult> {
    const res = await this.request('POST', `/v2/checkout/orders/${encodeURIComponent(orderId)}/authorize`, {
      requestId,
      prefer: true,
    });
    const auth = res.purchase_units?.[0]?.payments?.authorizations?.[0];
    if (!auth) throw new PayPalApiError(502, 'NO_AUTHORIZATION', `PayPal returned no authorization for order ${orderId}`);
    return {
      orderId,
      authorizationId: auth.id,
      status: auth.status,
      amountCents: payPalValueToCents(auth.amount?.value),
      expiresAt: auth.expiration_time ?? null,
      raw: res,
    };
  }

  async captureAuthorization(authorizationId: string, amountCents: number, currency: string, requestId: string) {
    const res = await this.request('POST', `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/capture`, {
      requestId,
      prefer: true,
      body: { amount: { currency_code: currency, value: centsToPayPalValue(amountCents) }, final_capture: true },
    });
    return parseCapture(res, null);
  }

  async voidAuthorization(authorizationId: string, requestId: string): Promise<void> {
    await this.request('POST', `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/void`, { requestId });
  }

  async refundCapture(captureId: string, amountCents: number, currency: string, requestId: string, note: string) {
    const res = await this.request('POST', `/v2/payments/captures/${encodeURIComponent(captureId)}/refund`, {
      requestId,
      prefer: true,
      body: { amount: { currency_code: currency, value: centsToPayPalValue(amountCents) }, note_to_payer: note.slice(0, 255) },
    });
    return { refundId: res.id as string, status: res.status as string, raw: res } satisfies RefundResult;
  }

  async createPayout(input: CreatePayoutInput): Promise<PayoutResult> {
    const res = await this.request('POST', '/v1/payments/payouts', {
      requestId: input.requestId,
      body: {
        sender_batch_header: {
          sender_batch_id: input.senderBatchId,
          email_subject: input.emailSubject,
          email_message: input.note,
        },
        items: [
          {
            recipient_type: 'EMAIL',
            amount: { value: centsToPayPalValue(input.amountCents), currency: input.currency },
            receiver: input.receiverEmail,
            note: input.note.slice(0, 4000),
            sender_item_id: input.senderItemId,
          },
        ],
      },
    });
    return {
      batchId: res.batch_header?.payout_batch_id,
      batchStatus: res.batch_header?.batch_status ?? 'PENDING',
      itemId: null,
      itemStatus: null,
      feeCents: null,
      raw: res,
    };
  }

  async getPayoutBatch(batchId: string): Promise<PayoutResult> {
    const res = await this.request('GET', `/v1/payments/payouts/${encodeURIComponent(batchId)}`);
    const item = res.items?.[0];
    return {
      batchId,
      batchStatus: res.batch_header?.batch_status ?? 'PENDING',
      itemId: item?.payout_item_id ?? null,
      itemStatus: item?.transaction_status ?? null,
      feeCents: item?.payout_item_fee ? payPalValueToCents(item.payout_item_fee.value) : null,
      raw: res,
    };
  }

  /**
   * Calls PayPal's verify-webhook-signature endpoint. The original raw body is spliced in
   * verbatim (not re-serialized) so the signature PayPal computed still matches.
   */
  async verifyWebhookSignature(input: WebhookVerificationInput): Promise<boolean> {
    if (!this.cfg.webhookId) return false;
    const h = (n: string) => headerValue(input.headers, n);
    const required = ['paypal-auth-algo', 'paypal-cert-url', 'paypal-transmission-id', 'paypal-transmission-sig', 'paypal-transmission-time'];
    if (required.some((n) => !h(n))) return false;
    try {
      JSON.parse(input.rawBody);
    } catch {
      return false;
    }
    const body =
      `{"auth_algo":${JSON.stringify(h('paypal-auth-algo'))},` +
      `"cert_url":${JSON.stringify(h('paypal-cert-url'))},` +
      `"transmission_id":${JSON.stringify(h('paypal-transmission-id'))},` +
      `"transmission_sig":${JSON.stringify(h('paypal-transmission-sig'))},` +
      `"transmission_time":${JSON.stringify(h('paypal-transmission-time'))},` +
      `"webhook_id":${JSON.stringify(this.cfg.webhookId)},` +
      `"webhook_event":${input.rawBody}}`;
    try {
      const res = await this.request('POST', '/v1/notifications/verify-webhook-signature', { rawBody: body });
      return res.verification_status === 'SUCCESS';
    } catch (err) {
      this.log.warn({ err: (err as Error).message }, 'paypal webhook verification call failed');
      return false;
    }
  }

  private async accessToken(force = false): Promise<string> {
    if (!force && this.token && this.token.expiresAt > Date.now()) return this.token.value;
    const basic = Buffer.from(`${this.cfg.clientId}:${this.cfg.clientSecret}`).toString('base64');
    const res = await fetch(`${this.cfg.baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      throw new PayPalApiError(res.status, 'AUTHENTICATION_FAILURE', 'PayPal OAuth failed — check PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET');
    }
    const json = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: json.access_token, expiresAt: Date.now() + Math.max(60, json.expires_in - 120) * 1000 };
    return json.access_token;
  }

  private async request(method: 'GET' | 'POST', path: string, opts: RequestOptions = {}): Promise<Json> {
    const canRetry = method === 'GET' || Boolean(opts.requestId);
    let refreshed = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      const token = await this.accessToken();
      const headers: Record<string, string> = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      if (opts.requestId) headers['PayPal-Request-Id'] = opts.requestId;
      if (opts.prefer) headers.Prefer = 'return=representation';
      const started = Date.now();
      const res = await fetch(`${this.cfg.baseUrl}${path}`, {
        method,
        headers,
        body: opts.rawBody ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body)),
        signal: AbortSignal.timeout(20_000),
      });
      const debugId = res.headers.get('paypal-debug-id');
      this.log.info({ method, path, status: res.status, debugId, ms: Date.now() - started }, 'paypal api');

      if (res.status === 401 && !refreshed) {
        refreshed = true;
        await this.accessToken(true);
        continue;
      }
      const text = await res.text();
      const json: Json = text ? safeJson(text) : {};
      if (res.ok) return json;
      if (canRetry && (res.status === 429 || res.status >= 500) && attempt < 2) {
        await sleep(400 * 2 ** attempt);
        continue;
      }
      const issue = json.details?.[0]?.issue ?? json.name ?? `HTTP_${res.status}`;
      const message = json.details?.[0]?.description ?? json.message ?? `PayPal ${method} ${path} failed`;
      throw new PayPalApiError(res.status, issue, `${message} (${issue})`, json.debug_id ?? debugId, json.details ?? null);
    }
    throw new PayPalApiError(503, 'RETRIES_EXHAUSTED', `PayPal ${method} ${path} failed after retries`);
  }
}

function safeJson(text: string): Json {
  try {
    return JSON.parse(text) as Json;
  } catch {
    return { message: text.slice(0, 300) };
  }
}

function parseCapture(capture: Json, orderId: string | null): CaptureResult {
  const fee = capture.seller_receivable_breakdown?.paypal_fee?.value;
  return {
    orderId: orderId ?? capture.supplementary_data?.related_ids?.order_id ?? null,
    captureId: capture.id,
    status: capture.status,
    amountCents: payPalValueToCents(capture.amount?.value),
    feeCents: fee !== undefined ? payPalValueToCents(fee) : null,
    currency: capture.amount?.currency_code ?? 'USD',
    raw: capture,
  };
}
