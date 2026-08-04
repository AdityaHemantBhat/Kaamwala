# KaamWalla i18n Refactor Spec

## Goal
Every user-facing English string in every `.tsx` screen/component must be wrapped in
`t('...')` where the key IS the exact English string. English is the fallback language
(key === English text), so `t('Home')` renders "Home" in English.

## Conventions

### Import
Add (if not present):
```ts
import { useT } from '<rel>/utils/i18n';
```
Relative path by location:
- `src/app/(customer)/foo.tsx` → `../../utils/i18n`
- `src/app/(admin)/foo.tsx` → `../../utils/i18n`
- `src/app/(worker)/foo/[id].tsx` → `../../../utils/i18n`
- `src/app/_layout.tsx`, `src/app/index.tsx` → `../utils/i18n`
- `src/components/ui/Foo.tsx` → `../../../utils/i18n`

### Hook
Inside each React component, as the FIRST statement (before early returns):
```ts
const t = useT();
```

### Non-component code
If a string lives in a module-level function (outside any component) that renders
user-facing text, import `t` directly:
```ts
import { t } from '<rel>/utils/i18n';
```

## What to wrap
Wrap EVERY user-facing string with `t('...')`:
- JSX text: `<Text>Hello</Text>` → `<Text>{t('Hello')}</Text>`
- Text props: `placeholder="..."`, `title`, `label`, `message`, `helperText`, `hint`, `emptyText`, `loadingText`, `errorText`, `header`, `description`, `screenTitle`, `submitLabel`, `cancelLabel`, `confirmLabel`, `toastMessage`, `prefix`
- `Alert.alert('Title', 'Message', [{ text: 'OK' }])` → wrap all three
- `showToast('...')`, `setError('...')`, validation messages
- Button labels, chip/pill labels, section headers, empty states, loading text
- Strings in display arrays: `const TABS = ['Active', 'Upcoming']` → when RENDERED wrap the render; or wrap at array creation if the array is only used for display
- Status/category display: when an enum like `status` (`'ACTIVE'`) is DISPLAYED, use `t(status)`. When a category code like `'AC_TECHNICIAN'` is displayed as `cat.replace(/_/g,' ')`, wrap the whole display expression: `t(cat.replace(/_/g, ' '))`. **The raw value sent to the backend must stay unwrapped** (form state, API payloads).

## What NOT to wrap
- Backend enum values / API payload strings (state values, `setStatus('ACTIVE')`, request bodies)
- Brand names (KaamWala, KaamWalla, Google Pay, PhonePe, Paytm, BHIM, UPI, SMS, OTP, QR, IFSC, CVV) — leave as-is; translation files keep them unchanged
- Emails, phone numbers, currency amounts, URLs, date format strings
- `key={...}`, `testID`, `accessibilityLabel` (unless it reads text to a screen reader — then wrap)
- `style`, class-like props, icon names (`name="arrow-left"`), image URIs
- `console.log`, debug-only strings, error objects used only for logging
- Empty strings, punctuation-only, `''`, whitespace
- Strings with only digits/units like `'0000'`, `'9999999999'`, `'e.g. 500'`? — NO: `e.g. ...` placeholders ARE user-facing, wrap them. Pure numeric strings that are keyboard examples are user-facing placeholders — wrap them too ONLY if clearly shown to the user.
- Array `.map` keys, route strings (`'/(customer)/bookings'`), API paths

## Dynamic strings
- Keep static parts in t(): `` `${t('Total')}: ₹${amount}` ``
- When the existing code does `'Rs.' + price`, translate the static prefix: `t('Rs.') + price` — but if 'Rs.' is a pure currency symbol, leave it unwrapped. Only wrap when it is a word.

## Escaping
- Wrap keys AND values in single quotes.
- Escape any `'` inside a key as `\'`. Example: `t('I Didn\'t Request This')`.
- Keep the key EXACTLY as the current English text (including punctuation, case, trailing colons/spaces trimmed).

## Hard constraints
- Do NOT change business logic, backend payloads, API calls, navigation, or component structure.
- Do NOT edit anything under `src/translations/` or `src/utils/i18n.ts`.
- Do NOT reword or reformat existing text.
- Preserve JSX formatting exactly (just wrap text).

## Deliverable
After editing your assigned files, write a JSON report to the path given in your task
listing every new `t('...')` key you introduced that was NOT already present in the
existing translation keys. Use this exact shape:

```json
{ "newKeys": ["Key one", "Key two", "..."] }
```

Use the script `node scripts/keygap.js` after editing to list keys missing from
translations — your new keys are a subset of that output. Write the JSON with the
Write tool.
