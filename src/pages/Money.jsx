import { monthLabel, rs, dayLabel, istDay } from '../lib/dates.js';
import { spentOf } from '../lib/data.js';

export default function Money({ month, days, refs, budget, setBudget, onPick }) {
  const all = Object.values(days).flatMap((d) => d.expenses).filter((e) => e.entry_type !== 'transfer');
  const total = all.reduce((s, e) => s + Number(e.amount), 0);
  const byCat = refs.cats.map((c) => ({ name: c.name, v: all.filter((e) => e.category_id === c.id).reduce((s, e) => s + Number(e.amount), 0) })).filter((c) => c.v).sort((a, b) => b.v - a.v);
  const byMode = ['UPI', 'Cash'].map((m) => ({ m, v: all.filter((e) => e.payment_mode === m).reduce((s, e) => s + Number(e.amount), 0) }));
  const dayList = Object.keys(days).filter((d) => spentOf(days[d])).sort().reverse();
  const n = Object.keys(days).length ? new Set(all.map((e) => istDay(e.spent_at))).size : 0;
  return (
    <>
      <div className="stats">
        <div className="st"><div className="muted">Spent · {monthLabel(month)}</div><div className="n serif">{rs(total)}</div><div className="muted tiny">{all.length} entries</div></div>
        <div className="st"><div className="muted">Per spending day</div><div className="n serif">{rs(n ? total / n : 0)}</div><div className="muted tiny">{n} days</div></div>
        {byMode.map((x) => <div key={x.m} className="st"><div className="muted">{x.m}</div><div className="n serif">{rs(x.v)}</div><div className="muted tiny">{total ? Math.round(x.v / total * 100) : 0}%</div></div>)}
      </div>
      <section className="blk card">
        <div className="blk-h"><span>By category</span></div>
        {byCat.length ? byCat.map((c) => (
          <div key={c.name} className="barrow"><span>{c.name}</span><div className="track"><i style={{ width: (c.v / byCat[0].v * 100) + '%' }} /></div><b>{rs(c.v)}</b></div>
        )) : <p className="empty">No expenses this month.</p>}
      </section>
      <section className="blk card">
        <div className="blk-h"><span>Day by day</span><label className="muted small">Daily budget ₹<input className="num" inputMode="numeric" value={budget} onChange={(e) => setBudget(Number(e.target.value) || 0)} /></label></div>
        {dayList.map((d) => { const v = spentOf(days[d]); return (
          <button key={d} className="it rowbtn" onClick={() => onPick(d)}><span>{dayLabel(d)}</span><span className={v > budget ? 'over' : ''}>{rs(v)}</span></button>
        ); })}
      </section>
    </>
  );
}
