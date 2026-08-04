# KaamWalla Translation Agent Spec

## Goal
Complete the `<LANG>` (language code `<CODE>`) translation file so every key has a
natural, professional, context-aware translation in `<LANG>` — matching the style of
the already-translated entries in the same file.

## Context
- File: `src/translations/<CODE>.ts`
- Working directory: `d:\Adi Works\Android\KaamWalla\mobile`
- This file maps English keys → `<LANG>` values. **Keys must NEVER change.**
- The app is a professional Indian services marketplace (customer ⇄ worker bookings,
  wallet, payments, support, verification, subscriptions). Tone: professional, polite,
  clear, warm but not slangy.

## Your file's current state
The file has these kinds of entries:
1. `'Key': 'translated value',` — already translated. Match their terminology.
2. `'Key': 'Key', // TODO: translate` — the value is a PLACEHOLDER equal to the key.
   You MUST replace these with a real `<LANG>` translation.
3. `'Key': 'Key',` — for the Marathi file ONLY: these are pre-existing untranslated
   entries. Translate them too (remove the identity value).

## Rules
- **Translate the value only. Never touch the key.**
- Keep brand names unchanged: KaamWala, KaamWalla, Google Pay, PhonePe, Paytm, BHIM,
  UPI, IFSC, CVV, OTP, SMS, QR, SOS. Currency `₹`/`Rs.` stays as-is.
- Keep numbers, punctuation, `%`, `/month`, `₹199`, etc. exactly as in the key.
- Preserve any `\n` line breaks in values.
- Use the SAME terminology as existing translated entries in your file whenever the
  same concept already appears (e.g. if 'Bookings' is already 'X', translate
  'My Bookings' using the same word X). This is the most important consistency rule.
- Do NOT use Google-Translate-literal phrasing if it sounds unnatural. Prefer natural
  phrasing used in real Indian app UIs in this language.
- Escape any `'` inside key OR value as `\'`. Single-quote wrap everything.
- Keep the trailing comma after every entry.
- Do NOT delete, reorder, or reword existing keys/values.
- Do NOT touch any other file.
- Keep the exact `export default <CODE>;` ending intact.

## Verification (run after editing)
1. `node scripts/untranslated.js` — for your file, every entry should now be
   translated (identity values = 0, except brand-name keys which may legitimately stay).
2. `node scripts/parity.js` — confirm all files still have identical key sets.
3. If you removed a `// TODO: translate` marker, ensure the value is no longer the
   same as the key (unless it's a brand name).

## Deliverable
Edit the file in place. Give a 2-3 sentence summary of what you translated and any
keys you deliberately left as English (brand names) and why.
