import Calendar from '../components/Calendar.jsx';
import { Num } from '../lib/motion.js';
import { monthLabel, today, rs, addDays } from '../lib/dates.js';
import { spentOf, mealsOf, kcalOf, routineDone } from '../lib/data.js';

/** Days in a row with a workout, counting back from today (or yesterday if today is not logged yet). */
function streak(days, test) {
  let d = today(), n = 0;
  if (!test(days[d])) d = addDays(d, -1);
  while (test(days[d]) && n < 400) { n++; d = addDays(d, -1); }
  return n;
}

export default function Home({ month, days, refs, selected, onPick, budget, shift, dir }) {
  const t = today(), x = days[t];
  const monthSpent = Object.values(days).reduce((s, d) => s + spentOf(d), 0);
  const gymStreak = streak(days, (d) => (d?.gym || []).length > 0);
  const stats = [
    ['Spent today', rs(spentOf(x)), `${rs(monthSpent)} this month`],
    ['Gym', (x?.gym || []).length ? 'Done' : '—', (x?.gym || []).length ? `${x.gym.length} exercise${x.gym.length > 1 ? 's' : ''}${gymStreak > 1 ? ` · ${gymStreak}-day streak` : ''}` : gymStreak ? `${gymStreak}-day streak` : 'not yet today'],
    ['Meals', `${mealsOf(x)}/4`, kcalOf(x) ? `${Math.round(kcalOf(x))} kcal` : 'nothing logged'],
    ['Routine', refs.routine.length ? `${routineDone(x)}/${refs.routine.length}` : '—', refs.routine.length ? `${Math.round(routineDone(x) / refs.routine.length * 100)}% done` : 'no plan'],
  ];
  return (
    <>
      <div className="stats">
        {stats.map(([l, v, s]) => <div key={l} className="st"><div className="muted">{l}</div><div className="n serif"><Num v={v} /></div><div className="muted tiny">{s}</div></div>)}
      </div>
      <div className="row month-h">
        <button className="pill" onClick={() => shift(-1)} aria-label="Previous month">‹</button>
        <b key={month} className="month-name">{monthLabel(month)}</b>
        <button className="pill" onClick={() => shift(1)} disabled={month >= t.slice(0, 7)} aria-label="Next month">›</button>
        <span className="muted" style={{ marginLeft: 'auto' }}>tap a day</span>
      </div>
      <Calendar month={month} days={days} selected={selected} onPick={onPick} budget={budget} dir={dir} />
      <div className="legend"><span className="g">● on track</span><span className="y">● over budget / missed</span><span className="l">● today</span><span className="n">● nothing logged</span></div>
    </>
  );
}
