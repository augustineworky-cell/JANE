import { monthStart, monthEnd, addDays, parse, today, rs } from '../lib/dates.js';
import { spentOf, mealsOf } from '../lib/data.js';

/** Staffly-style month: one pastel tile per day with that day's summary written on it. */
export default function Calendar({ month, days, selected, onPick, budget, dir = 0 }) {
  const first = monthStart(month), last = monthEnd(month), t = today();
  const lead = (parse(first).getDay() + 6) % 7;                 // weeks start Monday
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = first; d <= last; d = addDays(d, 1)) cells.push(d);
  return (
    <div key={month} className={`cal ${dir > 0 ? 'from-r' : dir < 0 ? 'from-l' : ''}`}>
      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((w) => <div key={w} className="cal-h">{w}</div>)}
      {cells.map((d, i) => {
        if (!d) return <div key={'e' + i} />;
        const x = days[d], spent = spentOf(x), meals = mealsOf(x), gym = (x?.gym || []).length;
        const any = spent || meals || gym || (x?.routine || []).length;
        const tone = d === t ? 'la' : d > t ? 'fut' : !any ? 'no' : (spent > budget || (!gym && meals < 2)) ? 'ye' : 'gr';
        return (
          <button key={d} className={`day ${tone} ${d === selected ? 'sel' : ''}`} onClick={() => onPick(d)} disabled={d > t} style={{ '--i': i }}>
            <b>{parse(d).getDate()}</b>
            {d <= t && (any ? <>
              {spent > 0 && <span>{rs(spent)}</span>}
              <span>{[gym ? 'gym' : null, meals ? `${meals} meal${meals > 1 ? 's' : ''}` : null].filter(Boolean).join(' · ') || ' '}</span>
            </> : <span className="dim">nothing logged</span>)}
          </button>
        );
      })}
    </div>
  );
}
