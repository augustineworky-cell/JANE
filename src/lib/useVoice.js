import { useEffect, useRef, useState } from 'react';
import { startRecording } from './ai.js';
import { haptic } from './motion.js';

const MAX_MS = 60000;

/**
 * Mic control that works with both styles:
 *  - tap once to start, tap again to stop and send
 *  - or press and hold, release to send
 * Fixes: releasing before mic permission resolves, mouse sliding off the button, stuck recordings.
 */
export function useVoice(onAudio, onError) {
  const [phase, setPhase] = useState('idle');        // idle | starting | rec | busy
  const [ms, setMs] = useState(0);
  const rec = useRef(null), downAt = useRef(0), wantStop = useRef(false), timer = useRef(null);

  const clear = () => { clearInterval(timer.current); timer.current = null; };
  useEffect(() => () => { clear(); rec.current?.cancel(); }, []);

  async function begin() {
    wantStop.current = false; setPhase('starting'); setMs(0); haptic(15);
    try {
      const r = await startRecording();
      rec.current = r; setPhase('rec');
      const t0 = Date.now();
      timer.current = setInterval(() => { const e = Date.now() - t0; setMs(e); if (e >= MAX_MS) finish(); }, 200);
      if (wantStop.current) finish();               // user already let go / tapped while the mic was starting
    } catch {
      setPhase('idle');
      onError('Microphone blocked. Click the 🔒 / mic icon in the address bar → Allow microphone, then try again.');
    }
  }

  async function finish() {
    const r = rec.current; if (!r) { wantStop.current = true; return; }
    rec.current = null; clear(); setPhase('busy'); haptic(8);
    try {
      const audio = await r.stop();
      setPhase('idle');
      if (!audio) { onError('Too short. Tap the mic, speak, then tap again to send.'); return; }
      onAudio(audio);
    } catch { setPhase('idle'); onError('Could not read the recording. Try again or type it.'); }
  }

  function cancel() { clear(); rec.current?.cancel(); rec.current = null; wantStop.current = true; setPhase('idle'); haptic(8); }

  // pointer handlers: quick tap toggles, long press = hold-to-talk
  const bind = {
    onPointerDown(e) {
      e.preventDefault();
      downAt.current = Date.now();
      if (phase === 'idle') begin();
      else if (phase === 'rec' || phase === 'starting') finish();
    },
    onPointerUp() {
      const held = Date.now() - downAt.current;
      if (held > 450 && (phase === 'rec' || phase === 'starting') && downAt.current) finish();   // hold-to-talk release
      downAt.current = 0;
    },
    onContextMenu(e) { e.preventDefault(); },
  };
  return { phase, ms, bind, cancel, recording: phase === 'rec' || phase === 'starting' };
}
