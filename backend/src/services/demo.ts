import {
  DEMO_PRS,
  DEMO_URLS,
  GithubPrParamsSchema,
  UrlParamsSchema,
  sampleSow,
  type ContractDetailDTO,
  type ContractDraft,
  type DemoScenarioDTO,
  type UserDTO,
} from '@arbiter/shared';
import { errorMessage, forbidden } from '../lib/errors';
import type { Logger } from '../lib/logger';
import { isoDatePlusDays, sleep } from '../lib/time';
import { MockPayPal } from '../paypal/mock';
import type { PayPalGateway } from '../paypal/types';
import { DEMO_USER_IDS, type Repositories } from '../repositories';
import type { ContractService } from './contracts';
import type { DisputeService } from './disputes';
import type { FundingService } from './funding';
import type { SubmissionService } from './submissions';

export interface DemoDeps {
  repos: Repositories;
  paypal: PayPalGateway;
  contracts: ContractService;
  funding: FundingService;
  submissions: SubmissionService;
  disputes: DisputeService;
  log: Logger;
}

const repo = 'arbiterai-demo/storefront';

export function demoContracts(now = new Date()): { draft: ContractDraft; contractorId: string; sowText: string; submit: string[] }[] {
  const d = (days: number) => isoDatePlusDays(days, now);
  return [
    {
      contractorId: DEMO_USER_IDS.contractor,
      sowText: sampleSow(now),
      submit: [DEMO_PRS.happy, DEMO_URLS.happy],
      draft: {
        title: 'Lumen Goods storefront refresh',
        summary: 'Checkout page and launch landing page for Lumen Goods, paid per milestone.',
        currency: 'USD',
        totalCents: 140_000,
        milestones: [
          {
            title: 'Checkout page',
            description: 'Responsive checkout page with tax-aware cart totals in the storefront repo.',
            acceptanceCriteria: [
              'Pull request is merged into main.',
              'CI checks build and test must pass.',
              'Changes are limited to src/checkout/**.',
              'Cart totals include tax and are covered by unit tests.',
            ],
            amountCents: 90_000,
            currency: 'USD',
            deadline: d(14),
            verification: {
              type: 'GITHUB_PR',
              params: GithubPrParamsSchema.parse({ repo, requiredChecks: ['build', 'test'], expectedPaths: ['src/checkout/**'], requireMerged: true }),
            },
          },
          {
            title: 'Launch landing page',
            description: 'Deploy the spring launch landing page with newsletter signup.',
            acceptanceCriteria: [
              'The page returns HTTP 200 over HTTPS.',
              'The page must contain "Lumen Goods" and "Free shipping".',
              'The page includes a newsletter form #signup-form.',
              'Basic accessibility: page title, viewport meta tag and alt text on images.',
            ],
            amountCents: 50_000,
            currency: 'USD',
            deadline: d(28),
            verification: {
              type: 'URL',
              params: UrlParamsSchema.parse({ url: DEMO_URLS.happy, requiredText: ['Lumen Goods', 'Free shipping'], requiredSelectors: ['#signup-form'] }),
            },
          },
        ],
      },
    },
    {
      contractorId: DEMO_USER_IDS.contractor2,
      sowText: 'Order history API for the Lumen Goods storefront: paginated endpoint under src/api/orders with tests under tests/orders. $700.',
      submit: [DEMO_PRS.failing],
      draft: {
        title: 'Order history API',
        summary: 'Paginated order-history endpoint with tests.',
        currency: 'USD',
        totalCents: 70_000,
        milestones: [
          {
            title: 'Order history endpoint',
            description: 'GET /api/orders/history with pagination and tests.',
            acceptanceCriteria: [
              'Pull request is merged into main.',
              'CI checks build and test must pass.',
              'Endpoint code lives under src/api/orders/** with tests under tests/orders/**.',
            ],
            amountCents: 70_000,
            currency: 'USD',
            deadline: d(10),
            verification: {
              type: 'GITHUB_PR',
              params: GithubPrParamsSchema.parse({
                repo,
                requiredChecks: ['build', 'test'],
                expectedPaths: ['src/api/orders/**', 'tests/orders/**'],
                requireMerged: true,
              }),
            },
          },
        ],
      },
    },
    {
      contractorId: DEMO_USER_IDS.contractor,
      sowText: 'Discount codes at checkout for Lumen Goods. Percentage and fixed codes, with tests. $600.',
      submit: [DEMO_PRS.injection],
      draft: {
        title: 'Checkout discount codes',
        summary: 'Percentage and fixed-amount discount codes at checkout.',
        currency: 'USD',
        totalCents: 60_000,
        milestones: [
          {
            title: 'Discount codes',
            description: 'applyDiscount() for percentage and fixed codes, with tests.',
            acceptanceCriteria: [
              'Pull request is merged into main.',
              'CI checks build and test must pass.',
              'Changes are limited to src/checkout/**.',
              'Expired codes are rejected and covered by tests.',
            ],
            amountCents: 60_000,
            currency: 'USD',
            deadline: d(7),
            verification: {
              type: 'GITHUB_PR',
              params: GithubPrParamsSchema.parse({ repo, requiredChecks: ['build', 'test'], expectedPaths: ['src/checkout/**'], requireMerged: true }),
            },
          },
        ],
      },
    },
  ];
}


