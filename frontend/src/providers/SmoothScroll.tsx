import { useReducedMotion } from 'framer-motion';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ReactLenis, type LenisRef } from 'lenis/react';
import { useEffect, useRef, type ReactNode } from 'react';

gsap.registerPlugin(ScrollTrigger);

/**
 * Lenis smooth scrolling driven by GSAP's ticker, so ScrollTrigger animations and Lenis share
 * one clock. Disabled entirely for users who prefer reduced motion.
 * Nested scroll areas (grids, code blocks) opt out with `data-lenis-prevent`.
 */
export function SmoothScroll({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  const lenisRef = useRef<LenisRef>(null);

  useEffect(() => {
    if (reduced) return;
    const update = (time: number) => lenisRef.current?.lenis?.raf(time * 1000);
    gsap.ticker.add(update);
    gsap.ticker.lagSmoothing(0);
    const lenis = lenisRef.current?.lenis;
    lenis?.on('scroll', ScrollTrigger.update);
    return () => {
      gsap.ticker.remove(update);
      lenis?.off('scroll', ScrollTrigger.update);
    };
  }, [reduced]);

  if (reduced) return <>{children}</>;
  return (
    <ReactLenis root autoRaf={false} ref={lenisRef} options={{ lerp: 0.11, smoothWheel: true, wheelMultiplier: 0.95 }}>
      {children}
    </ReactLenis>
  );
}
