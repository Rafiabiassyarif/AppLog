import { useEffect, useRef, useState } from 'react';

export const reducedMotion = () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

/** Angka naik dari nilai sebelumnya ke nilai baru. */
export function useCountUp(value, duration = 700) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (reducedMotion()) {
      from.current = value;
      setShown(value);
      return undefined;
    }
    const start = performance.now();
    const origin = from.current;
    let frame;
    const tick = now => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = Math.round(origin + (value - origin) * eased);
      from.current = next;
      setShown(next);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);
  return shown;
}

/** true satu frame setelah tampil, agar grafik bisa beranimasi dari nol. */
export function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => setMounted(true)));
    return () => cancelAnimationFrame(frame);
  }, []);
  return mounted;
}
