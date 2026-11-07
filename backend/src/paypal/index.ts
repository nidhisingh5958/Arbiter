import type { AppConfig } from '../config/env';
import type { Logger } from '../lib/logger';
import { MockPayPal } from './mock';
import { PayPalRestClient } from './rest';
import type { PayPalGateway } from './types';

export function createPayPal(config: AppConfig, log: Logger): PayPalGateway {
  if (config.paypal.mode === 'sandbox' && config.paypal.clientId && config.paypal.clientSecret) {
    return new PayPalRestClient(
      {
        clientId: config.paypal.clientId,
        clientSecret: config.paypal.clientSecret,
        baseUrl: config.paypal.baseUrl,
        webhookId: config.paypal.webhookId,
        brandName: config.paypal.brandName,
      },
      log,
    );
  }
  return new MockPayPal({
    publicWebUrl: config.publicWebUrl,
    secret: config.appSecret,
    payoutDelayMs: config.paypal.mockPayoutDelayMs,
    webhookDelayMs: config.env === 'test' ? 5 : 400,
  });
}

export * from './types';
export { MockPayPal, signMockWebhook, MOCK_ALGO } from './mock';
