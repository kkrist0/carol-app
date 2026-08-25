import { useState, useEffect, useRef } from 'react';

export function useCountUp(value, duration = 900) {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);

  useEffect(() => {
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    
    if (reduce) { 
      const rafFallback = requestAnimationFrame(() => {
        setDisplay(value); 
        prev.current = value;
      });
      return () => cancelAnimationFrame(rafFallback); 
    }

    const from = prev.current;
    const to = value;
    const start = performance.now();
    let raf;

    const tick = (t) => {
      const p = Math.min(1, (t - start) / duration);
      const e = 1 - Math.pow(1 - p, 3); // Easing cubico (ease-out)
      
      setDisplay(from + (to - from) * e);
      
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        prev.current = to;
      }
    };

    raf = requestAnimationFrame(tick);
    
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return display;
}