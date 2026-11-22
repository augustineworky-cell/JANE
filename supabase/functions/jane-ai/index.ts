// jane-ai: turns a voice note, a photo or typed text into rows Jane can save.
// Uses Google Gemini. Secrets (Supabase dashboard -> Edge Functions -> Secrets):
//   GEMINI_API_KEY  (from aistudio.google.com; or save it in the app: Settings -> AI key)   GEMINI_MODEL (optional, default gemini-3.8-flash)
//   OWNER_EMAIL     (only this login may use it)
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const RULES: Record<string, string> = {
  diet: `This is a FOOD log from an Indian user (speech may be Hindi, English or Hinglish).
Return JSON: {"meal":"breakfast|lunch|snack|dinner","items":[{"name":string,"qty":string,"kcal":number,"protein_g":number,"carbs_g":number,"fat_g":number}],"question":string|null}
- One item per food. qty in plain words ("2 roti", "1 katori", "250 ml").
- Use typical Indian home portions when no amount is said. Numbers are estimates, rounded.
- meal: use what the user said; otherwise use context.meal_guess.
- For a photo: list each visible food with a sensible portion.`,
  gym: `This is a GYM log (speech may be Hindi, English or Hinglish).
Return JSON: {"items":[{"exercise":string,"sets":number|null,"reps":string|null,"weight_kg":number|null,"notes":string|null}],"question":string|null}
- Standard English exercise names in Title Case ("Bench Press", "Lat Pulldown").
- "3 by 10 at 40" = sets 3, reps "10", weight_kg 40. Cardio: put minutes / km in notes.`,
  expense: `This is an EXPENSE log in Indian rupees (speech may be Hindi, English or Hinglish), or a payment screenshot (UPI app).
Return JSON: {"items":[{"amount":number,"description":string,"category":string,"payment_mode":"UPI|Cash","account":string|null}],"question":string|null}
- category must be one of context.categories (pick the closest; use Miscellaneous if unsure).
- payment_mode: Cash only if the user says cash; otherwise UPI.
- account: one of context.accounts only if the user or screenshot names the bank; otherwise null.
- Never include account numbers, UPI IDs or reference numbers in description.`,
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return json({ error: 'Please sign in again.' }, 401);
    const owner = (Deno.env.get('OWNER_EMAIL') || '').toLowerCase();
    if (owner && (user.email || '').toLowerCase() !== owner) return json({ error: 'Not allowed.' }, 403);

    let key = Deno.env.get('GEMINI_API_KEY');
    if (!key) {   // saved from the app: Settings -> AI key (stored server-side, never sent back to the app)
      const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      const { data } = await admin.rpc('jane_get_ai_key');
      key = data || '';
    }
    if (!key) return json({ error: 'AI is not set up yet: open ⚙ Settings in Jane and paste your Gemini API key.' }, 500);
    const model = Deno.env.get('GEMINI_MODEL') || 'gemini-3.8-flash';

    const { kind, text, audio, image, context } = await req.json();
    if (!RULES[kind]) return json({ error: 'Unknown log type.' }, 400);
    const parts: unknown[] = [{ text: `${RULES[kind]}
If the input is unclear, return "items": [] and ask ONE short "question".
If context.previous is set, the user is correcting or adding to it: return the FULL updated list.
Context: ${JSON.stringify(context ?? {})}` }];
    if (text) parts.push({ text: `User said: ${String(text).slice(0, 2000)}` });
    if (audio?.data) parts.push({ inline_data: { mime_type: audio.mime || 'audio/wav', data: audio.data } });
    if (image?.data) parts.push({ inline_data: { mime_type: image.mime || 'image/jpeg', data: image.data } });
    if (parts.length === 1) return json({ error: 'Nothing to read.' }, 400);

    const body = JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json', temperature: 0.2 } });
    const call = (m: string) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body });
    let r = await call(model);
    let g = await r.json();
    // Google retires models; when it names the replacement ("use models/xyz"), switch to it automatically.
    const next = !r.ok && String(g?.error?.message || '').match(/use (?:models\/)?(gemini-[\w.-]+)/i);
    if (next && next[1].replace(/\.+$/, "") !== model) { r = await call(next[1].replace(/\.+$/, "")); g = await r.json(); }
    if (r.status === 429) return json({ error: 'AI is busy (free limit reached). Try again in a minute, or use a quick pick.' }, 429);
    if (!r.ok) { const m = g?.error?.message || 'AI request failed.'; return json({ error: /api key/i.test(m) ? 'Gemini says the API key is not valid. Open ⚙ Settings and paste a key from aistudio.google.com (starts with AIza).' : m }, 502); }
    const out = g?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || '').join('') || '{}';
    let parsed;
    try { parsed = JSON.parse(out); } catch { return json({ error: 'AI reply was not readable. Try again.' }, 502); }
    if (!Array.isArray(parsed.items)) parsed.items = [];
    return json(parsed);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
