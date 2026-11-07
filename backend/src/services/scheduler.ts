import { errorMessage } from '../lib/errors';
import type { Logger } from '../lib/logger';
import type { PayoutService } from './payouts';

/** Releases approved milestones after their dispute window and polls unsettled payouts. */
export class Scheduler {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly payouts: PayoutService,
    private readonly log: Logger,
    private readonly intervalMs: number,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.payouts.releaseDue();
      await this.payouts.pollPending();
    } catch (err) {
      this.log.error({ err: errorMessage(err) }, 'scheduler tick failed');
    } finally {
      this.running = false;
    }
  }
}
