# T11 — Locale keys

| Field      | Value  |
| ---------- | ------ |
| Task       | T11    |
| Feature    | 004    |
| Status     | Todo   |
| Depends on | T8, T9 |
| PR         |        |
| Jira       | —      |

## Description

Add every new user-facing string to all nine locale files.

## Implementation guidance

New keys under `reports` in `frontend/src/locales/*.json` — `en`, `pt-BR`, `es`, `fr`, `it`,
`de`, `pl`, `ru`, `uk`:

| Key | English |
| --- | ------- |
| `reports.planned` | Planned |
| `reports.committed` | Committed |
| `reports.committedShare` | `{{percent}}% committed` |
| `reports.plannedLegend` | Planned (chart legend, if it needs to differ from `planned`) |

Reuse `dashboard.includePlanned` wording as the reference for "planned" in each language so the
tab and the toggle agree — the translations already exist there
(`frontend/src/locales/*.json`, key `dashboard.includePlanned`).

Interpolation: use a named variable (`percent`), never `count` — i18next treats `count` as a
plural selector and would look for suffixed keys, the trap already documented on
`reports.budgetCoverage`.

Drop any key that T8/T9 ended up not using.

## Files affected

- `frontend/src/locales/*.json` (9 files)

## Done when

Satisfies *"Every new user-facing string exists in all nine locale files"* and `i18n.test.ts`
key-parity stays green.
