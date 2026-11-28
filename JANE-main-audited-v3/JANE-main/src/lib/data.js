import { supabase } from '../supabase.js';
import { istDay, monthStart, monthEnd, addDays, cycleEnd, today } from './dates.js';

const must = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

export async function loadRefs() {
  const [cats, accts, routine, plan] = await Promise.all([
    supabase.from('categories').select('id,name').order('id'),
    supabase.from('accounts').select('id,name,kind').order('id'),
    supabase.from('routine_plan').select('id,time_of_day,time,task,active').eq('active', true).order('time'),
    supabase.from('workout_plan').select('id,weekday,session_name,sets,reps_target,exercise_id,exercises(name)').eq('active', true),
  ]);
  return { cats: must(cats), accts: must(accts), routine: must(routine), plan: must(plan) };
}

/** Everything logged in a month, grouped by IST day. */
export async function loadMonth(key) {
  const from = monthStart(key), to = monthEnd(key);
  const [ex, wo, di, rc] = await Promise.all([
    supabase.from('expenses').select('id,amount,spent_at,description,payment_mode,category_id,account_id,to_account_id,entry_type')
      .gte('spent_at', from + 'T00:00:00+05:30').lt('spent_at', addDays(to, 1) + 'T00:00:00+05:30').order('spent_at'),
    supabase.from('workout_logs').select('id,date,sets_done,reps_done,weight_kg,notes,exercise_id,exercises(name)').gte('date', from).lte('date', to),
    supabase.from('diet_logs').select('*').gte('date', from).lte('date', to).order('created_at'),
    supabase.from('routine_checks').select('id,date,item,done').gte('date', from).lte('date', to),
  ]);
  const days = {};
  const day = (d) => (days[d] = days[d] || { expenses: [], gym: [], diet: [], routine: [] });
  for (const e of must(ex)) day(istDay(e.spent_at)).expenses.push(e);
  for (const w of must(wo)) day(w.date).gym.push(w);
  for (const m of must(di)) day(m.date).diet.push(m);
  for (const r of must(rc)) day(r.date).routine.push(r);
  return days;
}

/** Load one salary cycle: expenses, budget plan, and current account balances. */
export async function loadCycle(cycleStart) {
  const from = cycleStart, to = cycleEnd(cycleStart);
  const [ex, pl, bal] = await Promise.all([
    supabase.from('expenses').select('id,amount,spent_at,description,payment_mode,category_id,account_id,to_account_id,entry_type')
      .gte('spent_at', from + 'T00:00:00+05:30').lt('spent_at', addDays(to, 1) + 'T00:00:00+05:30').order('spent_at'),
    supabase.from('budget_plan').select('cycle_start,category_id,planned,kind').eq('cycle_start', cycleStart),
    supabase.from('account_balance_v').select('id,name,kind,calculated,actual_balance,checked_on').order('id'),
  ]);
  return { start: from, end: to, expenses: must(ex), plan: must(pl), balances: must(bal) };
}

export async function savePlan(cycleStart, categoryId, planned, kind = 'spend') {
  const row = {
    cycle_start: cycleStart,
    category_id: Number(categoryId),
    planned: Math.max(0, Number(planned) || 0),
    kind: kind === 'save' ? 'save' : 'spend',
  };
  return must(await supabase.from('budget_plan').upsert(row, { onConflict: 'cycle_start,category_id' }).select());
}

export async function copyPlan(fromCycle, toCycle) {
  const prev = must(await supabase.from('budget_plan').select('category_id,planned,kind').eq('cycle_start', fromCycle));
  if (!prev.length) throw new Error('The previous cycle has no plan to copy.');
  const rows = prev.map((r) => ({ cycle_start: toCycle, category_id: r.category_id, planned: r.planned, kind: r.kind }));
  // ignoreDuplicates: never overwrite amounts already set in the target cycle
  return must(await supabase.from('budget_plan').upsert(rows, { onConflict: 'cycle_start,category_id', ignoreDuplicates: true }).select());
}

export async function saveActualBalance(accountId, actualBalance) {
  const v = Number(actualBalance);
  if (!Number.isFinite(v)) throw new Error('Type the balance as a number.');
  return must(await supabase.from('account_checks').insert({ account_id: Number(accountId), checked_on: today(), actual_balance: v }).select());
}

