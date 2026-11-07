import type { DB } from '../db/types';
import { ContractsRepo } from './contracts';
import { InspectionsRepo } from './inspections';
import { MilestonesRepo } from './milestones';
import { AuditRepo, DisputesRepo, PoliciesRepo, WebhookEventsRepo } from './misc';
import { PaymentsRepo } from './payments';
import { SubmissionsRepo } from './submissions';
import { UsersRepo } from './users';

export interface Repositories {
  users: UsersRepo;
  contracts: ContractsRepo;
  milestones: MilestonesRepo;
  submissions: SubmissionsRepo;
  inspections: InspectionsRepo;
  payments: PaymentsRepo;
  policies: PoliciesRepo;
  disputes: DisputesRepo;
  webhookEvents: WebhookEventsRepo;
  audit: AuditRepo;
}

export function createRepositories(db: DB): Repositories {
  return {
    users: new UsersRepo(db),
    contracts: new ContractsRepo(db),
    milestones: new MilestonesRepo(db),
    submissions: new SubmissionsRepo(db),
    inspections: new InspectionsRepo(db),
    payments: new PaymentsRepo(db),
    policies: new PoliciesRepo(db),
    disputes: new DisputesRepo(db),
    webhookEvents: new WebhookEventsRepo(db),
    audit: new AuditRepo(db),
  };
}

export { DEMO_USER_IDS } from './users';
