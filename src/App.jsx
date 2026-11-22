import { useEffect, useState, useCallback } from 'react';
import { supabase } from './supabase.js';
import Login from './components/Login.jsx';
import DaySheet from './components/DaySheet.jsx';
import LogSheet from './components/LogSheet.jsx';
import Home from './pages/Home.jsx';
import Money from './pages/Money.jsx';
import Body from './pages/Body.jsx';
import Routine from './pages/Routine.jsx';
import { loadRefs, loadMonth } from './lib/data.js';
import { today, shiftMonth, dayLabel } from './lib/dates.js';
import { haptic } from './lib/motion.js';

const TABS = [['home', 'Home'], ['money', 'Money'], ['body', 'Body'], ['routine', 'Routine']];
const useWide = () => {
  const [w, setW] = useState(() => window.innerWidth >= 960);
  useEffect(() => { const f = () => setW(window.innerWidth >= 960); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);
  return w;
};

export default function App() {
  const [session, setSession] = useState(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  if (session === undefined) return <div className="boot serif">Jane</div>;
  if (!session) return <Login />;
  return <Jane user={session.user} />;
}

function Jane({ user }) {
  const wide = useWide();
  const [tab, setTab] = useState('home');
  const [month, setMonth] = useState(today().slice(0, 7));
  const [refs, setRefs] = useState(null);
  const [days, setDays] = useState({});
  const [sel, setSel] = useState(today());
  const [sheet, setSheet] = useState(false);
  const [log, setLog] = useState(null);           // kind or null
  const [logDate, setLogDate] = useState(today());
  const openLog = (kind, date) => { setLogDate(date || today()); setLog(kind); };
  const [err, setErr] = useState('');
  const [toast, setToast] = useState('');
  const [budget, setBudgetS] = useState(() => { try { return Number(localStorage.getItem('jane-budget')) || 1000; } catch { return 1000; } });
  const setBudget = (v) => { setBudgetS(v); try { localStorage.setItem('jane-budget', String(v)); } catch { /* ignore */ } };

  const reload = useCallback(async () => {
    try { setErr(''); const [r, d] = await Promise.all([refs ? Promise.resolve(refs) : loadRefs(), loadMonth(month)]); setRefs(r); setDays(d); }
    catch (e) { setErr(e.message); }
  }, [month, refs]);
  useEffect(() => { reload(); }, [month]); // eslint-disable-line react-hooks/exhaustive-deps

  const notify = (m) => { setToast(m); setTimeout(() => setToast(''), 2200); };
  const pick = (d) => { setSel(d); if (d.slice(0, 7) !== month) setMonth(d.slice(0, 7)); if (!wide) setSheet(true); };
  const [dir, setDir] = useState(0);
  const shift = (n) => { setDir(n); haptic(6); setMonth((m) => shiftMonth(m, n)); };
  const go = (k) => { if (k !== tab) { haptic(6); setTab(k); } };

  if (err && !refs) return <main className="boot"><div><p className="err">{err}</p><p className="muted small">If this says "permission denied", run supabase/migrations/001_jane_access.sql (see README).</p><button className="pill on" onClick={reload}>Retry</button> <button className="pill" onClick={() => supabase.auth.signOut()}>Sign out</button></div></main>;
  if (!refs) return <div className="boot serif">Jane</div>;

  const props = { dir, month, setMonth, days, refs, selected: sel, onPick: pick, budget, setBudget, shift, onChanged: reload };
  const page = tab === 'money' ? <Money {...props} /> : tab === 'body' ? <Body {...props} /> : tab === 'routine' ? <Routine {...props} /> : <Home {...props} />;

  return (
    <div className={`app ${wide ? 'wide' : ''}`}>
      <header className="top">
        <span className="serif brand">Jane</span>
        {wide && <nav className="toptabs">{TABS.map(([k, l]) => <button key={k} className={`pill ${tab === k ? 'on' : ''}`} onClick={() => go(k)}>{l}</button>)}</nav>}
        <span className="muted small hide-sm">{dayLabel(today())}</span>
        {wide && <button className="pill on" onClick={() => openLog('diet', sel)}>🎙 Log</button>}
        <button className="pill" onClick={() => supabase.auth.signOut()} title={user.email}>Sign out</button>
      </header>
      {!wide && <p className="muted small sub">{dayLabel(today())} · your day in one look</p>}

      <div className="main">
        <div className="content"><div key={tab} className="page">{page}</div></div>
        {wide && <DaySheet asPanel date={sel} day={days[sel]} refs={refs} onLog={(k) => openLog(k, sel)} onChanged={reload} />}
      </div>

      {!wide && <nav className="bottom">
        {TABS.slice(0, 2).map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => go(k)}>{l}</button>)}
        <button className="mic fab" onClick={() => { haptic(10); openLog('diet'); }} aria-label="Log">🎙</button>
        {TABS.slice(2).map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => go(k)}>{l}</button>)}
      </nav>}

      {sheet && !wide && <DaySheet date={sel} day={days[sel]} refs={refs} onLog={(k) => { setSheet(false); openLog(k, sel); }} onChanged={reload} onClose={() => setSheet(false)} />}
      {log && <LogSheet kind={log} date={logDate} refs={refs} notify={notify} onClose={() => setLog(null)} onSaved={() => { setLog(null); reload(); }} />}
      {toast && <div key={toast + Date.now()} className="toast"><span className="tick">✓</span>{toast}</div>}
    </div>
  );
}
