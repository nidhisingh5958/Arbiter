import fs from 'node:fs';
import path from 'node:path';
import { buildConfig, loadEnvFile } from '../config/env';

/** Development helper: wipes the local database (SQLite file or every ArbiterAI table in Postgres). */
async function main(): Promise<void> {
  loadEnvFile();
  const config = buildConfig();
  if (config.databaseUrl) {
    const { default: pg } = await import('pg');
    const client = new pg.Client({ connectionString: config.databaseUrl, ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined });
    await client.connect();
    await client.query(`DROP TABLE IF EXISTS release_grants, audit_log, disputes, policies, webhook_events, payments,
      agent_decisions, inspections, submissions, milestones, contracts, users, kysely_migration, kysely_migration_lock CASCADE`);
    await client.query('DROP FUNCTION IF EXISTS arbiter_append_only() CASCADE');
    await client.end();
    console.log('Postgres tables dropped. They are recreated on next start.');
    return;
  }
  const file = path.resolve(config.sqlitePath);
  for (const f of [file, `${file}-wal`, `${file}-shm`]) if (fs.existsSync(f)) fs.rmSync(f);
  console.log(`SQLite database removed (${file}). It is recreated on next start.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
