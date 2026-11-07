import type { DecisionAction, MilestoneStatus, PaymentKind, Verdict } from '../enums';

export type AgentStep =
  | 'deterministic_checks'
  | 'injection_scan'
  | 'llm_judgment'
  | 'policy_gate'
  | 'decision'
  | 'release'
  | 'error';

/** Server-sent events pushed to every connected dashboard. Never contains secrets. */
export type ServerEventPayload =
  | { type: 'hello'; serverTime: string }
  | { type: 'contract.created'; contractId: string; title: string }
  | { type: 'contract.updated'; contractId: string }
  | { type: 'milestone.updated'; milestoneId: string; contractId: string; status: MilestoneStatus; title: string }
  | { type: 'payment.updated'; paymentId: string; milestoneId: string; kind: PaymentKind; status: string }
  | { type: 'inspection.created'; milestoneId: string; count: number; injectionFlag: boolean }
  | { type: 'decision.created'; milestoneId: string | null; action: DecisionAction; verdict: Verdict | null; seq: number }
  | {
      type: 'webhook.received';
      eventId: string;
      eventType: string;
      verified: boolean;
      duplicate: boolean;
    }
  | { type: 'agent.step'; milestoneId: string; step: AgentStep; detail: string };

export type ServerEvent = ServerEventPayload & { id: string; at: string };

export type ServerEventType = ServerEventPayload['type'];
