export interface CreateOrderInput {
  milestoneId: string;
  contractId: string;
  description: string;
  amountCents: number;
  currency: string;
  intent: 'CAPTURE' | 'AUTHORIZE';
  returnUrl: string;
  cancelUrl: string;
  requestId: string;
}

export interface PayPalOrder {
  id: string;
  status: string;
  approveUrl: string | null;
  raw: unknown;
}

export interface CaptureResult {
  orderId: string | null;
  captureId: string;
  status: string;
  amountCents: number;
  feeCents: number | null;
  currency: string;
  raw: unknown;
}

export interface AuthorizationResult {
  orderId: string;
  authorizationId: string;
  status: string;
  amountCents: number;
  expiresAt: string | null;
  raw: unknown;
}

export interface CreatePayoutInput {
  senderBatchId: string;
  senderItemId: string;
  receiverEmail: string;
  amountCents: number;
  currency: string;
  note: string;
  emailSubject: string;
  requestId: string;
}

export interface PayoutResult {
  batchId: string;
  batchStatus: string;
  itemId: string | null;
  itemStatus: string | null;
  feeCents: number | null;
  raw: unknown;
}

export interface RefundResult {
  refundId: string;
  status: string;
  raw: unknown;
}

export interface WebhookVerificationInput {
  headers: Record<string, string | string[] | undefined>;
  rawBody: string;
}

/** Everything ArbiterAI needs from PayPal. Implemented by the REST client (sandbox) and the mock. */
export interface PayPalGateway {
  readonly mode: 'mock' | 'sandbox';
  createOrder(input: CreateOrderInput): Promise<PayPalOrder>;
  getOrder(orderId: string): Promise<{ id: string; status: string; raw: unknown }>;
  captureOrder(orderId: string, requestId: string): Promise<CaptureResult>;
  authorizeOrder(orderId: string, requestId: string): Promise<AuthorizationResult>;
  captureAuthorization(authorizationId: string, amountCents: number, currency: string, requestId: string): Promise<CaptureResult>;
  voidAuthorization(authorizationId: string, requestId: string): Promise<void>;
  refundCapture(captureId: string, amountCents: number, currency: string, requestId: string, note: string): Promise<RefundResult>;
  createPayout(input: CreatePayoutInput): Promise<PayoutResult>;
  getPayoutBatch(batchId: string): Promise<PayoutResult>;
  verifyWebhookSignature(input: WebhookVerificationInput): Promise<boolean>;
}

export interface PayPalWebhookEvent {
  id: string;
  event_type: string;
  resource_type?: string;
  create_time?: string;
  summary?: string;
  resource: Record<string, unknown>;
}

export class PayPalApiError extends Error {
  constructor(
    readonly status: number,
    readonly issue: string,
    message: string,
    readonly debugId: string | null = null,
    readonly details: unknown = null,
  ) {
    super(message);
    this.name = 'PayPalApiError';
  }
}

export function headerValue(headers: WebhookVerificationInput['headers'], name: string): string | undefined {
  const v = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
}
