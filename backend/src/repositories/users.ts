import type { UserDTO } from '@arbiter/shared';
import type { DB, UsersTable } from '../db/types';
import { nowIso } from '../lib/time';
import { toUserDTO } from './mappers';

export const DEMO_USER_IDS = {
  buyer: 'usr_buyer_avery',
  contractor: 'usr_contractor_ravi',
  contractor2: 'usr_contractor_adaeze',
  admin: 'usr_admin_ops',
} as const;

export class UsersRepo {
  constructor(private readonly db: DB) {}

  async get(id: string): Promise<UserDTO | null> {
    const row = await this.db.selectFrom('users').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? toUserDTO(row) : null;
  }

  async list(): Promise<UserDTO[]> {
    const rows = await this.db.selectFrom('users').selectAll().orderBy('role').orderBy('name').execute();
    return rows.map(toUserDTO);
  }

  async updatePaypalEmail(id: string, email: string): Promise<void> {
    await this.db.updateTable('users').set({ paypal_email: email }).where('id', '=', id).execute();
  }

  /** Idempotently seeds the demo personas used by the role switcher. */
  async seedDemoUsers(payoutReceiverEmail: string | null): Promise<void> {
    const created_at = nowIso();
    const users: UsersTable[] = [
      {
        id: DEMO_USER_IDS.buyer,
        name: 'Avery Chen',
        email: 'avery@lumengoods.example',
        role: 'buyer',
        country: 'US',
        paypal_email: null,
        created_at,
      },
      {
        id: DEMO_USER_IDS.contractor,
        name: 'Ravi Menon',
        email: 'ravi@freelance.example',
        role: 'contractor',
        country: 'IN',
        paypal_email: payoutReceiverEmail ?? 'ravi-sandbox@freelance.example',
        created_at,
      },
      {
        id: DEMO_USER_IDS.contractor2,
        name: 'Adaeze Okafor',
        email: 'adaeze@freelance.example',
        role: 'contractor',
        country: 'NG',
        paypal_email: payoutReceiverEmail ?? 'adaeze-sandbox@freelance.example',
        created_at,
      },
      {
        id: DEMO_USER_IDS.admin,
        name: 'Arbiter Ops',
        email: 'ops@arbiterai.example',
        role: 'admin',
        country: null,
        paypal_email: null,
        created_at,
      },
    ];
    for (const u of users) {
      await this.db
        .insertInto('users')
        .values(u)
        .onConflict((oc) => oc.column('id').doNothing())
        .execute();
    }
    // Keep the configured sandbox receiver in sync so payouts land in the right sandbox account.
    if (payoutReceiverEmail) {
      await this.db
        .updateTable('users')
        .set({ paypal_email: payoutReceiverEmail })
        .where('id', 'in', [DEMO_USER_IDS.contractor, DEMO_USER_IDS.contractor2])
        .execute();
    }
  }
}
