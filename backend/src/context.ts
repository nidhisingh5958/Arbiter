import type { AppConfig } from './config/env';
import { DecisionLog } from './agent/decisionLog';
import { ReleaseGrants } from './agent/policy/grants';
import { ToolGateway } from './agent/tools/gateway';
import { GuardedSiteFetcher, type SiteFetcher } from './agent/verifiers/siteFetcher';
import { createDb } from './db/client';
import type { DB, Dialect } from './db/types';
import { GithubRouter } from './github/client';
import type { GithubApi } from './github/types';
import type { Logger } from './lib/logger';
import { createLlm, type LlmProvider } from './llm';
import { createPayPal, MockPayPal, type PayPalGateway } from './paypal';
import { EventBus } from './realtime/eventBus';
import { createRepositories, type Repositories } from './repositories';
import { ContractService } from './services/contracts';
import { DemoService } from './services/demo';
import { DisputeService } from './services/disputes';
import { FundingService } from './services/funding';
import { InsightsService } from './services/insights';
import { PayoutService } from './services/payouts';
import { Scheduler } from './services/scheduler';
import { SubmissionService } from './services/submissions';
import { MilestoneTransitions } from './services/transitions';
import { VerificationService } from './services/verification';
import { WebhookService } from './services/webhooks';

export interface AppContext {
  config: AppConfig;
  log: Logger;
  db: DB;
  dialect: Dialect;
  repos: Repositories;
  bus: EventBus;
  llm: LlmProvider;
  paypal: PayPalGateway;
  github: GithubApi;
  decisionLog: DecisionLog;
  grants: ReleaseGrants;
  gateway: ToolGateway;
  transitions: MilestoneTransitions;
  contracts: ContractService;
  funding: FundingService;
  submissions: SubmissionService;
  verification: VerificationService;
  payouts: PayoutService;
  disputes: DisputeService;
  webhooks: WebhookService;
  insights: InsightsService;
  demo: DemoService;
  scheduler: Scheduler;
  close(): Promise<void>;
}

export interface ContextOverrides {
  paypal?: PayPalGateway;
  llm?: LlmProvider;
  github?: GithubApi;
  fetcher?: SiteFetcher;
}

/** Composition root: wires infrastructure, agent components and services together. */
export async function createContext(config: AppConfig, log: Logger, overrides: ContextOverrides = {}): Promise<AppContext> {
  const handle = await createDb(config);
  const db = handle.db;
  const repos = createRepositories(db);
  await repos.users.seedDemoUsers(config.paypal.payoutReceiverEmail);

  const bus = new EventBus();
  const llm = overrides.llm ?? createLlm(config, log);
  const paypal = overrides.paypal ?? createPayPal(config, log);
  const github = overrides.github ?? new GithubRouter(config.github);
  const fetcher = overrides.fetcher ?? new GuardedSiteFetcher();

  const decisionLog = new DecisionLog(db, bus);
  const grants = new ReleaseGrants(db, config.appSecret);
  const transitions = new MilestoneTransitions(repos, bus);
  const gateway = new ToolGateway({ config, repos, paypal, grants, transitions, bus, log }, decisionLog);

  const payouts = new PayoutService({ repos, llm, gateway, grants, paypal, decisionLog, transitions, bus, log });
  const verification = new VerificationService(
    { config, repos, llm, github, fetcher, decisionLog, transitions, bus, log },
    (milestoneId) => payouts.release(milestoneId, 'scheduler'),
  );
  const contracts = new ContractService({ config, db, repos, llm, decisionLog, transitions, bus });
  const funding = new FundingService({ repos, gateway, paypal, transitions, log });
  const submissions = new SubmissionService(repos, transitions, verification);
  const disputes = new DisputeService({ repos, decisionLog, transitions, gateway, payouts, verification });
  const webhooks = new WebhookService({ repos, paypal, funding, payouts, decisionLog, bus, log });
  const insights = new InsightsService(repos, decisionLog);
  const demo = new DemoService({ repos, paypal, contracts, funding, submissions, disputes, log });
  const scheduler = new Scheduler(payouts, log, config.schedulerIntervalMs);

  // The PayPal simulator delivers signed webhooks through the real receiver.
  if (paypal instanceof MockPayPal) paypal.setWebhookSink((raw, headers) => webhooks.handle(raw, headers));
  if (config.schedulerEnabled) scheduler.start();

  return {
    config,
    log,
    db,
    dialect: handle.dialect,
    repos,
    bus,
    llm,
    paypal,
    github,
    decisionLog,
    grants,
    gateway,
    transitions,
    contracts,
    funding,
    submissions,
    verification,
    payouts,
    disputes,
    webhooks,
    insights,
    demo,
    scheduler,
    async close() {
      scheduler.stop();
      if (paypal instanceof MockPayPal) paypal.dispose();
      await handle.close();
    },
  };
}
