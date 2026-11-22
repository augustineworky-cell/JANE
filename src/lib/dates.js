// All dates are India time (IST), as plain 'YYYY-MM-DD' strings.
const pad = (n) => String(n).padStart(2, '0');
export const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => iso(new Date());
export const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
export const monthKey = (s) => s.slice(0, 7);
export const monthStart = (k) => `${k}-01`;
export const monthEnd = (k) => { const [y, m] = k.split('-').map(Number); return iso(new Date(y, m, 0)); };
export const shiftMonth = (k, n) => { const [y, m] = k.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return iso(d).slice(0, 7); };
export const monthLabel = (k) => parse(monthStart(k)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
export const dayLabel = (s) => parse(s).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
export const weekday = (s) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][parse(s).getDay()];
/** IST calendar day of a timestamptz value. */
export const istDay = (ts) => new Date(ts).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
export const istTime = (ts) => new Date(ts).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' });
export const rs = (n) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
