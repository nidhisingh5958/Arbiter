import type { ServerEvent } from '@arbiter/shared';
import { useSyncExternalStore } from 'react';

export type StreamStatus = 'connecting' | 'open' | 'reconnecting';

/** Tiny external store for the SSE feed, read with useSyncExternalStore. */
class LiveEventStore {
  private events: ServerEvent[] = [];
  private status: StreamStatus = 'connecting';
  private readonly listeners = new Set<() => void>();

  push(e: ServerEvent): void {
    if (this.events.some((x) => x.id === e.id)) return;
    this.events = [e, ...this.events].slice(0, 80);
    this.emit();
  }

  setStatus(s: StreamStatus): void {
    if (s === this.status) return;
    this.status = s;
    this.emit();
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  getEvents = () => this.events;
  getStatus = () => this.status;

  private emit(): void {
    for (const l of this.listeners) l();
  }
}

export const liveEvents = new LiveEventStore();

export function useLiveEvents(): ServerEvent[] {
  return useSyncExternalStore(liveEvents.subscribe, liveEvents.getEvents);
}

export function useStreamStatus(): StreamStatus {
  return useSyncExternalStore(liveEvents.subscribe, liveEvents.getStatus);
}
