import { useStreamStatus } from '../../lib/liveEvents';
import { cn } from '../../lib/cn';
import { useConfig } from '../../hooks/useConfig';

export function LiveIndicator() {
  const status = useStreamStatus();
  const live = status === 'open';
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-medium text-ink-200 ring-1 ring-inset ring-white/10"
      title={live ? 'Receiving live events (SSE)' : 'Reconnecting to live events…'}
      aria-live="polite"
    >
      <span className="relative flex size-2">
        {live ? <span className="absolute inset-0 animate-pulse-ring rounded-full bg-mint-400" /> : null}
        <span className={cn('relative size-2 rounded-full', live ? 'bg-mint-400' : 'bg-amber-300')} />
      </span>
      {live ? 'Live' : 'Connecting'}
    </span>
  );
}

export function ModeBadges() {
  const { data } = useConfig();
  if (!data) return null;
  return (
    <div className="hidden items-center gap-1.5 xl:flex">
      <span
        className={cn(
          'rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset',
          data.paypalMode === 'sandbox' ? 'bg-sky-400/10 text-sky-200 ring-sky-300/25' : 'bg-white/5 text-ink-300 ring-white/10',
        )}
        title={data.paypalMode === 'sandbox' ? 'Real PayPal sandbox APIs' : 'Offline PayPal simulator'}
      >
        PayPal · {data.paypalMode}
      </span>
      <span
        className={cn(
          'max-w-48 truncate rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset',
          data.llmMode === 'groq' ? 'bg-iris-500/12 text-iris-200 ring-iris-400/25' : 'bg-white/5 text-ink-300 ring-white/10',
        )}
        title={`LLM: ${data.llmModel}`}
      >
        {data.llmMode === 'groq' ? `Groq · ${data.llmModel}` : 'LLM · mock'}
      </span>
    </div>
  );
}
