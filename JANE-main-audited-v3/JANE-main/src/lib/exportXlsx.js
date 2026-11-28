import { istDay, istTime } from './dates.js';

/** Download the open salary cycle as an Excel file (3 sheets). xlsx is loaded only when you tap the button. */
export async function exportCycle({ data, refs, lines, bal }) {
  const XLSX = await import('xlsx');
  const cat = (id) => refs.cats.find((c) => c.id === id)?.name || '';
  const acct = (id) => refs.accts.find((a) => a.id === id)?.name || '';
  const log = data.rows.map((e) => ({ Date: istDay(e.spent_at), Time: istTime(e.spent_at), Type: e.entry_type || 'expense', Amount: Number(e.amount), Category: cat(e.category_id), Account: acct(e.account_id), 'To account': acct(e.to_account_id), Note: e.description || '' }));
  const plan = lines.map((l) => ({ Category: l.c.name, Kind: l.kind === 'save' ? 'Saving' : 'Spend', Planned: l.planned, Actual: l.actual, Left: l.planned - l.actual }));
  const acc = bal.map((a) => ({ Account: a.name, 'Calculated balance': Number(a.calculated), 'Typed balance': a.actual_balance == null ? '' : Number(a.actual_balance), 'Checked on': a.checked_on || '' }));
  const wb = XLSX.utils.book_new();
  [['Log', log], ['Plan vs Reality', plan], ['Accounts', acc]].forEach(([n, r]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(r), n));
  XLSX.writeFile(wb, `Jane-expenses-${data.start}.xlsx`);
}
