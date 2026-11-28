import { useEffect, useRef, useState, createElement } from 'react';

const reduced = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

/** Short vibration on phones that support it (Android). Silently does nothing elsewhere. */
export const haptic = (ms = 12) => { try { if (!reduced()) navigator.vibrate?.(ms); } catch { /* ignore */ } };

/**
 * <Num v="₹1,240" /> — counts the number inside a string up from its previous value.
 * Keeps prefix/suffix text ("₹", "g", "/4", "%") exactly as given.
 */
export function Num({ v, ms = 700 }) {
  const str = String(v ?? '');
  const m = str.match(/-?[\d,]*\.?\d+/);
  const target = m ? Number(m[0].replace(/,/g, '')) : null;
  const from = useRef(0);
  const [val, setVal] = useState(reduced() || target === null ? target : 0);
  useEffect(() => {
    if (target === null || reduced()) { setVal(target); from.current = target ?? 0; return; }
    const a = from.current, t0 = performance.now(); let raf;
    const step = (t) => {
      const p = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - p, 3);
      setVal(a + (target - a) * e);
      if (p < 1) raf = requestAnimationFrame(step); else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  if (target === null) return str;
  const dec = (m[0].split('.')[1] || '').length;
  const shown = m[0].includes(',') ? Number(val).toLocaleString('en-IN', { maximumFractionDigits: dec }) : Number(val).toFixed(dec);
  return createElement('span', { className: 'num-anim' }, str.slice(0, m.index) + shown + str.slice(m.index + m[0].length));
}

/** Sheet helpers: animated close + swipe-down-to-close from the top of the sheet. */
export function useSheet(onClose, ms = 220) {
  const [closing, setClosing] = useState(false);
  const ref = useRef(null);
  const drag = useRef(null);
  const close = (after) => {
    if (closing) return;
    setClosing(true);
    setTimeout(() => (after || onClose)(), reduced() ? 0 : ms);
  };
  const handlers = {
    onPointerDown: (e) => {
      const el = ref.current;
      if (!el || el.scrollTop > 0 || e.pointerType === 'mouse' || e.target.closest('input,select,textarea,.mic')) return;
      drag.current = { y: e.clientY, dy: 0 };
    },
    onPointerMove: (e) => {
      if (!drag.current) return;
      const dy = Math.max(0, e.clientY - drag.current.y);
      drag.current.dy = dy;
      if (ref.current) { ref.current.style.transition = 'none'; ref.current.style.transform = `translateY(${dy}px)`; }
    },
    onPointerUp: () => {
      if (!drag.current) return;
      const { dy } = drag.current; drag.current = null;
      const el = ref.current; if (!el) return;
      el.style.transition = ''; el.style.transform = '';
      if (dy > 110) { haptic(8); close(); }
    },
  };
  handlers.onPointerCancel = handlers.onPointerUp;
  return { closing, close, ref, handlers };
}
