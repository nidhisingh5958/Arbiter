import { sql, type Kysely } from 'kysely';
import { Migrator, type Migration, type MigrationProvider } from 'kysely/migration';
import type { Database, Dialect } from './types';

// Kysely migrations operate on an untyped schema surface.
type AnyDb = Kysely<unknown>;

function initMigration(dialect: Dialect): Migration {
  return {
    async up(db: AnyDb) {
      await db.schema
        .createTable('users')
        .ifNotExists()
        .addColumn('id', 'text', (c) => c.primaryKey())
        .addColumn('name', 'text', (c) => c.notNull())
        .addColumn('email', 'text', (c) => c.notNull().unique())
        .addColumn('role', 'text', (c) => c.notNull())
        .addColumn('country', 'text')
        .addColumn('paypal_email', 'text')
        .addColumn('created_at', 'text', (c) => c.notNull())
        .execute();

      await db.schema
        .createTable('contracts')
        .ifNotExists()
        .addColumn('id', 'text', (c) => c.primaryKey())
        .addColumn('title', 'text', (c) => c.notNull())
        .addColumn('summary', 'text', (c) => c.notNull().defaultTo(''))
        .addColumn('sow_text', 'text', (c) => c.notNull().defaultTo(''))
        .addColumn('buyer_id', 'text', (c) => c.notNull().references('users.id'))
        .addColumn('contractor_id', 'text', (c) => c.notNull().references('users.id'))
        .addColumn('currency', 'text', (c) => c.notNull())
        .addColumn('total_cents', 'integer', (c) => c.notNull())
        .addColumn('status', 'text', (c) => c.notNull())
        .addColumn('created_at', 'text', (c) => c.notNull())
        .addColumn('updated_at', 'text', (c) => c.notNull())
        .execute();

      await db.schema
        .createTable('milestones')
        .ifNotExists()
        .addColumn('id', 'text', (c) => c.primaryKey())
        .addColumn('contract_id', 'text', (c) => c.notNull().references('contracts.id'))
        .addColumn('seq', 'integer', (c) => c.notNull())
        .addColumn('title', 'text', (c) => c.notNull())
        .addColumn('description', 'text', (c) => c.notNull().defaultTo(''))
        .addColumn('acceptance_criteria', 'text', (c) => c.notNull())
        .addColumn('amount_cents', 'integer', (c) => c.notNull())
        .addColumn('currency', 'text', (c) => c.notNull())
        .addColumn('deadline', 'text', (c) => c.notNull())
        .addColumn('verification', 'text', (c) => c.notNull())
        .addColumn('status', 'text', (c) => c.notNull())
        .addColumn('decision_verdict', 'text')
        .addColumn('decision_confidence', 'double precision')
        .addColumn('decision_summary', 'text')
        .addColumn('injection_flag', 'integer', (c) => c.notNull().defaultTo(0))
        .addColumn('release_at', 'text')
        .addColumn('funded_at', 'text')
        .addColumn('submitted_at', 'text')
        .addColumn('decided_at', 'text')
        .addColumn('paid_at', 'text')
        .addColumn('created_at', 'text', (c) => c.notNull())
        .addColumn('updated_at', 'text', (c) => c.notNull())
        .execute();
      await db.schema
        .createIndex('ux_milestones_contract_seq')
        .ifNotExists()
        .on('milestones')
        .columns(['contract_id', 'seq'])
        .unique()
        .execute();
      await db.schema.createIndex('ix_milestones_status').ifNotExists().on('milestones').column('status').execute();

      await db.schema
        .createTable('submissions')
        .ifNotExists()
        .addColumn('id', 'text', (c) => c.primaryKey())
        .addColumn('milestone_id', 'text', (c) => c.notNull().references('milestones.id'))
        .addColumn('contractor_id', 'text', (c) => c.notNull().references('users.id'))
        .addColumn('kind', 'text', (c) => c.notNull())
        .addColumn('url', 'text')
        .addColumn('notes', 'text')
        .addColumn('file_name', 'text')
        .addColumn('file_sha256', 'text')
        .addColumn('file_size_bytes', 'integer')
        .addColumn('file_content', 'text')
        .addColumn('created_at', 'text', (c) => c.notNull())
        .execute();
      await db.schema.createIndex('ix_submissions_milestone').ifNotExists().on('submissions').column('milestone_id').execute();

      await db.schema
        .createTable('inspections')
        .ifNotExists()
        .addColumn('id', 'text', (c) => c.primaryKey())
        .addColumn('submission_id', 'text', (c) => c.notNull().references('submissions.id'))
        .addColumn('milestone_id', 'text', (c) => c.notNull().references('milestones.id'))
        .addColumn('check_name', 'text', (c) => c.notNull())
        .addColumn('category', 'text', (c) => c.notNull())
        .addColumn('status', 'text', (c) => c.notNull())
        .addColumn('severity', 'text', (c) => c.notNull())
        .addColumn('injection_flag', 'integer', (c) => c.notNull().defaultTo(0))
        .addColumn('message', 'text', (c) => c.notNull())
        .addColumn('evidence', 'text', (c) => c.notNull())
        .addColumn('created_at', 'text', (c) => c.notNull())
        .execute();
      await db.schema.createIndex('ix_inspections_milestone').ifNotExists().on('inspections').column('milestone_id').execute();

      await db.schema
        .createTable('agent_decisions')
        .ifNotExists()
        .addColumn('id', 'text', (c) => c.primaryKey())
        .addColumn('seq', 'integer', (c) => c.notNull().unique())
        .addColumn('milestone_id', 'text')
        .addColumn('submission_id', 'text')
        .addColumn('action', 'text', (c) => c.notNull())
        .addColumn('actor', 'text', (c) => c.notNull())
        .addColumn('verdict', 'text')
        .addColumn('confidence', 'double precision')
        .addColumn('inputs_hash', 'text', (c) => c.notNull())
        .addColumn('outputs', 'text', (c) => c.notNull())
        .addColumn('model', 'text')
        .addColumn('prompt_tokens', 'integer')
        .addColumn('completion_tokens', 'integer')
        .addColumn('latency_ms', 'integer')
        .addColumn('prev_hash', 'text', (c) => c.notNull())
        .addColumn('hash', 'text', (c) => c.notNull())
        .addColumn('created_at', 'text', (c) => c.notNull())
        .execute();
      await db.schema
        .createIndex('ix_agent_decisions_milestone')
        .ifNotExists()
        .on('agent_decisions')
        .column('milestone_id')
        .execute();

      await db.schema
        .createTable('payments')
        .ifNotExists()
        .addColumn('id', 'text', (c) => c.primaryKey())
        .addColumn('milestone_id', 'text', (c) => c.notNull().references('milestones.id'))
        .addColumn('contract_id', 'text', (c) => c.notNull().references('contracts.id'))
        .addColumn('kind', 'text', (c) => c.notNull())
        .addColumn('status', 'text', (c) => c.notNull())
        .addColumn('amount_cents', 'integer', (c) => c.notNull())
        .addColumn('fee_cents', 'integer')
        .addColumn('currency', 'text', (c) => c.notNull())
        .addColumn('paypal_order_id', 'text')
        .addColumn('paypal_capture_id', 'text')
        .addColumn('paypal_authorization_id', 'text')
        .addColumn('payout_batch_id', 'text')
        .addColumn('payout_item_id', 'text')
        .addColumn('refund_id', 'text')
        .addColumn('request_id', 'text', (c) => c.unique())
        .addColumn('approve_url', 'text')
        .addColumn('source', 'text', (c) => c.notNull())
        .addColumn('last_event_id', 'text')
        .addColumn('raw', 'text')
        .addColumn('created_at', 'text', (c) => c.notNull())
        .addColumn('updated_at', 'text', (c) => c.notNull())
        .execute();
      await db.schema.createIndex('ix_payments_milestone').ifNotExists().on('payments').column('milestone_id').execute();
      await db.schema.createIndex('ix_payments_order').ifNotExists().on('payments').column('paypal_order_id').execute();
      await db.schema.createIndex('ix_payments_batch').ifNotExists().on('payments').column('payout_batch_id').execute();

      await db.schema
        .createTable('webhook_events')
        .ifNotExists()
        .addColumn('id', 'text', (c) => c.primaryKey())
        .addColumn('event_type', 'text', (c) => c.notNull())
        .addColumn('resource_type', 'text')
        .addColumn('resource_id', 'text')
        .addColumn('verified', 'integer', (c) => c.notNull().defaultTo(0))
        .addColumn('processed', 'integer', (c) => c.notNull().defaultTo(0))
        .addColumn('duplicate_count', 'integer', (c) => c.notNull().defaultTo(0))
        .addColumn('error', 'text')
        .addColumn('payload', 'text', (c) => c.notNull())
        .addColumn('received_at', 'text', (c) => c.notNull())
        .addColumn('processed_at', 'text')
        .execute();

      await db.schema
        .createTable('policies')
        .ifNotExists()
        .addColumn('id', 'text', (c) => c.primaryKey())
        .addColumn('contract_id', 'text', (c) => c.notNull().unique().references('contracts.id'))
        .addColumn('max_auto_release_cents', 'integer', (c) => c.notNull())
        .addColumn('min_confidence', 'double precision', (c) => c.notNull())
        .addColumn('daily_payout_cap_cents', 'integer', (c) => c.notNull())
        .addColumn('human_approval_above_cents', 'integer', (c) => c.notNull())
        .addColumn('dispute_window_seconds', 'integer', (c) => c.notNull())
        .addColumn('created_at', 'text', (c) => c.notNull())
        .addColumn('updated_at', 'text', (c) => c.notNull())
        .execute();

      await db.schema
        .createTable('disputes')
        .ifNotExists()
        .addColumn('id', 'text', (c) => c.primaryKey())
        .addColumn('milestone_id', 'text', (c) => c.notNull().references('milestones.id'))
        .addColumn('raised_by', 'text', (c) => c.notNull().references('users.id'))
        .addColumn('raised_by_role', 'text', (c) => c.notNull())
        .addColumn('reason', 'text', (c) => c.notNull())
        .addColumn('status', 'text', (c) => c.notNull())
        .addColumn('resolution', 'text')
        .addColumn('resolved_by', 'text')
        .addColumn('created_at', 'text', (c) => c.notNull())
        .addColumn('resolved_at', 'text')
        .execute();

      await db.schema
        .createTable('audit_log')
        .ifNotExists()
        .addColumn('id', 'text', (c) => c.primaryKey())
        .addColumn('actor_id', 'text')
        .addColumn('actor_role', 'text')
        .addColumn('action', 'text', (c) => c.notNull())
        .addColumn('entity_type', 'text', (c) => c.notNull())
        .addColumn('entity_id', 'text', (c) => c.notNull())
        .addColumn('details', 'text', (c) => c.notNull())
        .addColumn('created_at', 'text', (c) => c.notNull())
        .execute();

      await db.schema
        .createTable('release_grants')
        .ifNotExists()
        .addColumn('id', 'text', (c) => c.primaryKey())
        .addColumn('milestone_id', 'text', (c) => c.notNull().references('milestones.id'))
        .addColumn('amount_cents', 'integer', (c) => c.notNull())
        .addColumn('kind', 'text', (c) => c.notNull())
        .addColumn('issued_by', 'text', (c) => c.notNull())
        .addColumn('expires_at', 'text', (c) => c.notNull())
        .addColumn('used_at', 'text')
        .addColumn('created_at', 'text', (c) => c.notNull())
        .execute();

      // Append-only enforcement at the database level for the decision log and audit log.
      if (dialect === 'sqlite') {
        for (const table of ['agent_decisions', 'audit_log']) {
          await sql
            .raw(
              `CREATE TRIGGER IF NOT EXISTS ${table}_no_update BEFORE UPDATE ON ${table}
               BEGIN SELECT RAISE(ABORT, '${table} is append-only'); END;`,
            )
            .execute(db);
          await sql
            .raw(
              `CREATE TRIGGER IF NOT EXISTS ${table}_no_delete BEFORE DELETE ON ${table}
               BEGIN SELECT RAISE(ABORT, '${table} is append-only'); END;`,
            )
            .execute(db);
        }
      } else {
        await sql
          .raw(
            `CREATE OR REPLACE FUNCTION arbiter_append_only() RETURNS trigger AS $$
             BEGIN RAISE EXCEPTION '% is append-only', TG_TABLE_NAME; END; $$ LANGUAGE plpgsql;`,
          )
          .execute(db);
        for (const table of ['agent_decisions', 'audit_log']) {
          await sql.raw(`DROP TRIGGER IF EXISTS ${table}_append_only ON ${table};`).execute(db);
          await sql
            .raw(
              `CREATE TRIGGER ${table}_append_only BEFORE UPDATE OR DELETE ON ${table}
               FOR EACH ROW EXECUTE FUNCTION arbiter_append_only();`,
            )
            .execute(db);
        }
      }
    },
  };
}

class StaticProvider implements MigrationProvider {
  constructor(private readonly dialect: Dialect) {}
  async getMigrations(): Promise<Record<string, Migration>> {
    return { '001_init': initMigration(this.dialect) };
  }
}

export async function migrateToLatest(db: Kysely<Database>, dialect: Dialect): Promise<void> {
  const migrator = new Migrator({ db, provider: new StaticProvider(dialect) });
  const { error, results } = await migrator.migrateToLatest();
  const failed = results?.find((r) => r.status === 'Error');
  if (error || failed) {
    const reason = error instanceof Error ? error.message : String(error ?? failed?.migrationName);
    throw new Error(`Database migration failed: ${reason}`);
  }
}
