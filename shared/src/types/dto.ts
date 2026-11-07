import type {
  CheckStatus,
  ContractStatus,
  DecisionAction,
  DisputeStatus,
  EscrowMode,
  InspectionCategory,
  MilestoneAction,
  MilestoneStatus,
  PaymentKind,
  PaymentSource,
  Role,
  Severity,
  Verdict,
} from '../enums';
import type { ContractDraft, PolicyInput } from '../schemas/contract';
import type { Verification } from '../schemas/verification';
import type { JudgeOutput, PolicyEvaluation } from '../schemas/agent';

export interface UserDTO {
  id: string;
  name: string;
  email: string;
  role: Role;
  country: string | null;
  paypalEmail: string | null;
}

export interface PolicyDTO extends PolicyInput {
  id: string;
  contractId: string;
  updatedAt: string;
}

export interface ContractDTO {
  id: string;
  title: string;
  summary: string;
  status: ContractStatus;
  currency: string;
  totalCents: number;
  buyerId: string;
  contractorId: string;
  buyerName: string;
  contractorName: string;
  milestoneCount: number;
  paidCents: number;
  escrowedCents: number;
  milestoneStatuses: MilestoneStatus[];
  createdAt: string;
  updatedAt: string;
}

export interface MilestoneDTO {
  id: string;
  contractId: string;
  contractTitle: string;
  seq: number;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  amountCents: number;
  currency: string;
  deadline: string;
  verification: Verification;
  status: MilestoneStatus;
  decisionVerdict: Verdict | null;
  decisionConfidence: number | null;
  decisionSummary: string | null;
  injectionFlag: boolean;
  releaseAt: string | null;
  fundedAt: string | null;
  submittedAt: string | null;
  decidedAt: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContractDetailDTO extends ContractDTO {
  sowText: string;
  milestones: MilestoneDTO[];
  policy: PolicyDTO;
  buyer: UserDTO;
  contractor: UserDTO;
}

export interface SubmissionDTO {
  id: string;
  milestoneId: string;
  contractorId: string;
  kind: 'GITHUB_PR' | 'URL' | 'FILE';
  url: string | null;
  notes: string | null;
  fileName: string | null;
  fileSha256: string | null;
  fileSizeBytes: number | null;
  createdAt: string;
}

export interface InspectionDTO {
  id: string;
  submissionId: string;
  milestoneId: string;
  milestoneTitle: string;
  contractTitle: string;
  checkName: string;
  category: InspectionCategory;
  status: CheckStatus;
  severity: Severity;
  injectionFlag: boolean;
  message: string;
  evidence: Record<string, unknown>;
  createdAt: string;
}

export interface AgentDecisionDTO {
  id: string;
  seq: number;
  milestoneId: string | null;
  milestoneTitle: string | null;
  submissionId: string | null;
  action: DecisionAction;
  actor: string;
  verdict: Verdict | null;
  confidence: number | null;
  inputsHash: string;
  outputs: unknown;
  model: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  latencyMs: number | null;
  prevHash: string;
  hash: string;
  createdAt: string;
}

export interface PaymentDTO {
  id: string;
  milestoneId: string;
  milestoneTitle: string;
  contractId: string;
  contractTitle: string;
  kind: PaymentKind;
  status: string;
  amountCents: number;
  feeCents: number | null;
  currency: string;
  paypalOrderId: string | null;
  paypalCaptureId: string | null;
  paypalAuthorizationId: string | null;
  payoutBatchId: string | null;
  payoutItemId: string | null;
  refundId: string | null;
  requestId: string | null;
  source: PaymentSource;
  lastEventId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookEventDTO {
  id: string;
  eventType: string;
  resourceType: string | null;
  resourceId: string | null;
  verified: boolean;
  processed: boolean;
  duplicateCount: number;
  error: string | null;
  receivedAt: string;
  processedAt: string | null;
}

export interface DisputeDTO {
  id: string;
  milestoneId: string;
  raisedBy: string;
  raisedByRole: Role;
  reason: string;
  status: DisputeStatus;
  resolution: string | null;
  resolvedBy: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface ReviewDTO {
  milestone: MilestoneDTO;
  contract: ContractDTO;
  policy: PolicyDTO;
  submissions: SubmissionDTO[];
  latestSubmission: SubmissionDTO | null;
  inspections: InspectionDTO[];
  decisions: AgentDecisionDTO[];
  payments: PaymentDTO[];
  disputes: DisputeDTO[];
  judge: JudgeOutput | null;
  policyGate: PolicyEvaluation | null;
  allowedActions: MilestoneAction[];
}

export interface DashboardSummaryDTO {
  currency: string;
  totalEscrowedCents: number;
  totalReleasedCents: number;
  pendingFundingCents: number;
  inReviewCount: number;
  escalationCount: number;
  disputeCount: number;
  paidCount: number;
  injectionFlags: number;
  avgTimeToPayoutSeconds: number | null;
  statusCounts: Partial<Record<MilestoneStatus, number>>;
}

export interface PublicConfigDTO {
  version: string;
  paypalMode: 'mock' | 'sandbox';
  llmMode: 'mock' | 'groq';
  llmModel: string;
  githubMode: 'mock' | 'live';
  escrowMode: EscrowMode;
  defaultPolicy: PolicyInput;
  demoFixtures: {
    githubPrs: { label: string; url: string; expectation: string }[];
    urls: { label: string; url: string; expectation: string }[];
  };
}

export interface ExtractIssue {
  path: string;
  message: string;
}

export interface ExtractResponseDTO {
  draft: ContractDraft;
  issues: ExtractIssue[];
  model: string;
  usage: { promptTokens: number; completionTokens: number } | null;
}

export interface FundingStartDTO {
  orderId: string;
  approveUrl: string;
  reused: boolean;
}

export interface ChainVerificationDTO {
  valid: boolean;
  length: number;
  brokenAtSeq: number | null;
  headHash: string | null;
}

export interface AgentToolDTO {
  name: string;
  description: string;
  movesMoney: boolean;
  inputSchema: unknown;
}

export interface DemoScenarioDTO {
  contractIds: string[];
  autoRun: boolean;
  message: string;
}
