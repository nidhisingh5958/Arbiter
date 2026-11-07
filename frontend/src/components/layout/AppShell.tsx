import { AnimatePresence, motion } from 'framer-motion';
import { useLenis } from 'lenis/react';
import { useEffect, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useEventStream } from '../../hooks/useEventStream';
import { Footer } from './Footer';
import { TopNav } from './TopNav';

/** App chrome + animated route transitions + one shared SSE connection. */
export function AppShell({ children }: { children: ReactNode }) {
  useEventStream();
  const location = useLocation();
  const lenis = useLenis();

  useEffect(() => {
    if (lenis) lenis.scrollTo(0, { immediate: true });
    else window.scrollTo(0, 0);
  }, [location.pathname, lenis]);

  return (
    <div className="relative flex min-h-screen flex-col">
      <div className="app-backdrop" aria-hidden />
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:text-ink-950">
        Skip to content
      </a>
      <TopNav />
      <AnimatePresence mode="wait">
        <motion.main
          id="main"
          key={location.pathname}
          className="mx-auto w-full max-w-[1400px] flex-1 px-4 pt-6 sm:px-6"
          initial={{ opacity: 0, y: 16, filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -10, filter: 'blur(4px)' }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        >
          {children}
        </motion.main>
      </AnimatePresence>
      <Footer />
    </div>
  );
}
