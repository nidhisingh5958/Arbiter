import { motion } from 'framer-motion';
import { Logo } from './Logo';

export function SplashScreen() {
  return (
    <div className="grid min-h-screen place-items-center" aria-busy="true" aria-live="polite">
      <div className="app-backdrop" />
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center gap-4">
        <Logo size={56} />
        <div className="h-1 w-40 overflow-hidden rounded-full bg-white/5">
          <div className="shine h-full w-full" />
        </div>
        <span className="text-sm text-ink-400">Connecting to ArbiterAI…</span>
      </motion.div>
    </div>
  );
}
