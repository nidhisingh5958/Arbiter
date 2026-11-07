import { motion } from 'framer-motion';

/** Semicircular confidence gauge with the policy minimum marked as a tick. */
export function ConfidenceGauge({ value, threshold, size = 200 }: { value: number | null; threshold: number; size?: number }) {
  const v = Math.max(0, Math.min(1, value ?? 0));
  const r = 80;
  const cx = 100;
  const cy = 100;
  const arc = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  const angle = Math.PI * (1 - threshold);
  const tx = cx + r * Math.cos(angle);
  const ty = cy - r * Math.sin(angle);
  const color = value === null ? '#434e69' : v >= threshold ? '#4fe8b0' : v >= threshold - 0.2 ? '#ffc15a' : '#ff6b86';

  return (
    <div className="relative" style={{ width: size, height: size * 0.62 }} role="img" aria-label={`Confidence ${Math.round(v * 100)} percent; policy minimum ${Math.round(threshold * 100)} percent`}>
      <svg viewBox="0 0 200 118" className="h-full w-full overflow-visible">
        <defs>
          <linearGradient id="gauge-grad" x1="0" x2="1">
            <stop offset="0%" stopColor="#8b7bff" />
            <stop offset="100%" stopColor={color} />
          </linearGradient>
          <filter id="gauge-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <path d={arc} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="14" strokeLinecap="round" />
        <motion.path
          d={arc}
          fill="none"
          stroke="url(#gauge-grad)"
          strokeWidth="14"
          strokeLinecap="round"
          filter="url(#gauge-glow)"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: v }}
          transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
        />
        <line x1={tx} y1={ty} x2={cx + (r - 22) * Math.cos(angle)} y2={cy - (r - 22) * Math.sin(angle)} stroke="#e7eaf3" strokeWidth="2" strokeDasharray="3 3" />
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <motion.div
          key={value ?? 'none'}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="font-display text-4xl font-semibold tabular-nums text-white"
        >
          {value === null ? '—' : `${Math.round(v * 100)}%`}
        </motion.div>
        <div className="text-[11px] uppercase tracking-wider text-ink-400">confidence · min {Math.round(threshold * 100)}%</div>
      </div>
    </div>
  );
}
