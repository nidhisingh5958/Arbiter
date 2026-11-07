import { buildConfig, loadEnvFile } from '../config/env';
import { createContext } from '../context';
import { silentLogger } from '../lib/logger';
import { DEMO_USER_IDS } from '../repositories';

/** Seeds the three demo contracts (awaiting funding) without starting the HTTP server. */
async function main(): Promise<void> {
  loadEnvFile();
  const config = { ...buildConfig(), schedulerEnabled: false };
  const ctx = await createContext(config, silentLogger);
  try {
    const buyer = await ctx.repos.users.get(DEMO_USER_IDS.buyer);
    if (!buyer) throw new Error('Demo buyer missing');
    const res = await ctx.demo.runScenario(buyer, false);
    console.log(res.message);
    for (const id of res.contractIds) console.log(`  contract ${id}`);
  } finally {
    await ctx.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
