import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { buttonClasses } from '../components/ui/Button';

export function NotFoundPage() {
  return (
    <div className="grid place-items-center py-24 text-center">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
        <div className="text-gradient font-display text-8xl font-semibold">404</div>
        <p className="mt-3 text-ink-300">This page isn't part of any contract.</p>
        <Link to="/" className={buttonClasses('secondary', 'md', 'mt-6')}>
          Back to overview
        </Link>
      </motion.div>
    </div>
  );
}
