import type {
  AgentDecisionDTO,
  DecisionAction,
  DisputeDTO,
  DisputeStatus,
  InspectionCategory,
  InspectionDTO,
  MilestoneDTO,
  MilestoneStatus,
  PaymentDTO,
  PaymentKind,
  PaymentSource,
  PolicyDTO,
  Role,
  Severity,
  CheckStatus,
  SubmissionDTO,
  UserDTO,
  Verdict,
  Verification,
  WebhookEventDTO,
} from '@arbiter/shared';
import type {
  AgentDecisionsTable,
  DisputesTable,
  InspectionsTable,
  MilestonesTable,
  PaymentsTable,
  PoliciesTable,
  SubmissionsTable,
  UsersTable,
  WebhookEventsTable,
} from '../db/types';

export function parseJson<T>(text: string | null | undefined, fallback: T): T {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

export function toUserDTO(r: UsersTable): UserDTO {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role as Role,
    country: r.country,
    paypalEmail: r.paypal_email,
  };
}

export function toMilestoneDTO(r: MilestonesTable, contractTitle: string): MilestoneDTO {
  return {
    id: r.id,
    contractId: r.contract_id,
    contractTitle,
    seq: r.seq,
    title: r.title,
    description: r.description,
    acceptanceCriteria: parseJson<string[]>(r.acceptance_criteria, []),
    amountCents: r.amount_cents,
    currency: r.currency,
    deadline: r.deadline,
    verification: parseJson<Verification>(r.verification, { type: 'FILE', params: { allowedExtensions: [], maxSizeKb: 512, requiredText: [] } }),
    status: r.status as MilestoneStatus,
    decisionVerdict: (r.decision_verdict as Verdict | null) ?? null,
    decisionConfidence: r.decision_confidence,
    decisionSummary: r.decision_summary,
    injectionFlag: r.injection_flag === 1,
    releaseAt: r.release_at,
    fundedAt: r.funded_at,
    submittedAt: r.submitted_at,
    decidedAt: r.decided_at,
    paidAt: r.paid_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function toSubmissionDTO(r: SubmissionsTable): SubmissionDTO {
  return {
    id: r.id,
    milestoneId: r.milestone_id,
    contractorId: r.contractor_id,
    kind: r.kind as SubmissionDTO['kind'],
    url: r.url,
    notes: r.notes,
    fileName: r.file_name,
    fileSha256: r.file_sha256,
    fileSizeBytes: r.file_size_bytes,
    createdAt: r.created_at,
  };
}

export function toInspectionDTO(r: InspectionsTable, milestoneTitle = '', contractTitle = ''): InspectionDTO {
  return {
    id: r.id,
    submissionId: r.submission_id,
    milestoneId: r.milestone_id,
    milestoneTitle,
    contractTitle,
    checkName: r.check_name,
    category: r.category as InspectionCategory,
    status: r.status as CheckStatus,
    severity: r.severity as Severity,
    injectionFlag: r.injection_flag === 1,
    message: r.message,
    evidence: parseJson<Record<string, unknown>>(r.evidence, {}),
    createdAt: r.created_at,
  };
}

export function toDecisionDTO(r: AgentDecisionsTable, milestoneTitle: string | null = null): AgentDecisionDTO {
  return {
    id: r.id,
    seq: r.seq,
    milestoneId: r.milestone_id,
    milestoneTitle,
    submissionId: r.submission_id,
    action: r.action as DecisionAction,
    actor: r.actor,
    verdict: (r.verdict as Verdict | null) ?? null,
    confidence: r.confidence,
    inputsHash: r.inputs_hash,
    outputs: parseJson<unknown>(r.outputs, null),
    model: r.model,
    promptTokens: r.prompt_tokens,
    completionTokens: r.completion_tokens,
    latencyMs: r.latency_ms,
    prevHash: r.prev_hash,
    hash: r.hash,
    createdAt: r.created_at,
  };
}

export function toPaymentDTO(r: PaymentsTable, milestoneTitle = '', contractTitle = ''): PaymentDTO {
  return {
    id: r.id,
    milestoneId: r.milestone_id,
    milestoneTitle,
    contractId: r.contract_id,
    contractTitle,
    kind: r.kind as PaymentKind,
    status: r.status,
    amountCents: r.amount_cents,
    feeCents: r.fee_cents,
    currency: r.currency,
    paypalOrderId: r.paypal_order_id,
    paypalCaptureId: r.paypal_capture_id,
    paypalAuthorizationId: r.paypal_authorization_id,
    payoutBatchId: r.payout_batch_id,
    payoutItemId: r.payout_item_id,
    refundId: r.refund_id,
    requestId: r.request_id,
    source: r.source as PaymentSource,
    lastEventId: r.last_event_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function toWebhookDTO(r: WebhookEventsTable): WebhookEventDTO {
  return {
    id: r.id,
    eventType: r.event_type,
    resourceType: r.resource_type,
    resourceId: r.resource_id,
    verified: r.verified === 1,
    processed: r.processed === 1,
    duplicateCount: r.duplicate_count,
    error: r.error,
    receivedAt: r.received_at,
    processedAt: r.processed_at,
  };
}

export function toPolicyDTO(r: PoliciesTable): PolicyDTO {
  return {
    id: r.id,
    contractId: r.contract_id,
    maxAutoReleaseCents: r.max_auto_release_cents,
    minConfidence: r.min_confidence,
    dailyPayoutCapCents: r.daily_payout_cap_cents,
    humanApprovalAboveCents: r.human_approval_above_cents,
    disputeWindowSeconds: r.dispute_window_seconds,
    updatedAt: r.updated_at,
  };
}

export function toDisputeDTO(r: DisputesTable): DisputeDTO {
  return {
    id: r.id,
    milestoneId: r.milestone_id,
    raisedBy: r.raised_by,
    raisedByRole: r.raised_by_role as Role,
    reason: r.reason,
    status: r.status as DisputeStatus,
    resolution: r.resolution,
    resolvedBy: r.resolved_by,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at,
  };
}
