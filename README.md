# Jane

Your day in one look: **money, gym, diet and routine**. Installable PWA for phone and PC, in Staffly's look.

- **Phone** = logging. Hold the mic and talk ("lunch: 2 roti, dal, rice", "60 on chai, UPI", "bench 3 by 10 at 40"), snap a plate or a UPI screenshot, or tap a quick pick. A confirm card shows what will be saved; nothing is saved until you tap **Save ✓**.
- **PC** = viewing and fixing. Month calendar in the middle, the selected day in a panel on the right.
- Calendar tiles: **green** on track · **yellow** over daily budget or missed gym/meals · **lavender** today · **grey** nothing logged.

Data lives in the **Robin Expenses** Supabase project (`rfnisnqwwgkzyyrkwjip`): `expenses`, `diet_logs`, `workout_logs`, `exercises`, `workout_plan`, `routine_plan`, `routine_checks`.

## One-time setup

1. **Database access** (Supabase → SQL Editor): run `supabase/migrations/001_jane_access.sql`.
   It lets only `augustine.worky@gmail.com` (signed in) read and write these tables, and adds carbs/fat columns to `diet_logs`.
2. **Login**: Supabase → Authentication → Users → *Add user* → `augustine.worky@gmail.com` + a password (tick *Auto confirm*).
3. **AI (Gemini, free tier)**: get a key at <https://aistudio.google.com> → *Get API key*.
   Supabase → Edge Functions → Secrets: add `GEMINI_API_KEY` and `OWNER_EMAIL=augustine.worky@gmail.com`
   (optional `GEMINI_MODEL`, default `gemini-2.5-flash`). Then deploy `supabase/functions/jane-ai`.
   The key stays on the server; it is never in the app.
4. **Deploy the app**: import this repo on Vercel (framework: Vite). `.env.production` already has the project URL and the public (publishable) key.
5. **Install**: open the site → Chrome menu → *Install app* (phone and PC). iPhone: Safari → Share → *Add to Home Screen*.

## Run locally

```
npm install
cp .env.example .env.local   # fill VITE_SUPABASE_KEY
npm run dev
```

## How voice works

Hold the mic → the browser records (MediaRecorder) → Jane converts the clip to 16 kHz WAV → sends it to the `jane-ai` Edge Function → Gemini returns JSON rows → confirm card → **Save ✓** writes to Supabase. Free-tier limits apply; when the AI is busy, use quick picks or type.
