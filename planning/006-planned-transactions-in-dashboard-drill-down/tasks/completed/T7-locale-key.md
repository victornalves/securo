# T7 — The planned-portion locale key

| Field      | Value |
| ---------- | ----- |
| Task       | T7    |
| Feature    | 006   |
| Status     | Done  |
| Depends on | —     |
| PR         |       |
| Jira       | —     |

## Description

Add the one new user-facing string to every shipped locale.

## Implementation guidance

One key, in the `dashboard` namespace next to the existing `drillDownTotal`
(`frontend/src/locales/en.json:269`):

```
"drillDownPlannedNote": "Includes {{count}} planned · {{total}}"
```

All ten locale files must carry it: `en`, `pt-BR`, `es`, `de`, `fr`, `it`, `pl`, `ru`, `uk`.
`frontend/src/locales/i18n.test.ts` enforces both key parity and `{{placeholder}}` parity across
locales, so a missed file or a mistyped placeholder fails `npm run test` rather than shipping.

Translate rather than transliterate — match the register of the neighbouring `drillDownTotal` and
`includePlanned` strings already in each file. Reference for pt-BR: `transactions.plannedBadge` is
already translated there, so reuse its wording for "planned" so the badge and the footer line agree.

This is the only new string. Per plan ADR, the disclosure that planned amounts are counted lives in
this footer line and **not** in a header banner — the line states the exact fact where a banner would
state the general one.

## Files affected

- `frontend/src/locales/{en,pt-BR,es,de,fr,it,pl,ru,uk}.json`

## Done when

`npm run test` passes with `i18n.test.ts` green, and the key resolves in every locale.

## Notes

Polish needed the plural expansion after all: `pl.json` already writes `drillDownTotal` as `_one`/`_few`/`_many`/`_other`, so `drillDownPlannedNote` follows the same shape there and carries the noun (`transakcję`/`transakcje`/`transakcji`) because the adjective alone does not decline readably. Russian and Ukrainian keep a single form, matching how `drillDownTotal` is written in those files — the parity test accepts either.

`{{count}}` is i18next's plural trigger. If any target language needs a plural form, add the
`_plural` variants for that locale only — but check `i18n.test.ts`'s parity rule first, since it may
require the variants in every file.
