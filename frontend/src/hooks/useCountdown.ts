import { useEffect, useState } from 'react';

/** Seconds remaining until `iso` (0 when passed or null). Ticks every second. */
export function useCountdown(iso: string | null | undefined): number {
  const compute = () => (iso ? Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 1000)) : 0);
  const [left, setLeft] = useState(compute);
  useEffect(() => {
    setLeft(compute());
    if (!iso) return;
    const t = setInterval(() => setLeft(compute()), 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- compute only depends on iso
  }, [iso]);
  return left;
}

export const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
