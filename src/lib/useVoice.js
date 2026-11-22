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
  const [live, setLive] = useState('');
  const rec = useRef(null), downAt = useRef(0), wantStop = useRef(false), timer = useRef(null);
  const sr = useRef(null), heard = useRef('');

  // Live captions: the browser's own speech-to-text, shown while you talk. Optional: if missing or it fails, Gemini still hears the audio.
  function startCaptions() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    heard.current = ''; setLive('');
    if (!SR) return;
    try {
      const s = new SR(); s.lang = 'en-IN'; s.interimResults = true; s.continuous = true;
      let done = '';
      s.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript;
          if (e.results[i].isFinal) done += t + ' '; else interim += t;
        }
        heard.current = (done + interim).trim(); setLive(heard.current);
      };
      s.onerror = () => {}; s.start(); sr.current = s;
    } catch { sr.current = null; }
  }
  function stopCaptions() { try { sr.current?.stop(); } catch { /* ignore */ } sr.current = null; }

  const clear = () => { clearInterval(timer.current); timer.current = null; };
  useEffect(() => () => { clear(); stopCaptions(); rec.current?.cancel(); }, []);

  async function begin() {
    wantStop.current = false; setPhase('starting'); setMs(0); haptic(15);
    try {
      const r = await startRecording();
      rec.current = r; setPhase('rec'); startCaptions();
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
    await new Promise((ok) => setTimeout(ok, 350));   // let the last words land in the captions
    stopCaptions();
    try {
      const audio = await r.stop();
      setPhase('idle');
      if (!audio) { onError('Too short. Tap the mic, speak, then tap again to send.'); return; }
      onAudio(audio, heard.current);
    } catch { setPhase('idle'); onError('Could not read the recording. Try again or type it.'); }
  }

  function cancel() { clear(); stopCaptions(); setLive(''); rec.current?.cancel(); rec.current = null; wantStop.current = true; setPhase('idle'); haptic(8); }

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
  return { phase, ms, live, bind, cancel, recording: phase === 'rec' || phase === 'starting' };
}
