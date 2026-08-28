import { useEffect, useRef, useState } from "react";

const PREFERS_REDUCED_MOTION =
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

export function useCountUp(target: number, durationMs = 900, delayMs = 0): number {
  const [value, setValue] = useState(PREFERS_REDUCED_MOTION ? target : 0);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    if (PREFERS_REDUCED_MOTION) {
      setValue(target);
      return;
    }

    let startTime: number | null = null;
    const startDelay = setTimeout(() => {
      const step = (timestamp: number) => {
        if (startTime === null) startTime = timestamp;
        const elapsed = timestamp - startTime;
        const progress = Math.min(elapsed / durationMs, 1);
        setValue(Math.round(target * easeOutQuad(progress)));
        if (progress < 1) {
          frameRef.current = requestAnimationFrame(step);
        }
      };
      frameRef.current = requestAnimationFrame(step);
    }, delayMs);

    return () => {
      clearTimeout(startDelay);
      cancelAnimationFrame(frameRef.current);
    };
  }, [target]);

  return value;
}