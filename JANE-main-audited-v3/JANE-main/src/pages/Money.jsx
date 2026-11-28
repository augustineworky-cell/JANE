import { useEffect, useState, useCallback, useRef } from 'react';
import { today, parse, rs, dayLabel, istDay, cycleStartOf, shiftCycle, cycleEnd, cycleLabel } from '../lib/dates.js';
import { loadCycle, savePlan, copyPlan, saveActualBalance } from '../lib/data.js';
import { Num, haptic } from '../lib/motion.js';
import { exportCycle } from '../lib/exportXlsx.js';

const MS_DAY = 86400000;
const HIDE = /^(salary|transfer)$/i;   // helper categories, shown only if used

export default function Money({ days, refs, budget, setBudget, onPick }) {
  const curCycle = cycleStartOf(today());
  const [cycle, setCycle] = useState(curCycle);
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [planDraft, setPlanDraft] = useState({});
  const [balDraft, setBalDraft] = useState({});

  const reqRef = useRef(0);
  const refresh = useCallback(async () => {
    const id = ++reqRef.current;
    try {
      setErr('');
      const res = await loadCycle(cycle);
      if (id !== reqRef.current) return;   // a newer request is running (cycle switched), drop this one
      setData(res);
      const pd = {};
      for (const p of res.plan) pd[p.category_id] = String(p.planned ?? '');
      setPlanDraft(pd);
      const bd = {};
      for (const a of res.balances) bd[a.id] = a.actual_balance != null ? String(a.actual_balance) : '';
      setBalDraft(bd);
    } catch (e) {
      setErr(e.message);
    }
  }, [cycle]);

  useEffect(() => { refresh(); }, [refresh, days]);

  const [sheet, setSheet] = useState(() => { try { return localStorage.getItem('jane-sheet-url') || ''; } catch { return ''; } });
  const pasteSheet = () => {
    const u = (window.prompt('Paste your Google Sheet link (one time):') || '').trim();
    if (!/^https:\/\/docs\.google\.com\/spreadsheets\//.test(u)) return;
    try { localStorage.setItem('jane-sheet-url', u); } catch { /* ignore */ }
    setSheet(u);
  };
  const forgetSheet = () => { try { localStorage.removeItem('jane-sheet-url'); } catch { /* ignore */ } setSheet(''); };

  const shift = (n) => { haptic(6); setData(null); setCycle((c) => shiftCycle(c, n)); };

  const expenses = data?.expenses || [];
  const plan = data?.plan || [];
  const balances = data?.balances || [];

  const planByCat = {};
  for (const p of plan) planByCat[p.category_id] = p;

  const saveCatIds = new Set(plan.filter((p) => p.kind === 'save').map((p) => p.category_id));
  const spendRows = expenses.filter((e) => !e.entry_type || e.entry_type === 'expense');
  const incomeRows = expenses.filter((e) => e.entry_type === 'income');
  const transferRows = expenses.filter((e) => e.entry_type === 'transfer');

  const totalSpent = spendRows.reduce((s, e) => s + Number(e.amount), 0);   // every real expense, incl. the BCA fee when paid
  const totalIncome = incomeRows.reduce((s, e) => s + Number(e.amount), 0);

  // spend line = real expenses in that category; save line = transfers into it (never expenses)
  const actualForCat = (catId, kind) => expenses
    .filter((e) => e.category_id === catId && (e.entry_type || 'expense') === (kind === 'save' ? 'transfer' : 'expense'))
    .reduce((s, e) => s + Number(e.amount), 0);

  const plannedSpend = plan.filter((p) => p.kind !== 'save').reduce((s, p) => s + Number(p.planned || 0), 0);
  const plannedSave = plan.filter((p) => p.kind === 'save').reduce((s, p) => s + Number(p.planned || 0), 0);

  const totalSaved = [...saveCatIds].reduce((s, id) => s + actualForCat(id, 'save'), 0);

  const cashAcct = balances.find((a) => a.kind === 'cash');
  const cashInHand = Number(cashAcct?.calculated || 0);

  const t = today();
  const end = cycleEnd(cycle);
  const totalDays = Math.round((parse(end) - parse(cycle)) / MS_DAY) + 1;
  const daysLeft = t < cycle ? totalDays : t > end ? 0 : Math.round((parse(end) - parse(t)) / MS_DAY) + 1;
  const daysElapsed = Math.max(0, Math.min(totalDays, totalDays - daysLeft));
  const perDayLeft = daysLeft > 0 && plannedSpend > totalSpent ? (plannedSpend - totalSpent) / daysLeft : 0;

  async function commitPlan(catId, nextPlanned, nextKind) {
    const cur = planByCat[catId];
    const kind = nextKind ?? cur?.kind ?? 'spend';
    const val = Math.max(0, Number(nextPlanned) || 0);
    if (cur && Number(cur.planned) === val && cur.kind === kind) return;
    if (!cur && val === 0 && kind === 'spend') return;   // focus + blur on an empty box must not create a ₹0 row
    try {
      setErr('');
      await savePlan(cycle, catId, val, kind);
      haptic(8);
      await refresh();
    } catch (e) { setErr(e.message); }
  }

  async function onCopyLast() {
    setBusy(true); setErr('');
    try {
      await copyPlan(shiftCycle(cycle, -1), cycle);
      haptic(10);
      await refresh();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  async function commitBalance(acctId) {
    const raw = balDraft[acctId];
    if (raw === '' || raw === undefined) return;
    try {
      setErr('');
      await saveActualBalance(acctId, raw);
      haptic(10);
      await refresh();
    } catch (e) { setErr(e.message); }
  }

  const planRows = refs.cats.map((c) => {
    const p = planByCat[c.id];
    const kind = p?.kind || 'spend';
    const planned = Number(p?.planned || 0);
    const actual = actualForCat(c.id, kind);
    return { id: c.id, name: c.name, kind, planned, actual };
  }).filter((r) => r.actual || r.planned || !HIDE.test(r.name));

  // Checks
  // a typed balance only means something on the day it was typed (later entries change the calculated one)
  const mismatches = balances.filter((a) => a.checked_on === t && Math.abs(Number(a.actual_balance) - Number(a.calculated || 0)) >= 1);
  const checkedToday = balances.filter((a) => a.checked_on === t).length;
  const seen = {}; let dupes = 0;
  for (const e of expenses) { const k = [istDay(e.spent_at), e.amount, e.description || '', e.account_id].join('|'); if (seen[k]) dupes++; seen[k] = 1; }
  const futureRows = expenses.filter((e) => istDay(e.spent_at) > t).length;
  const zeroSpend = plan.length ? planRows.filter((r) => r.kind === 'spend' && r.planned === 0 && r.actual > 0) : [];
  const missingAcct = expenses.filter((e) => !e.account_id);
  const badTransfers = transferRows.filter((e) => !e.account_id || !e.to_account_id);
  const spendPct = plannedSpend ? Math.round((totalSpent / plannedSpend) * 100) : 0;
  const elapsedPct = totalDays ? Math.round((daysElapsed / totalDays) * 100) : 0;
  const checks = [
    {
      label: 'Spend pace',
      ok: !plannedSpend ? true : totalSpent <= plannedSpend && (daysLeft === 0 || spendPct <= elapsedPct + 12),
      detail: !plannedSpend ? 'Set planned amounts below' : totalSpent > plannedSpend ? `Over plan by ${rs(totalSpent - plannedSpend)}` : `${spendPct}% spent · ${elapsedPct}% of cycle elapsed`,
    },
    {
      label: 'Savings goal',
      ok: !plannedSave || totalSaved >= plannedSave,
      detail: !plannedSave ? 'No savings planned yet' : totalSaved >= plannedSave ? `Hit ${rs(plannedSave)} target` : `${rs(plannedSave - totalSaved)} left to save`,
    },
    {
      label: 'Balance check',
      ok: balances.length > 0 && mismatches.length === 0,
      detail: !balances.length ? 'No accounts yet' : mismatches.length ? `${mismatches.length} account${mismatches.length > 1 ? 's' : ''} off by ≥ ₹1 today` : checkedToday ? 'Typed balances match' : 'Type today’s real balances to verify',
    },
    { label: 'Cash balance', ok: !(cashAcct && Number(cashAcct.calculated) < 0), detail: cashAcct && Number(cashAcct.calculated) < 0 ? 'Cash is below 0, an ATM transfer is missing' : 'Not below 0' },
    { label: 'Zero-budget spend', ok: zeroSpend.length === 0, detail: zeroSpend.length ? `Spent in: ${zeroSpend.map((r) => r.name).join(', ')}` : 'None' },
    { label: 'Duplicates', ok: dupes === 0, detail: dupes ? `${dupes} possible duplicate entr${dupes > 1 ? 'ies' : 'y'}` : 'None' },
    { label: 'Future-dated', ok: futureRows === 0, detail: futureRows ? `${futureRows} entr${futureRows > 1 ? 'ies' : 'y'} dated in the future` : 'None' },
    ...(t >= cycle && t <= end ? [{ label: 'Salary logged', ok: incomeRows.length > 0, detail: incomeRows.length ? 'Income entry found' : 'Log your salary as Income' }] : []),
    {
      label: 'Entry hygiene',
      ok: missingAcct.length === 0 && badTransfers.length === 0,
      detail: badTransfers.length ? `${badTransfers.length} transfer${badTransfers.length > 1 ? 's' : ''} missing from/to account` : missingAcct.length ? `${missingAcct.length} entr${missingAcct.length > 1 ? 'ies' : 'y'} missing account` : 'All entries linked to accounts',
    },
  ];

  // Day by day for this cycle
  const byDay = {};
  for (const e of expenses) {
    const d = istDay(e.spent_at);
    const cur = byDay[d] || { spent: 0, income: 0, transfer: 0, count: 0 };
    const type = e.entry_type || 'expense';
    if (type === 'income') cur.income += Number(e.amount);
    else if (type === 'transfer') cur.transfer += Number(e.amount);
    else cur.spent += Number(e.amount);
    cur.count += 1;
    byDay[d] = cur;
  }
  const dayList = Object.keys(byDay).sort().reverse();

  return (
    <>
      <div className="row month-h wrap">
        <button className="pill" onClick={() => shift(-1)} aria-label="Previous cycle">‹</button>
        <b key={cycle} className="month-name">{cycleLabel(cycle)}</b>
        <button className="pill" onClick={() => shift(1)} disabled={cycle >= shiftCycle(curCycle, 1)} aria-label="Next cycle">›</button>
        {cycle !== curCycle && <button className="pill sm" onClick={() => { haptic(6); setData(null); setCycle(curCycle); }}>Current</button>}
        <span className="row gap6" style={{ marginLeft: 'auto' }}>
          <button
            className="pill sm"
            disabled={!data}
            onClick={() => exportCycle({
              data: { start: data.start, rows: expenses },
              refs,
              lines: planRows.map((r) => ({ c: { name: r.name }, kind: r.kind, planned: r.planned, actual: r.actual })),
              bal: balances,
            }).catch((e) => setErr(e.message))}
          >⬇ Excel</button>
          {sheet ? <><a className="pill sm" href={sheet} target="_blank" rel="noopener noreferrer">Sheet ↗</a><button className="link muted tiny" onClick={forgetSheet}>change</button></>
            : <button className="pill sm" onClick={pasteSheet}>+ Google Sheet</button>}
        </span>
      </div>

      {err && <p className="err">{err}</p>}

      <div className="stats">
        <div className="st">
          <div className="muted">Cash in hand</div>
          <div className="n serif"><Num v={rs(cashInHand)} /></div>
          <div className="muted tiny">physical cash, calculated</div>
        </div>
        <div className="st">
          <div className="muted">Days left</div>
          <div className="n serif"><Num v={daysLeft} /></div>
          <div className="muted tiny">{daysLeft > 0 ? (perDayLeft > 0 ? `${rs(perDayLeft)}/day left` : `of ${totalDays} · ends ${dayLabel(end)}`) : 'cycle ended'}</div>
        </div>
        <div className="st">
          <div className="muted">Spent vs planned</div>
          <div className="n serif"><Num v={rs(totalSpent)} /></div>
          <div className="muted tiny">{plannedSpend ? `${rs(plannedSpend)} planned · ${spendPct}%` : `${spendRows.length} entries`}</div>
        </div>
        <div className="st">
          <div className="muted">Saved vs planned</div>
          <div className="n serif"><Num v={rs(totalSaved)} /></div>
          <div className="muted tiny">{plannedSave ? `${rs(plannedSave)} planned · ${Math.round((totalSaved / plannedSave) * 100)}%` : totalIncome ? `${rs(totalIncome)} income` : 'no save plan'}</div>
        </div>
      </div>

      <section className="blk card">
        <div className="blk-h">
          <span>Plan vs reality</span>
          {!plan.length && <button className="pill sm" onClick={onCopyLast} disabled={busy}>Copy last cycle’s plan</button>}
        </div>
        {planRows.length ? planRows.map((r, i) => {
          const pct = r.planned > 0 ? Math.min(100, (r.actual / r.planned) * 100) : (r.actual > 0 ? 100 : 0);
          const over = r.kind === 'spend' && r.planned > 0 && r.actual > r.planned;
          return (
            <div key={r.id} style={{ padding: '7px 0', borderBottom: i < planRows.length - 1 ? '1px solid var(--line-2)' : 0 }}>
              <div className="row gap6" style={{ justifyContent: 'space-between' }}>
                <div className="row gap6" style={{ minWidth: 0 }}>
                  <span style={{ fontWeight: 500 }}>{r.name}</span>
                  <button
                    type="button"
                    className={`pill sm ${r.kind === 'save' ? 'on' : ''}`}
                    onClick={() => commitPlan(r.id, planDraft[r.id] ?? r.planned, r.kind === 'save' ? 'spend' : 'save')}
                    title="Toggle spend / save"
                  >{r.kind}</button>
                </div>
                <div className="row gap6">
                  <span className={over ? 'over' : ''} style={{ fontSize: 13 }}>{rs(r.actual)}</span>
                  <span className="muted tiny">/</span>
                  <input
                    className="num"
                    inputMode="numeric"
                    placeholder="0"
                    aria-label={`${r.name} planned`}
                    value={planDraft[r.id] ?? ''}
                    onChange={(e) => setPlanDraft((d) => ({ ...d, [r.id]: e.target.value }))}
                    onBlur={() => commitPlan(r.id, planDraft[r.id], r.kind)}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                  />
                </div>
              </div>
              {(r.planned > 0 || r.actual > 0) && (
                <div className="track" style={{ marginTop: 6 }}>
                  <i style={{ width: `${pct}%`, '--i': i, background: over ? '#c0392b' : r.kind === 'save' ? 'var(--gr-t)' : '#111' }} />
                </div>
              )}
            </div>
          );
        }) : <p className="empty">No categories found.</p>}
        {(plannedSpend > 0 || plannedSave > 0) && (
          <div className="row small muted" style={{ marginTop: 10, justifyContent: 'space-between' }}>
            <span>Spend: <b>{rs(totalSpent)}</b> / {rs(plannedSpend)}</span>
            <span>Save: <b>{rs(totalSaved)}</b> / {rs(plannedSave)}</span>
          </div>
        )}
      </section>

      <section className="blk card">
        <div className="blk-h">
          <span>Where my money is</span>
          <span className="muted tiny">calculated vs real</span>
        </div>
        {balances.length ? balances.map((a) => {
          const calc = Number(a.calculated || 0);
          const hasReal = a.actual_balance != null && a.checked_on === t;
          const diff = hasReal ? Number(a.actual_balance) - calc : null;
          const matched = diff != null && Math.abs(diff) < 1;
          return (
            <div key={a.id} className="it" style={{ flexWrap: 'wrap' }}>
              <div style={{ minWidth: 120 }}>
                <div style={{ fontWeight: 500 }}>{a.name} <span className="muted tiny">{a.kind || ''}</span></div>
                <div className="muted tiny">
                  Calc {rs(calc)}{a.checked_on ? ` · checked ${dayLabel(a.checked_on)}` : ' · not checked'}
                </div>
              </div>
              <div className="row gap6" style={{ marginLeft: 'auto' }}>
                {hasReal && (matched
                  ? <span className="ok-chip">Match</span>
                  : <span className="over small">{diff > 0 ? '+' : ''}{rs(diff)}</span>)}
                <input
                  className="num"
                  style={{ width: 82 }}
                  inputMode="decimal"
                  placeholder="Real ₹"
                  aria-label={`${a.name} real balance`}
                  value={balDraft[a.id] ?? ''}
                  onChange={(e) => setBalDraft((d) => ({ ...d, [a.id]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') commitBalance(a.id); }}
                />
                <button className="pill sm" onClick={() => commitBalance(a.id)}>Save</button>
              </div>
            </div>
          );
        }) : <p className="empty">No accounts found.</p>}
      </section>

      <section className="blk card">
        <div className="blk-h"><span>Checks</span></div>
        {checks.map((c) => (
          <div key={c.label} className="it">
            <span>{c.label} <span className="muted small">· {c.detail}</span></span>
            <span className={c.ok ? 'ok-chip' : 'over small'}>{c.ok ? 'OK' : 'Check'}</span>
          </div>
        ))}
      </section>

      <section className="blk card">
        <div className="blk-h">
          <span>Day by day</span>
          <label className="muted small">Daily budget ₹<input className="num" inputMode="numeric" value={budget} onChange={(e) => setBudget(Number(e.target.value) || 0)} /></label>
        </div>
        {dayList.length ? dayList.map((d) => {
          const x = byDay[d];
          const extras = [x.income ? `+${rs(x.income)} in` : null, x.transfer ? `${rs(x.transfer)} xfer` : null].filter(Boolean).join(' · ');
          return (
            <button key={d} className="it rowbtn" onClick={() => onPick(d)}>
              <span>{dayLabel(d)}{extras && <span className="muted small"> · {extras}</span>}</span>
              <span className={x.spent > budget ? 'over' : ''}>{x.spent > 0 ? rs(x.spent) : '—'}</span>
            </button>
          );
        }) : <p className="empty">No entries in this cycle.</p>}
      </section>
    </>
  );
}
