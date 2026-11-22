import { dayLabel, istTime, rs } from '../lib/dates.js';
import { spentOf, kcalOf, proteinOf, setRoutine, deleteRow } from '../lib/data.js';
import { useSheet, haptic } from '../lib/motion.js';

export default function DaySheet({ date, day, refs, onLog, onChanged, asPanel, onClose }) {
  const sh = useSheet(onClose || (() => {}));
  const d = day || { expenses: [], gym: [], diet: [], routine: [] };
  const cat = (id) => refs.cats.find((c) => c.id === id)?.name || '';
  const spent = spentOf(d);
  const meals = ['breakfast', 'lunch', 'snack', 'dinner'];
  async function toggle(task) {
    haptic(8);
    const ex = d.routine.find((r) => r.item === task);
    await setRoutine(date, task, !(ex && ex.done), ex); onChanged();
  }
  async function del(table, id) { if (window.confirm('Delete this entry?')) { await deleteRow(table, id); onChanged(); } }
  const body = (
    <>
      <div className="row"><h2 className="serif">{dayLabel(date)}</h2>{spent > 0 && <span className="pill on" style={{ marginLeft: 'auto' }}>{rs(spent)}</span>}{!asPanel && <button className="x" onClick={() => sh.close()} aria-label="Close">✕</button>}</div>

      <section className="blk">
        <div className="blk-h"><span>Expenses</span><span className="muted">{d.expenses.length ? `${d.expenses.length} entries` : ''}</span></div>
        {d.expenses.length ? d.expenses.map((e) => (
          <div key={e.id} className="it" onDoubleClick={() => del('expenses', e.id)}>
            <span>{e.description || cat(e.category_id)} <span className="muted">· {cat(e.category_id)} · {e.payment_mode} · {istTime(e.spent_at)}{e.entry_type === 'transfer' ? ' · transfer' : ''}</span></span><span>{rs(e.amount)}</span>
          </div>)) : <p className="empty">No expenses. <button className="link" onClick={() => onLog('expense')}>Log one</button></p>}
      </section>

      <section className="blk">
        <div className="blk-h"><span>Gym</span><span className="muted">{d.gym.length ? `${d.gym.length} exercise${d.gym.length > 1 ? 's' : ''}` : ''}</span></div>
        {d.gym.length ? d.gym.map((g) => (
          <div key={g.id} className="it" onDoubleClick={() => del('workout_logs', g.id)}>
            <span>{g.exercises?.name || 'Exercise'}</span>
            <span className="muted">{[g.sets_done && `${g.sets_done} ×`, g.reps_done, g.weight_kg && `· ${g.weight_kg} kg`].filter(Boolean).join(' ')}</span>
          </div>)) : <p className="empty">No workout. <button className="link" onClick={() => onLog('gym')}>Log gym</button></p>}
      </section>

      <section className="blk">
        <div className="blk-h"><span>Diet</span><span className="muted">{d.diet.length ? `${Math.round(kcalOf(d))} kcal · ${Math.round(proteinOf(d))} g protein` : ''}</span></div>
        {d.diet.length ? meals.filter((m) => d.diet.some((x) => x.meal === m)).map((m) => (
          <div key={m}>
            <div className="meal">{m}</div>
            {d.diet.filter((x) => x.meal === m).map((x) => (
              <div key={x.id} className="it" onDoubleClick={() => del('diet_logs', x.id)}>
                <span>{x.food_item}</span><span className="muted">{x.approx_calories ? `${x.approx_calories} kcal` : ''}{x.protein_g ? ` · P ${Math.round(x.protein_g)}g` : ''}</span>
              </div>))}
          </div>)) : <p className="empty">No meals. <button className="link" onClick={() => onLog('diet')}>Log a meal</button></p>}
      </section>

      {refs.routine.length > 0 && <section className="blk">
        <div className="blk-h"><span>Routine</span><span className="muted">{d.routine.filter((r) => r.done).length} of {refs.routine.length}</span></div>
        {refs.routine.map((r) => {
          const done = d.routine.some((x) => x.item === r.task && x.done);
          return (
            <button key={r.id} className={`chk ${done ? 'on' : ''}`} onClick={() => toggle(r.task)}>
              <span className="box">{done ? '✓' : ''}</span>
              <span className="chk-t">{r.task.split(':')[0]}<span className="muted"> · {r.time ? r.time.slice(0, 5) : r.time_of_day}</span></span>
            </button>
          );
        })}
      </section>}

      <div className="row gap6" style={{ marginTop: 14 }}>
        <button className="pill on big" onClick={() => onLog('diet')}>+ Add</button>
        <button className="pill big" onClick={() => onLog('expense')}>Voice log</button>
      </div>
      <p className="muted tiny">Double-tap an entry to delete it.</p>
    </>
  );
  if (asPanel) return <aside className="panel"><div key={date} className="swap">{body}</div></aside>;
  return <div className={`sheet-back ${sh.closing ? 'out' : ''}`} onClick={() => sh.close()}><div ref={sh.ref} className="sheet" onClick={(e) => e.stopPropagation()} {...sh.handlers}><div className="grab" /><div className="swap">{body}</div></div></div>;
}
