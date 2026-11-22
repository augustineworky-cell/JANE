import { useState } from 'react';
import { supabase } from '../supabase.js';

export default function Login() {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function go(e) {
    e.preventDefault(); setErr(''); setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw });
    setBusy(false); if (error) setErr(error.message === 'Invalid login credentials' ? 'Wrong email or password' : error.message);
  }
  return (
    <main className="login">
      <form className="login-card" onSubmit={go}>
        <div className="logo">J</div>
        <h1 className="serif">Jane</h1>
        <p className="muted">Your day in one look: money, gym, diet and routine.</p>
        <label>Email<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>Password<input type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required /></label>
        {err && <p className="err">{err}</p>}
        <button className="btn dark" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </main>
  );
}
