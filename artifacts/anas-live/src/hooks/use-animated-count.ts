import { useEffect, useRef, useState } from 'react';
import { countAnimationDuration, countAtProgress, shouldAnimateCount } from '@/lib/event-polish';

type CountAnimationCallbacks = {
  onStart?: () => void;
  onTick?: () => void;
  onLand?: () => void;
};

export function useAnimatedCount(target: number, callbacks: CountAnimationCallbacks = {}) {
  const [displayed, setDisplayed] = useState(target);
  const [pulseKey, setPulseKey] = useState(0);
  const [landed, setLanded] = useState(false);
  const displayedRef = useRef(target);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  useEffect(() => {
    const from = displayedRef.current;
    let frame = 0;
    let landingTimer = 0;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!shouldAnimateCount(from, target, reducedMotion)) {
      displayedRef.current = target;
      setDisplayed(target);
      if (target < from) callbacksRef.current.onLand?.();
      return undefined;
    }

    const duration = countAnimationDuration(from, target);
    const startedAt = performance.now();
    let previousValue = from;
    let lastTickAt = startedAt - 100;
    callbacksRef.current.onStart?.();

    const animate = (timestamp: number) => {
      const progress = Math.min(1, (timestamp - startedAt) / duration);
      const nextValue = countAtProgress(from, target, progress);
      if (nextValue !== previousValue) {
        previousValue = nextValue;
        displayedRef.current = nextValue;
        setDisplayed(nextValue);
        setPulseKey((value) => value + 1);
        if (timestamp - lastTickAt >= 90) {
          callbacksRef.current.onTick?.();
          lastTickAt = timestamp;
        }
      }
      if (progress < 1) {
        frame = window.requestAnimationFrame(animate);
      } else {
        displayedRef.current = target;
        setDisplayed(target);
        setLanded(true);
        callbacksRef.current.onLand?.();
        landingTimer = window.setTimeout(() => setLanded(false), 520);
      }
    };

    frame = window.requestAnimationFrame(animate);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(landingTimer);
    };
  }, [target]);

  return { displayed, pulseKey, landed };
}
