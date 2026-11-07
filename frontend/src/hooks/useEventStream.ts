import type { ServerEvent } from '@arbiter/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { eventsUrl } from '../lib/api';
import { liveEvents } from '../lib/liveEvents';

/** Keys to refresh for each event type; batched so a burst of events triggers one refetch. */
function keysFor(e: ServerEvent): string[][] {
  switch (e.type) {
    case 'milestone.updated':
      return [['contracts'], ['contract', e.contractId], ['milestone', e.milestoneId], ['dashboard']];
    case 'payment.updated':
    case 'inspection.created':
      return [['milestone', e.milestoneId], ['dashboard']];
    case 'decision.created':
      return e.milestoneId ? [['milestone', e.milestoneId], ['dashboard']] : [['dashboard']];
    case 'webhook.received':
      return [['dashboard']];
    case 'contract.created':
    case 'contract.updated':
      return [['contracts'], ['contract', e.contractId], ['dashboard']];
    default:
      return [];
  }
}

/** Opens the SSE stream once for the whole app and turns server events into cache invalidations. */
export function useEventStream(): void {
  const qc = useQueryClient();

  useEffect(() => {
    const pending = new Map<string, string[]>();
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      flushTimer = null;
      for (const key of pending.values()) void qc.invalidateQueries({ queryKey: key });
      pending.clear();
    };

    const source = new EventSource(eventsUrl());
    source.onopen = () => liveEvents.setStatus('open');
    source.onerror = () => liveEvents.setStatus('reconnecting');
    source.onmessage = (msg) => {
      let event: ServerEvent;
      try {
        event = JSON.parse(msg.data) as ServerEvent;
      } catch {
        return;
      }
      if (event.type === 'hello') return;
      liveEvents.push(event);
      for (const key of keysFor(event)) pending.set(key.join('|'), key);
      if (!flushTimer) flushTimer = setTimeout(flush, 180);
    };
    return () => {
      source.close();
      if (flushTimer) clearTimeout(flushTimer);
    };
  }, [qc]);
}
