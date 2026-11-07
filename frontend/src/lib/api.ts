import type {
  AgentDecisionDTO,
  AgentToolDTO,
  ChainVerificationDTO,
  ContractDetailDTO,
  ContractDraft,
  ContractDTO,
  DashboardSummaryDTO,
  DemoScenarioDTO,
  ExtractResponseDTO,
  FundingStartDTO,
  InspectionDTO,
  MilestoneDTO,
  PaymentDTO,
  PolicyInput,
  PublicConfigDTO,
  ReviewDTO,
  SubmissionDTO,
  SubmissionInput,
  UserDTO,
  WebhookEventDTO,
} from '@arbiter/shared';

const BASE = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/+$/, '');

let demoUserId: string | null = null;

/** The role switcher sets which seeded demo user the API should act as. */
export function setDemoUser(id: string | null): void {
  demoUserId = id;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (demoUserId) headers['x-demo-user'] = demoUserId;

  let res: Response;
  try {
    res = await fetch(`${BASE}/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError('Cannot reach the ArbiterAI API. Is the backend running on port 8080?', 0, 'NETWORK');
  }
  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  if (!res.ok) {
    const err = (json as { error?: { message?: string; code?: string; details?: unknown } } | null)?.error;
    throw new ApiError(err?.message ?? `Request failed (${res.status})`, res.status, err?.code ?? 'HTTP_ERROR', err?.details);
  }
  return json as T;
}

export const eventsUrl = () => `${BASE}/api/events`;

export interface MockOrderDTO {
  id: string;
  status: string;
  amountCents: number;
  currency: string;
  description: string;
  returnUrl: string;
  cancelUrl: string;
}

export const api = {
  config: () => request<PublicConfigDTO>('GET', '/config'),
  users: () => request<UserDTO[]>('GET', '/users'),
  updateMe: (paypalEmail: string) => request<UserDTO>('PATCH', '/users/me', { paypalEmail }),

  extract: (sowText: string) => request<ExtractResponseDTO>('POST', '/contracts/extract', { sowText }),
  createContract: (body: { draft: ContractDraft; contractorId: string; sowText: string; policy: PolicyInput }) =>
    request<ContractDetailDTO>('POST', '/contracts', body),
  contracts: () => request<ContractDTO[]>('GET', '/contracts'),
  contract: (id: string) => request<ContractDetailDTO>('GET', `/contracts/${id}`),
  updatePolicy: (id: string, policy: PolicyInput) => request<ContractDetailDTO>('PUT', `/contracts/${id}/policy`, policy),

  review: (milestoneId: string) => request<ReviewDTO>('GET', `/milestones/${milestoneId}`),
  startFunding: (milestoneId: string) => request<FundingStartDTO>('POST', `/milestones/${milestoneId}/funding`),
  captureFunding: (milestoneId: string, orderId: string) =>
    request<MilestoneDTO>('POST', `/milestones/${milestoneId}/funding/capture`, { orderId }),
  cancelFunding: (milestoneId: string) => request<MilestoneDTO>('POST', `/milestones/${milestoneId}/funding/cancel`),
  submit: (milestoneId: string, input: SubmissionInput) =>
    request<{ submission: SubmissionDTO; milestone: MilestoneDTO }>('POST', `/milestones/${milestoneId}/submissions`, input),
  dispute: (milestoneId: string, reason: string) => request<MilestoneDTO>('POST', `/milestones/${milestoneId}/disputes`, { reason }),
  resolve: (milestoneId: string, action: 'APPROVE' | 'REJECT', note: string) =>
    request<MilestoneDTO>('POST', `/milestones/${milestoneId}/resolve`, { action, note }),
  refund: (milestoneId: string, reason: string) => request<MilestoneDTO>('POST', `/milestones/${milestoneId}/refund`, { reason }),
  releaseNow: (milestoneId: string) => request<MilestoneDTO>('POST', `/milestones/${milestoneId}/release-now`),
  reverify: (milestoneId: string) => request<MilestoneDTO>('POST', `/milestones/${milestoneId}/reverify`),

  summary: () => request<DashboardSummaryDTO>('GET', '/dashboard/summary'),
  dashMilestones: () => request<MilestoneDTO[]>('GET', '/dashboard/milestones'),
  dashInspections: () => request<InspectionDTO[]>('GET', '/dashboard/inspections'),
  dashTransactions: () => request<PaymentDTO[]>('GET', '/dashboard/transactions'),
  dashDecisions: () => request<AgentDecisionDTO[]>('GET', '/dashboard/decisions'),
  dashWebhooks: () => request<WebhookEventDTO[]>('GET', '/dashboard/webhooks'),
  verifyChain: () => request<ChainVerificationDTO>('GET', '/audit/verify-chain'),
  tools: () => request<AgentToolDTO[]>('GET', '/agent/tools'),

  runDemo: (autoRun = true) => request<DemoScenarioDTO>('POST', '/demo/scenario', { autoRun }),
  mockOrder: (orderId: string) => request<MockOrderDTO>('GET', `/mock-paypal/orders/${encodeURIComponent(orderId)}`),
  mockApprove: (orderId: string) => request<{ id: string; returnUrl: string }>('POST', `/mock-paypal/orders/${encodeURIComponent(orderId)}/approve`),
};