/** Seeds the three demo stories: happy path, failing submission, and a prompt-injection attempt. */
export class DemoService {
  private running = false;

  constructor(private readonly d: DemoDeps) {}

  async runScenario(requester: UserDTO, autoRunRequested: boolean): Promise<DemoScenarioDTO> {
    if (requester.role === 'contractor') throw forbidden('Switch to the buyer or admin role to seed the demo scenario');
    const buyer = await this.d.repos.users.get(DEMO_USER_IDS.buyer);
    if (!buyer) throw new Error('Demo buyer missing');

    const specs = demoContracts();
    const created: ContractDetailDTO[] = [];
    for (const s of specs) {
      created.push(await this.d.contracts.create(buyer, { draft: s.draft, contractorId: s.contractorId, sowText: s.sowText }));
    }
    const autoRun = autoRunRequested && this.d.paypal instanceof MockPayPal;
    if (autoRun && !this.running) {
      this.running = true;
      setTimeout(() => {
        this.autoRun(
          buyer,
          created.map((c, i) => ({ contractId: c.id, milestoneIds: c.milestones.map((m) => m.id), submit: specs[i]!.submit, contractorId: specs[i]!.contractorId })),
        )
          .catch((e) => this.d.log.error({ err: errorMessage(e) }, 'demo auto-run failed'))
          .finally(() => (this.running = false));
      }, 600);
    }
    return {
      contractIds: created.map((c) => c.id),
      autoRun,
      message: autoRun
        ? 'Seeded 3 contracts. Funding, submissions and verification are running live — watch the dashboard.'
        : this.d.paypal.mode === 'sandbox'
          ? 'Seeded 3 contracts awaiting funding. Fund each milestone through PayPal sandbox checkout, then submit the demo PRs from the contractor view.'
          : 'Seeded 3 contracts awaiting funding.',
    };
  }

  private async autoRun(buyer: UserDTO, items: { contractId: string; milestoneIds: string[]; submit: string[]; contractorId: string }[]): Promise<void> {
    const mock = this.d.paypal as MockPayPal;
    const fund = async (milestoneId: string) => {
      const start = await this.d.funding.start(buyer, milestoneId);
      mock.approveOrder(start.orderId);
      await this.d.funding.complete(`user:${buyer.id}`, milestoneId, start.orderId, buyer);
    };
    const submitUrl = async (contractorId: string, milestoneId: string, url: string) => {
      const contractor = await this.d.repos.users.get(contractorId);
      if (!contractor) return;
      const kind = url.includes('github.com') ? ('GITHUB_PR' as const) : ('URL' as const);
      await this.d.submissions.submit(contractor, milestoneId, { kind, url }, { waitForVerification: true });
    };

    // Story 1: happy path → early release → second milestone opens and verifies.
    const [happy, failing, injection] = items;
    if (happy) {
      await fund(happy.milestoneIds[0]!);
      await sleep(700);
      await submitUrl(happy.contractorId, happy.milestoneIds[0]!, happy.submit[0]!);
      await sleep(500);
      const m1 = await this.d.repos.milestones.getRow(happy.milestoneIds[0]!);
      if (m1?.status === 'APPROVED') await this.d.disputes.waiveWindow(buyer, m1.id);
    }
    // Story 2: failing CI and missing tests → REJECTED.
    if (failing) {
      await fund(failing.milestoneIds[0]!);
      await sleep(700);
      await submitUrl(failing.contractorId, failing.milestoneIds[0]!, failing.submit[0]!);
    }
    // Story 3: prompt injection in the PR → ESCALATED, payout blocked.
    if (injection) {
      await fund(injection.milestoneIds[0]!);
      await sleep(700);
      await submitUrl(injection.contractorId, injection.milestoneIds[0]!, injection.submit[0]!);
    }
    // Back to story 1: once milestone 1 is paid, milestone 2 opens for funding.
    if (happy?.milestoneIds[1]) {
      const m2Id = happy.milestoneIds[1];
      for (let i = 0; i < 30; i++) {
        const m2 = await this.d.repos.milestones.getRow(m2Id);
        if (m2?.status === 'FUNDING_REQUIRED') break;
        await sleep(500);
      }
      const m2 = await this.d.repos.milestones.getRow(m2Id);
      if (m2?.status === 'FUNDING_REQUIRED') {
        await fund(m2Id);
        await sleep(700);
        await submitUrl(happy.contractorId, m2Id, happy.submit[1]!);
      }
    }
  }
}