export const spentOf = (d) => (d?.expenses || []).filter((e) => !e.entry_type || e.entry_type === 'expense').reduce((s, e) => s + Number(e.amount), 0);
export const mealsOf = (d) => new Set((d?.diet || []).map((m) => m.meal)).size;
export const kcalOf = (d) => (d?.diet || []).reduce((s, m) => s + (Number(m.approx_calories) || 0), 0);
export const proteinOf = (d) => (d?.diet || []).reduce((s, m) => s + (Number(m.protein_g) || 0), 0);
export const routineDone = (d) => (d?.routine || []).filter((r) => r.done).length;

/* ---------- saving ---------- */
const resolveAccount = (accts, idVal, nameVal, paymentMode) => {
  if (idVal !== undefined && idVal !== null && idVal !== '') {
    const byId = accts.find((a) => String(a.id) === String(idVal));
    if (byId) return byId;
  }
  if (nameVal) {
    const byName = accts.find((a) => a.name.toLowerCase() === String(nameVal).toLowerCase());
    if (byName) return byName;
  }
  if (/cash/i.test(paymentMode || '')) return accts.find((a) => a.kind === 'cash') || null;
  return null;
};

export async function saveExpenses(items, refs, date) {
  const validTypes = ['expense', 'income', 'transfer'];
  let last = null; try { last = localStorage.getItem('jane-upi-acct'); } catch { /* ignore */ }
  const defBank = refs.accts.find((a) => a.name === last && a.kind !== 'cash') || refs.accts.find((a) => a.kind !== 'cash') || null;
  const rows = items.map((it) => {
    const entryType = validTypes.includes(it.entry_type) ? it.entry_type : 'expense';
    const acct = resolveAccount(refs.accts, it.account_id, it.account, it.payment_mode) || (/cash/i.test(it.payment_mode || '') ? null : defBank);
    const toAcct = entryType === 'transfer' ? resolveAccount(refs.accts, it.to_account_id, it.to_account, '') : null;
    const cat = (it.category_id && refs.cats.find((c) => String(c.id) === String(it.category_id)))
      || refs.cats.find((c) => c.name.toLowerCase() === String(it.category || '').toLowerCase())
      || refs.cats.find((c) => /misc/i.test(c.name))
      || refs.cats[0];
    const mode = acct?.kind === 'cash' || /cash/i.test(it.payment_mode || '') ? 'Cash' : 'UPI';
    return {
      amount: Number(it.amount),
      description: it.description || null,
      payment_mode: mode,
      category_id: cat?.id ?? null,
      account_id: acct?.id ?? null,
      to_account_id: entryType === 'transfer' ? (toAcct?.id ?? null) : null,
      spent_at: date ? `${date}T${new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata' })}+05:30` : undefined,
      entry_type: entryType,
    };
  }).filter((r) => r.amount > 0);
  const out = must(await supabase.from('expenses').insert(rows).select());
  const bank = rows.map((r) => refs.accts.find((a) => a.id === r.account_id)).find((a) => a && a.kind !== 'cash');
  try { if (bank) localStorage.setItem('jane-upi-acct', bank.name); } catch { /* ignore */ }
  return out;
}

export async function saveDiet(meal, items, date) {
  const rows = items.map((it) => ({
    date, meal: ['breakfast', 'lunch', 'dinner', 'snack'].includes(meal) ? meal : 'snack',
    food_item: [it.name, it.qty].filter(Boolean).join(' · '),
    approx_calories: it.kcal != null ? Math.round(it.kcal) : null,
    protein_g: it.protein_g ?? null, carbs_g: it.carbs_g ?? null, fat_g: it.fat_g ?? null,
  }));
  return must(await supabase.from('diet_logs').insert(rows).select());
}

async function exerciseId(name) {
  const n = String(name).trim();
  const found = must(await supabase.from('exercises').select('id,name').ilike('name', n).limit(1));
  if (found.length) return found[0].id;
  return must(await supabase.from('exercises').insert({ name: n }).select('id'))[0].id;
}
export async function saveGym(items, date) {
  const rows = [];
  for (const it of items) rows.push({ date, exercise_id: await exerciseId(it.exercise), sets_done: it.sets ?? null, reps_done: it.reps != null ? String(it.reps) : null, weight_kg: it.weight_kg ?? null, notes: it.notes || null });
  return must(await supabase.from('workout_logs').insert(rows).select());
}

export async function setRoutine(date, item, done, existing) {
  if (existing) return must(await supabase.from('routine_checks').update({ done }).eq('id', existing.id).select());
  return must(await supabase.from('routine_checks').insert({ date, item, done }).select());
}

export async function deleteRow(table, id) { must(await supabase.from(table).delete().eq('id', id)); }
