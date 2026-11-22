import { useRef, useState } from 'react';
import { askAI, startRecording, photoToBase64 } from '../lib/ai.js';
import { saveDiet, saveGym, saveExpenses } from '../lib/data.js';
import { dayLabel, weekday, rs } from '../lib/dates.js';
import { useSheet, haptic } from '../lib/motion.js';

const KINDS = [['diet', 'Diet'], ['gym', 'Gym'], ['expense', 'Expense']];
const guessMeal = () => { const h = new Date().getHours(); return h < 11 ? 'breakfast' : h < 16 ? 'lunch' : h < 19 ? 'snack' : 'dinner'; };

/** Speak, type or snap → Gemini (via the jane-ai Edge Function) → confirm card → Save. */
export default function LogSheet({ kind: k0, date, refs, onClose, onSaved, notify, onSettings }) {
  const [kind, setKind] = useState(k0 || 'diet');
  const [rec, setRec] = useState(null);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');
  const [said, setSaid] = useState('');
  const [card, setCard] = useState(null);       // { meal?, items: [] }
  const [err, setErr] = useState('');
  const fileRef = useRef(null);
  const sh = useSheet(onClose);

  const context = { date, now: new Date().toISOString(), categories: refs.cats.map((c) => c.name), accounts: refs.accts.map((a) => a.name), meal_guess: guessMeal(), previous: card };

  async function run(input, label) {
    setBusy(true); setErr(''); setSaid(label);
    try {
      const res = await askAI(kind, { ...input, context });
      if (!res?.items?.length) throw new Error(res?.question || 'Could not find anything to log. Try again.');
      setCard(res); haptic([10, 40, 10]);
    } catch (e) { setErr(e.message); haptic(30); } finally { setBusy(false); }
  }
  async function micDown() {
    setErr('');
    haptic(15);
    try { setRec(await startRecording()); } catch { setErr('Microphone blocked. Allow mic access for Jane in the browser settings.'); }
  }
  async function micUp() {
    if (!rec) return;
    const r = rec; setRec(null); haptic(8);
    const audio = await r.stop();
    if (!audio) return;
    run({ audio }, '🎙 voice note');
  }
  async function onPhoto(e) {
    const f = e.target.files?.[0]; e.target.value = '';
    if (f) run({ image: await photoToBase64(f) }, '📷 photo');
  }
  function sendText(e) { e.preventDefault(); if (text.trim()) { run({ text: text.trim() }, text.trim()); setText(''); } }

  async function save() {
    setBusy(true);
    try {
      if (kind === 'diet') await saveDiet(card.meal || guessMeal(), card.items, date);
      if (kind === 'gym') await saveGym(card.items, date);
      if (kind === 'expense') await saveExpenses(card.items, refs, date);
      haptic([12, 60, 18]); notify('Saved'); sh.close(onSaved);
    } catch (e) { setErr(e.message); setBusy(false); }
  }
  const edit = (i, f, v) => setCard((c) => ({ ...c, items: c.items.map((it, j) => (j === i ? { ...it, [f]: v } : it)) }));
  const drop = (i) => setCard((c) => ({ ...c, items: c.items.filter((_, j) => j !== i) }));

  /* quick picks: meals from the routine plan, today's gym plan */
  const mealPicks = refs.routine.filter((r) => /breakfast|lunch|dinner|shake|snack/i.test(r.task)).map((r) => {
    const name = r.task.split(':')[0].trim();
    const kcal = Number((r.task.match(/~\s*(\d+)\s*kcal/i) || [])[1]) || null;
    const meal = /breakfast/i.test(name) ? 'breakfast' : /lunch/i.test(name) ? 'lunch' : /dinner/i.test(name) ? 'dinner' : 'snack';
    return { label: name, card: { meal, items: [{ name: r.task.split(':').slice(1).join(':').replace(/~\s*\d+\s*kcal\.?/i, '').trim() || name, qty: '', kcal }] } };
  });
  const todaysPlan = refs.plan.filter((p) => p.weekday === weekday(date));

  const tot = card ? card.items.reduce((s, it) => ({ kcal: s.kcal + (+it.kcal || 0), p: s.p + (+it.protein_g || 0), c: s.c + (+it.carbs_g || 0), f: s.f + (+it.fat_g || 0), amt: s.amt + (+it.amount || 0) }), { kcal: 0, p: 0, c: 0, f: 0, amt: 0 }) : null;

  return (
    <div className={`sheet-back ${sh.closing ? 'out' : ''}`} onClick={() => sh.close()}>
      <div ref={sh.ref} className="sheet log" onClick={(e) => e.stopPropagation()} {...sh.handlers}>
        <div className="grab" />
        <div className="row"><h2 className="serif">Log{card ? ' · ' + KINDS.find((x) => x[0] === kind)[1] : ''}</h2><span className="muted" style={{ marginLeft: 8 }}>{dayLabel(date)}</span><button className="x" onClick={() => sh.close()} aria-label="Close">✕</button></div>
        {!card && <div className="row gap6 tabs">{KINDS.map(([k, l]) => <button key={k} className={`pill ${kind === k ? 'on' : ''}`} onClick={() => { setKind(k); setErr(''); }}>{l}</button>)}</div>}

        {!card && <div key={kind} className="swap">
          {kind === 'diet' && mealPicks.length > 0 && <><div className="muted small">Quick picks · your meal plan</div>
            <div className="row gap6 wrap">{mealPicks.map((q) => <button key={q.label} className="pill" onClick={() => { setSaid(q.label); setCard(q.card); }}>{q.label}</button>)}</div></>}
          {kind === 'gym' && <><div className="muted small">Today's plan ({weekday(date)})</div>
            {todaysPlan.length ? <button className="pill on" onClick={() => { setSaid('Done as planned'); setCard({ items: todaysPlan.map((p) => ({ exercise: p.exercises?.name, sets: p.sets, reps: p.reps_target })) }); }}>Done as planned ✓ · {todaysPlan[0].session_name}</button>
              : <p className="muted small">No plan for {weekday(date)} yet. Just say what you did.</p>}</>}

          <p className="muted center" style={{ marginTop: 22 }}>{kind === 'diet' ? 'Speak, type or snap your plate' : kind === 'gym' ? 'Say what you did, e.g. "bench 3 by 10 at 40"' : 'Say it, e.g. "60 on chai, UPI" or snap a UPI screenshot'}</p>
          <div className="row center gap14">
            <div className="center-col">
              <button className={`mic big ${rec ? 'rec' : ''}`} onPointerDown={micDown} onPointerUp={micUp} onPointerLeave={micUp} onContextMenu={(e) => e.preventDefault()} disabled={busy} aria-label="Hold to talk">🎙</button>
              <span className="muted small">{rec ? 'Listening… release to send' : 'Hold to talk'}</span>
            </div>
            {kind !== 'gym' && <div className="center-col">
              <button className="mic big ghost" onClick={() => fileRef.current?.click()} disabled={busy} aria-label="Photo">📷</button>
              <span className="muted small">Photo</span>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={onPhoto} />
            </div>}
          </div>
          {rec && <div className="wave" aria-hidden="true">{Array.from({ length: 9 }, (_, i) => <i key={i} style={{ '--i': i }} />)}</div>}
        </div>}

        {said && <div key={said} className="me">{said}</div>}
        {busy && <div className="thinking"><span /><span /><span /> thinking…</div>}
        {err && <p className="err">{err}{/settings/i.test(err) && <> <button className="pill sm on" onClick={() => sh.close(onSettings)}>Open Settings</button></>}</p>}

        {card && !busy && <div className="card confirm">
          {kind === 'diet' && <div className="row gap6" style={{ marginBottom: 6 }}>
            {['breakfast', 'lunch', 'snack', 'dinner'].map((m) => <button key={m} className={`pill sm ${card.meal === m ? 'on' : ''}`} onClick={() => setCard({ ...card, meal: m })}>{m}</button>)}
          </div>}
          {card.items.map((it, i) => (
            <div key={i} className="it edit" style={{ '--i': i }}>
              {kind === 'diet' && <><input value={[it.name, it.qty].filter(Boolean).join(' · ')} onChange={(e) => edit(i, 'name', e.target.value) || edit(i, 'qty', '')} />
                <input className="num" inputMode="numeric" value={it.kcal ?? ''} onChange={(e) => edit(i, 'kcal', e.target.value)} /><span className="muted">kcal</span></>}
              {kind === 'gym' && <><input value={it.exercise || ''} onChange={(e) => edit(i, 'exercise', e.target.value)} />
                <input className="num" value={it.sets ?? ''} onChange={(e) => edit(i, 'sets', e.target.value)} /><span className="muted">×</span>
                <input className="num" value={it.reps ?? ''} onChange={(e) => edit(i, 'reps', e.target.value)} />
                <input className="num" value={it.weight_kg ?? ''} onChange={(e) => edit(i, 'weight_kg', e.target.value)} /><span className="muted">kg</span></>}
              {kind === 'expense' && <><input value={it.description || ''} onChange={(e) => edit(i, 'description', e.target.value)} />
                <select value={it.category || ''} onChange={(e) => edit(i, 'category', e.target.value)}>{refs.cats.map((c) => <option key={c.id}>{c.name}</option>)}</select>
                <select value={/cash/i.test(it.payment_mode || '') ? 'Cash' : 'UPI'} onChange={(e) => edit(i, 'payment_mode', e.target.value)}><option>UPI</option><option>Cash</option></select>
                <input className="num" inputMode="decimal" value={it.amount ?? ''} onChange={(e) => edit(i, 'amount', e.target.value)} /></>}
              <button className="x sm" onClick={() => drop(i)} aria-label="Remove">✕</button>
            </div>
          ))}
          {kind === 'diet' && <div className="mac">
            <div className="la"><b>{Math.round(tot.kcal)}</b>kcal</div><div className="gr"><b>{Math.round(tot.p)}g</b>protein</div>
            <div className="ye"><b>{Math.round(tot.c)}g</b>carbs</div><div className="co"><b>{Math.round(tot.f)}g</b>fat</div>
          </div>}
          {kind === 'expense' && <div className="row" style={{ marginTop: 8 }}><span className="muted">Total</span><b style={{ marginLeft: 'auto' }}>{rs(tot.amt)}</b></div>}
          {kind === 'diet' && <p className="muted tiny">Estimate · tap any line to fix it</p>}
          <div className="row gap6" style={{ marginTop: 10 }}>
            <button className="pill on big" onClick={save} disabled={!card.items.length}>Save ✓</button>
            <button className="pill big" onClick={() => { setCard(null); setSaid(''); }}>Start over</button>
          </div>
        </div>}

        <form className="bar" onSubmit={sendText}>
          <input placeholder={card ? 'Correct or add more…' : 'Or type it…'} value={text} onChange={(e) => setText(e.target.value)} />
          <button className={`mic ${rec ? 'rec' : ''}`} type={text.trim() ? 'submit' : 'button'} onPointerDown={text.trim() ? undefined : micDown} onPointerUp={text.trim() ? undefined : micUp} aria-label={text.trim() ? 'Send' : 'Hold to talk'}>{text.trim() ? '➤' : '🎙'}</button>
        </form>
      </div>
    </div>
  );
}
