import { buildApp } from './app';
import { buildConfig, loadEnvFile } from './config/env';

loadEnvFile();

async function main(): Promise<void> {
  const config = buildConfig();
  const app = await buildApp(config);

  const shutdown = async (signal: string) => {
    app.log.info(`${signal} received — shutting down`);
    try {
      await app.close();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ port: config.port, host: config.host });
}

main().catch((err) => {
  console.error('Failed to start ArbiterAI:', err instanceof Error ? err.message : err);
  process.exit(1);
});
