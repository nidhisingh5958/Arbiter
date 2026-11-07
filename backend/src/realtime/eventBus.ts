import { EventEmitter } from 'node:events';
import type { ServerEvent, ServerEventPayload } from '@arbiter/shared';
import { newId } from '../lib/crypto';
import { nowIso } from '../lib/time';

type Listener = (event: ServerEvent) => void;

/** In-process pub/sub that fans agent, payment and webhook events out to SSE clients. */
export class EventBus {
  private readonly emitter = new EventEmitter();
  private readonly recent: ServerEvent[] = [];
  private readonly maxRecent = 60;

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  publish(payload: ServerEventPayload): ServerEvent {
    const event = { ...payload, id: newId('evt', 10), at: nowIso() } as ServerEvent;
    this.recent.push(event);
    if (this.recent.length > this.maxRecent) this.recent.shift();
    this.emitter.emit('event', event);
    return event;
  }

  subscribe(listener: Listener): () => void {
    this.emitter.on('event', listener);
    return () => this.emitter.off('event', listener);
  }

  recentEvents(limit = 30): ServerEvent[] {
    return this.recent.slice(-limit);
  }

  listenerCount(): number {
    return this.emitter.listenerCount('event');
  }
}
