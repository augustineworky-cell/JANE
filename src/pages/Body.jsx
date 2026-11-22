import { monthLabel, dayLabel } from '../lib/dates.js';
import { kcalOf, proteinOf } from '../lib/data.js';

export default function Body({ month, days, onPick }) {
  const keys = Object.keys(days).sort();
  const dietDays = keys.filter((d) => days[d].diet.length);
  const gymDays = keys.filter((d) => days[d].gym.length);
  const avg = (f) => (dietDays.length ? dietDays.reduce((s, d) => s + f(days[d]), 0) / dietDays.length : 0);
  const maxK = Math.max(1, ...dietDays.map((d) => kcalOf(days[d])));
  return (
    <>
      <div className="stats">
        <div className="st"><div className="muted">Gym days · {monthLabel(month)}</div><div className="n serif">{gymDays.length}</div><div className="muted tiny">sessions logged</div></div>
        <div className="st"><div className="muted">Avg kcal</div><div className="n serif">{Math.round(avg(kcalOf))}</div><div className="muted tiny">on {dietDays.length} logged days</div></div>
        <div className="st"><div className="muted">Avg protein</div><div className="n serif">{Math.round(avg(proteinOf))}g</div><div className="muted tiny">per logged day</div></div>
      </div>
      <section className="blk card">
        <div className="blk-h"><span>Calories by day</span></div>
        {dietDays.length ? <div className="kbars">{dietDays.map((d) => (
          <button key={d} className="kb" onClick={() => onPick(d)} title={`${dayLabel(d)} · ${Math.round(kcalOf(days[d]))} kcal`}><i style={{ height: (kcalOf(days[d]) / maxK * 100) + '%' }} /><span>{Number(d.slice(8))}</span></button>
        ))}</div> : <p className="empty">No meals logged this month.</p>}
      </section>
      <section className="blk card">
        <div className="blk-h"><span>Workouts</span></div>
        {gymDays.length ? gymDays.slice().reverse().map((d) => (
          <button key={d} className="it rowbtn" onClick={() => onPick(d)}><span>{dayLabel(d)}</span><span className="muted">{days[d].gym.map((g) => g.exercises?.name).filter(Boolean).join(', ')}</span></button>
        )) : <p className="empty">No workouts logged this month.</p>}
      </section>
    </>
  );
}
