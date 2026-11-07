import { motion } from 'framer-motion';

/** ArbiterAI mark: a balance arc with a verified node, drawn on mount. */
export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <defs>
        <linearGradient id="logo-g" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#a798ff" />
          <stop offset="100%" stopColor="#4fe8b0" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="#0d121e" stroke="rgba(255,255,255,0.08)" />
      <motion.path
        d="M7.5 21.5c3.2-8.6 13.8-8.6 17 0"
        stroke="url(#logo-g)"
        strokeWidth="2.6"
        fill="none"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
      />
      <motion.circle
        cx="16"
        cy="10.5"
        r="3.2"
        fill="#4fe8b0"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.6, type: 'spring', stiffness: 400, damping: 14 }}
      />
    </svg>
  );
}
