import { today, monthStart, monthEnd, addDays } from '../lib/dates.js';
import { setRoutine } from '../lib/data.js';
import { Num, haptic } from '../lib/motion.js';

export default function Routine({ month, days, refs, onChanged }) {
  const t = today(), x = days[t] || { routine: [] };
  const last = t.slice(0, 7) === month ? t : monthEnd(month);
  let tot = 0, done = 0;
  for (let d = monthStart(month); d <= last; d = addDays(d, 1)) { tot += refs.routine.length; done += (days[d]?.routine || []).filter((r) => r.done).length; }
  async function toggle(task) { haptic(8); const ex = x.routine.find((r) => r.item === task); await setRoutine(t, task, !(ex && ex.done), ex); onChanged(); }
  return (
    <>
      <div className="stats">
        <div className="st"><div className="muted">Today</div><div className="n serif">{x.routine.filter((r) => r.done).length}/{refs.routine.length}</div><div className="muted tiny">tasks done</div></div>
        <div className="st"><div className="muted">This month</div><div className="n serif"><Num v={`${tot ? Math.round(done / tot * 100) : 0}%`} /></div><div className="muted tiny">{done} of {tot}</div></div>
      </div>
      <section className="blk card">
        <div className="blk-h"><span>Today's routine</span></div>
        {refs.routine.length ? refs.routine.map((r) => {
          const on = x.routine.some((c) => c.item === r.task && c.done);
          return <button key={r.id} className={`chk ${on ? 'on' : ''}`} onClick={() => toggle(r.task)}><span className="box">{on ? '✓' : ''}</span><span className="chk-t">{r.task}<span className="muted"> · {r.time ? r.time.slice(0, 5) : r.time_of_day}</span></span></button>;
        }) : <p className="empty">No routine plan yet.</p>}
      </section>
    </>
  );
}
