# T13 — Manual QA and locale parity sweep

| Field      | Value                                          |
| ---------- | ---------------------------------------------- |
| Task       | T13                                            |
| Feature    | 008                                            |
| Status     | In Progress                                    |
| Depends on | T1, T2, T3, T4, T5, T6, T7, T8, T9, T10, T11, T12 |
| PR         |                                                |
| Jira       |                                                |

## Description

Close the feature by walking the acceptance criteria that no unit test in this repo can reach,
and confirm locale parity across all nine files.

## Implementation guidance

From `plan.md` → *Test Strategy* → "Manual QA". The repo has **no component tests** and this
plan deliberately did not introduce a component-testing stack (see *Out of Scope*), so this
task is where the interaction criteria are actually verified.

**Locale parity.** Keys should already have been added by the task that introduced each string
— this is a sweep, not the place keys first appear. Run `locales/i18n.test.ts` and confirm all
four of its assertions pass: no duplicate keys at any nesting level, every `en.json` key present
in every locale, **no key present in a locale that is absent from `en.json`**, and identical
`{{placeholder}}` sets per key across locales. Polish expands some keys into i18next plural
forms (`_one`, `_few`, `_many`, …) which the test accepts in place of the base key — do not
"fix" an apparent mismatch there.

**The walkthrough:**

1. Open a holding from each wallet; confirm the inline expansion is gone and row actions (move,
   edit, delete) still do not open the drawer.
2. Dismiss via Escape, click-outside, and the close button. Confirm the opening click does not
   immediately close it.
3. Reload on `?asset=<id>`; press back; confirm back returns to the plain holdings view and not
   off `/assets`. Switch between several assets, then confirm back does not walk through each one.
4. Hand-edit the URL to a nonexistent id, an archived asset, and an asset outside the active
   collection → plain holdings view, no error, no empty drawer.
5. Record a buy and a sell from the drawer; confirm the summary, comparison, chart, list, the
   row behind the drawer, the wallet total, and the portfolio chart all update with no manual
   refresh.
6. Sell the entire position; confirm the drawer's close-and-explain behavior and that the
   holding moves out of the active list.
7. Open a holding with zero units → sale action unavailable with a stated reason. Enter an
   oversell quantity → existing warning still appears.
8. Open a provider-owned synced asset → no write affordances. Repeat as a read-only member.
9. Open a `manual` asset and a `growth_rule` asset → valuation body, no trade actions, negative
   amount rejected with the disposal message, `growth_rule` still read-only.
10. Toggle privacy mode with the drawer open → every figure masked.
11. Both themes, and a narrow viewport.
12. Filter the global tab by asset and by direction, compose them, clear each individually,
    filter to nothing and read the empty state, then click a row through to its drawer.

Also confirm the running-position column's top row equals the `units` figure in the position
summary a few lines above it — the one place T2's replay is checkable against reality.

## Files affected

- none expected; any fix found here lands in the file that owns the behavior

## Done when

Every step above passes, `locales/i18n.test.ts` passes, `lib/asset-detail-utils.test.ts`
passes, and lint plus the TypeScript build are green. Anything found that cannot be fixed within
the spec's scope is logged as an Open Question in `spec.md` or as a new backlog item in
`planning/README.md`.

## Notes

Steps 6 and 4 are the two most likely to fail: closing a position mid-drawer is the plan's
highest-likelihood risk, and the cold-load URL path is the one a naive implementation appears
to pass.

## Progress — automated parts done, interactive walkthrough NOT done

**Done and green:**

- `locales/i18n.test.ts` passes: no duplicate keys, full `en.json` coverage in all nine files,
  no extra keys, and identical `{{placeholder}}` sets per key. Key counts are 1623 everywhere
  except Polish at 1716, which is its i18next plural expansion (`_one` / `_few` / `_many`) —
  the form the test explicitly accepts in place of a base key.
- `lib/asset-detail-utils.test.ts`: 26 tests. Whole suite 109/109 across 6 files.
- `tsc -b` clean; full `npm run build` (tsc + vite) green.
- `eslint .` — 0 errors, 41 warnings, all of which predate this branch. The two in files this
  branch touched (`set-state-in-effect` in the trade dialog, `exhaustive-deps` on
  `activeAssets`) were confirmed present in the pre-extraction baseline.
- **Locale key audit** (written for this task, run against the pre-branch commit for
  comparison): every `t('…')` literal in the source resolves in `en.json`, and **this branch
  orphaned no key**. The audit accounts for the four dynamic `t()` call sites by enumerating
  their bounded input sets (`ASSET_TYPES`, `AssetValue.source`, `GROWTH_TYPES`,
  `GROWTH_FREQUENCIES`) rather than treating `assets.*` as wholesale-reachable — which is what
  confirms T10's removal of `addValue` / `valueHistory` / `amount` was safe. Eight `assets.*`
  keys remain orphaned; all eight were already unused before this branch, and clearing them is
  unrelated cleanup left out of scope.

**Not done: the 12-step interactive walkthrough.** It needs the app running against real data
— the Securo stack (postgres + backend) is not up in this environment, and starting it via
docker-compose would write to the developer's own database. A `playwright` shim exists on PATH
but the repo has no browser-test harness to drive it, and adding one is out of scope per
`plan.md`.

So the criteria that only a human at a running app can settle are still open, and this task
stays in `tasks/`. The highest-risk two, per the plan, are **step 6** (selling a whole position
while its drawer is open — the close-and-explain path) and **step 4** (a deep link on a cold
load, which a `useState`-only implementation appears to pass).
