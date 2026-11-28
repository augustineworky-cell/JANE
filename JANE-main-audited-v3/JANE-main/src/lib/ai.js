import { supabase } from '../supabase.js';

/** Ask the jane-ai Edge Function (Gemini) to turn voice, text or a photo into log rows. */
export async function askAI(kind, { text, audio, image, heard, context }) {
  const { data, error } = await supabase.functions.invoke('jane-ai', { body: { kind, text, audio, image, heard, context } });
  if (error) {
    let msg = error.message;
    try { const j = await error.context.json(); msg = j.error || msg; } catch { /* keep generic */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

/* ---------- voice: record, then convert to 16 kHz mono WAV (every model accepts WAV) ---------- */
export async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const rec = new MediaRecorder(stream);
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.start();
  const started = Date.now();
  // live input level (0..1) so the app can show a real meter and spot a silent mic
  let peak = 0, actx = null, an = null, buf = null;
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    an = actx.createAnalyser(); an.fftSize = 1024; buf = new Float32Array(an.fftSize);
    actx.createMediaStreamSource(stream).connect(an);
  } catch { an = null; }
  const level = () => {
    if (!an) return 0;
    an.getFloatTimeDomainData(buf);
    let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
    const v = Math.min(1, Math.sqrt(s / buf.length) * 6);
    if (v > peak) peak = v;
    return v;
  };
  const closeMeter = () => { try { actx?.close(); } catch { /* ignore */ } };
  return {
    started, level, device: stream.getAudioTracks()[0]?.label || '',
    async stop() {
      await new Promise((res) => { rec.onstop = res; rec.stop(); });
      level(); stream.getTracks().forEach((t) => t.stop()); closeMeter();
      const ms = Date.now() - started;
      if (ms < 800) return null;                                   // accidental tap
      if (an && peak < 0.03) return { silent: true, ms, device: stream.getAudioTracks()[0]?.label || '' };
      const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
      return { data: await toWavBase64(blob), mime: 'audio/wav', ms };
    },
    cancel() { try { rec.stop(); } catch { /* ignore */ } stream.getTracks().forEach((t) => t.stop()); closeMeter(); },
  };
}

async function toWavBase64(blob) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
  const rate = 16000;
  const off = new OfflineAudioContext(1, Math.ceil(buf.duration * rate), rate);
  const src = off.createBufferSource(); src.buffer = buf; src.connect(off.destination); src.start();
  const pcm = (await off.startRendering()).getChannelData(0);
  ctx.close();
  const out = new DataView(new ArrayBuffer(44 + pcm.length * 2));
  const w = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); out.setUint32(4, 36 + pcm.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
  out.setUint32(24, rate, true); out.setUint32(28, rate * 2, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true);
  w(36, 'data'); out.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 0x7fff, true);
  return bytesToBase64(new Uint8Array(out.buffer));
}

/* ---------- photo: shrink to 1024 px JPEG before sending ---------- */
export async function photoToBase64(file) {
  const img = await createImageBitmap(file);
  const k = Math.min(1, 1024 / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.82));
  return { data: bytesToBase64(new Uint8Array(await blob.arrayBuffer())), mime: 'image/jpeg' };
}

function bytesToBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
