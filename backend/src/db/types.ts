import type { Kysely } from 'kysely';

/**
 * Portable schema: text ids, ISO-8601 text timestamps, integer cents, integer booleans and
 * JSON stored as text. The same Kysely types work for SQLite (dev/tests) and Postgres (Render).
 */
export interface UsersTable {
  id: string;
  name: string;
  email: string;
  role: string;
  country: string | null;
  paypal_email: string | null;
  created_at: string;
}

export interface ContractsTable {
  id: string;
  title: string;
  summary: string;
  sow_text: string;
  buyer_id: string;
  contractor_id: string;
  currency: string;
  total_cents: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface MilestonesTable {
  id: string;
  contract_id: string;
  seq: number;
  title: string;
  description: string;
  acceptance_criteria: string;
  amount_cents: number;
  currency: string;
  deadline: string;
  verification: string;
  status: string;
  decision_verdict: string | null;
  decision_confidence: number | null;
  decision_summary: string | null;
  injection_flag: number;
  release_at: string | null;
  funded_at: string | null;
  submitted_at: string | null;
  decided_at: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubmissionsTable {
  id: string;
  milestone_id: string;
  contractor_id: string;
  kind: string;
  url: string | null;
  notes: string | null;
  file_name: string | null;
  file_sha256: string | null;
  file_size_bytes: number | null;
  file_content: string | null;
  created_at: string;
}

export interface InspectionsTable {
  id: string;
  submission_id: string;
  milestone_id: string;
  check_name: string;
  category: string;
  status: string;
  severity: string;
  injection_flag: number;
  message: string;
  evidence: string;
  created_at: string;
}

export interface AgentDecisionsTable {
  id: string;
  seq: number;
  milestone_id: string | null;
  submission_id: string | null;
  action: string;
  actor: string;
  verdict: string | null;
  confidence: number | null;
  inputs_hash: string;
  outputs: string;
  model: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  latency_ms: number | null;
  prev_hash: string;
  hash: string;
  created_at: string;
}

export interface PaymentsTable {
  id: string;
  milestone_id: string;
  contract_id: string;
  kind: string;
  status: string;
  amount_cents: number;
  fee_cents: number | null;
  currency: string;
  paypal_order_id: string | null;
  paypal_capture_id: string | null;
  paypal_authorization_id: string | null;
  payout_batch_id: string | null;
  payout_item_id: string | null;
  refund_id: string | null;
  request_id: string | null;
  approve_url: string | null;
  source: string;
  last_event_id: string | null;
  raw: string | null;
  created_at: string;
  updated_at: string;
}

export interface WebhookEventsTable {
  id: string;
  event_type: string;
  resource_type: string | null;
  resource_id: string | null;
  verified: number;
  processed: number;
  duplicate_count: number;
  error: string | null;
  payload: string;
  received_at: string;
  processed_at: string | null;
}

export interface PoliciesTable {
  id: string;
  contract_id: string;
  max_auto_release_cents: number;
  min_confidence: number;
  daily_payout_cap_cents: number;
  human_approval_above_cents: number;
  dispute_window_seconds: number;
  created_at: string;
  updated_at: string;
}

export interface DisputesTable {
  id: string;
  milestone_id: string;
  raised_by: string;
  raised_by_role: string;
  reason: string;
  status: string;
  resolution: string | null;
  resolved_by: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface AuditLogTable {
  id: string;
  actor_id: string | null;
  actor_role: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  details: string;
  created_at: string;
}

export interface ReleaseGrantsTable {
  id: string;
  milestone_id: string;
  amount_cents: number;
  kind: string;
  issued_by: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

export interface Database {
  users: UsersTable;
  contracts: ContractsTable;
  milestones: MilestonesTable;
  submissions: SubmissionsTable;
  inspections: InspectionsTable;
  agent_decisions: AgentDecisionsTable;
  payments: PaymentsTable;
  webhook_events: WebhookEventsTable;
  policies: PoliciesTable;
  disputes: DisputesTable;
  audit_log: AuditLogTable;
  release_grants: ReleaseGrantsTable;
}

export type DB = Kysely<Database>;
export type Dialect = 'sqlite' | 'postgres';
