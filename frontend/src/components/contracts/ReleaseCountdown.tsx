import { motion } from 'framer-motion';
import { Timer } from 'lucide-react';
import { mmss, useCountdown } from '../../hooks/useCountdown';

/** Dispute-window countdown shown on approved milestones before the payout is released. */
export function ReleaseCountdown({ releaseAt, windowSeconds }: { releaseAt: string; windowSeconds: number }) {
  const left = useCountdown(releaseAt);
  const total = Math.max(1, windowSeconds);
  const progress = 1 - Math.min(1, left / total);
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-mint-400/[0.07] px-3.5 py-2.5 ring-1 ring-mint-400/20">
      <div className="relative size-9">
        <svg viewBox="0 0 36 36" className="size-9 -rotate-90">
          <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
          <motion.circle
            cx="18"
            cy="18"
            r="15"
            fill="none"
            stroke="#4fe8b0"
            strokeWidth="3"
            strokeLinecap="round"
            animate={{ pathLength: progress }}
            transition={{ duration: 0.8, ease: 'linear' }}
          />
        </svg>
        <Timer className="absolute inset-0 m-auto size-3.5 text-mint-300" />
      </div>
      <div className="text-sm">
        {left > 0 ? (
          <>
            <span className="font-semibold tabular-nums text-mint-200">{mmss(left)}</span>
            <span className="text-ink-300"> until automatic payout · buyer can still dispute</span>
          </>
        ) : (
          <span className="text-mint-200">Dispute window closed — releasing payout…</span>
        )}
      </div>
    </div>
  );
}
