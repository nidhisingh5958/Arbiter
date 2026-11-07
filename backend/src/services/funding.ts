import type { FundingStartDTO, MilestoneDTO, UserDTO } from '@arbiter/shared';
import type { ToolGateway } from '../agent/tools/gateway';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import type { Logger } from '../lib/logger';
import { KeyedMutex } from '../lib/mutex';
import { nowIso } from '../lib/time';
import type { PayPalGateway } from '../paypal/types';
import type { Repositories } from '../repositories';
import { actorOf, isBuyerOf } from './access';
import type { MilestoneTransitions } from './transitions';

export interface FundingDeps {
  repos: Repositories;
  gateway: ToolGateway;
  paypal: PayPalGateway;
  transitions: MilestoneTransitions;
  log: Logger;
}

const OPEN_ORDER_STATUSES = ['CREATED', 'PAYER_ACTION_REQUIRED', 'APPROVED', 'SAVED'];

/** Per-milestone PayPal funding: create order → buyer approves → capture/authorize → FUNDED. */
export class FundingService {
  private readonly lock = new KeyedMutex();

  constructor(private readonly d: FundingDeps) {}

  async start(user: UserDTO, milestoneId: string): Promise<FundingStartDTO> {
    const m = await this.d.repos.milestones.getRow(milestoneId);
    if (!m) throw notFound('Milestone');
    const c = await this.d.repos.contracts.getRow(m.contract_id);
    if (!c) throw notFound('Contract');
    if (!isBuyerOf(user, c)) throw forbidden('Only the buyer on this contract can fund milestones');
    if (m.status !== 'FUNDING_REQUIRED') throw conflict(`This milestone is ${m.status} and does not need funding`);

    // Reuse a still-open order so repeated clicks don't create duplicate PayPal orders.
    const existing = await this.d.repos.payments.latestOfKind(m.id, 'ORDER');
    if (existing?.paypal_order_id && existing.approve_url && OPEN_ORDER_STATUSES.includes(existing.status)) {
      try {
        const live = await this.d.paypal.getOrder(existing.paypal_order_id);
        if (OPEN_ORDER_STATUSES.includes(live.status)) {
          return { orderId: existing.paypal_order_id, approveUrl: existing.approve_url, reused: true };
        }
      } catch {
        // Order expired or unknown — create a fresh one.
      }
    }

    const out = await this.d.gateway.executeOrThrow('create_order', { milestone_id: m.id }, { actor: actorOf(user) });
    return { orderId: String(out.order_id), approveUrl: String(out.approve_url), reused: false };
  }

  /** Called from the PayPal return page and from the CHECKOUT.ORDER.APPROVED webhook (safety net). Idempotent. */
  async complete(actor: string, milestoneId: string, orderId: string, user?: UserDTO): Promise<MilestoneDTO> {
    return this.lock.run(milestoneId, async () => {
      const m = await this.d.repos.milestones.getRow(milestoneId);
      if (!m) throw notFound('Milestone');
      const c = await this.d.repos.contracts.getRow(m.contract_id);
      if (!c) throw notFound('Contract');
      if (user && !isBuyerOf(user, c)) throw forbidden('Only the buyer on this contract can complete funding');

      const order = await this.d.repos.payments.findByOrderId(orderId, 'ORDER');
      if (!order || order.milestone_id !== m.id) throw badRequest('This PayPal order does not belong to the milestone');

      if (m.status !== 'FUNDING_REQUIRED') {
        const dto = await this.d.repos.milestones.getDTO(m.id);
        if (dto && m.funded_at) return dto; // already funded — idempotent success
        throw conflict(`This milestone is ${m.status} and cannot be funded`);
      }

      const out = await this.d.gateway.executeOrThrow('capture_order', { milestone_id: m.id, order_id: orderId }, { actor });
      const status = String(out.status ?? '');
      const funded = out.mode === 'capture' ? status === 'COMPLETED' : ['CREATED', 'CAPTURED', 'PENDING'].includes(status);
      if (funded) {
        await this.d.transitions.transition(m.id, 'FUNDED', {
          patch: { funded_at: nowIso() },
          actorId: user?.id ?? null,
          actorRole: user?.role ?? actor,
          reason: out.mode === 'capture' ? `PayPal capture ${String(out.capture_id)}` : `PayPal authorization ${String(out.authorization_id)}`,
        });
      } else {
        this.d.log.info({ milestoneId, status }, 'capture pending — waiting for PayPal webhook');
      }
      const dto = await this.d.repos.milestones.getDTO(m.id);
      if (!dto) throw notFound('Milestone');
      return dto;
    });
  }

  /** Webhook path: a capture/authorization completed asynchronously. */
  async markFundedFromWebhook(milestoneId: string, reason: string): Promise<void> {
    await this.lock.run(milestoneId, async () => {
      const m = await this.d.repos.milestones.getRow(milestoneId);
      if (m?.status === 'FUNDING_REQUIRED') {
        await this.d.transitions.transition(m.id, 'FUNDED', { patch: { funded_at: nowIso() }, actorRole: 'system:webhook', reason });
      }
    });
  }
}
