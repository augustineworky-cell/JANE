import { useEffect, useState } from 'react';
import { supabase } from '../supabase.js';
import { useSheet, haptic } from '../lib/motion.js';

/** Settings: paste the Gemini API key once. It is stored on the server and never shown again (only the last 4 characters). */
export default function Settings({ user, onClose, notify }) {
  const sh = useSheet(onClose);
  const [status, setStatus] = useState(undefined);   // undefined = loading, null = no key, '••••abcd' = saved
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { supabase.rpc('jane_ai_key_status').then(({ data }) => setStatus(data || null)); }, []);

  async function save(e) {
    e.preventDefault(); setErr('');
    const k = key.trim();
    if (!k) return;
    if (!/^AIza[\w-]{20,}$/.test(k) && !window.__janeForceKey) {
      setErr('Gemini keys start with "AIza". Copy it from aistudio.google.com/apikey → Create API key. Tap Save again to use this one anyway.');
      window.__janeForceKey = true; return;
    }
    setBusy(true);
    const { data, error } = await supabase.rpc('jane_set_ai_key', { k });
    setBusy(false); window.__janeForceKey = false;
    if (error) { setErr(error.message); haptic(30); return; }
    setStatus(data); setKey(''); haptic([12, 60, 18]); notify('AI key saved');
  }

  return (
    <div className={`sheet-back ${sh.closing ? 'out' : ''}`} onClick={() => sh.close()}>
      <div ref={sh.ref} className="sheet" onClick={(e) => e.stopPropagation()} {...sh.handlers}>
        <div className="grab" />
        <div className="swap">
          <div className="row"><h2 className="serif">Settings</h2><button className="x" onClick={() => sh.close()} aria-label="Close">✕</button></div>

          <section className="blk card">
            <div className="blk-h"><span>AI key (Google Gemini)</span>
              <span className={status ? 'ok-chip' : 'muted'}>{status === undefined ? '…' : status ? `✓ saved ${status}` : 'not set'}</span></div>
            <p className="muted small" style={{ margin: '4px 0 10px' }}>
              Voice, photo and typing use Gemini. Get a free key at <b>aistudio.google.com/apikey</b> → <b>Create API key</b> (it starts with <b>AIza</b>), then paste it here.
              It is saved on the server only and is never shown again.
            </p>
            <form className="bar" style={{ marginTop: 0 }} onSubmit={save}>
              <input type="password" autoComplete="off" spellCheck="false" placeholder={status ? 'Paste a new key to replace' : 'Paste your API key'} value={key} onChange={(e) => { setKey(e.target.value); setErr(''); window.__janeForceKey = false; }} />
              <button className="pill on" disabled={busy || !key.trim()}>{busy ? 'Saving…' : 'Save'}</button>
            </form>
            {err && <p className="err">{err}</p>}
          </section>

          <section className="blk card">
            <div className="blk-h"><span>Account</span></div>
            <div className="it"><span>{user.email}</span><button className="pill" onClick={() => supabase.auth.signOut()}>Sign out</button></div>
          </section>
        </div>
      </div>
    </div>
  );
}
