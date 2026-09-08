# Tasks — Asset detail drawer

One file per task, named `T<NN>-<slug>.md`. **Open** tasks live in this folder; when a task
is done, set its Status to `Done` and **move the file into `completed/`**. So the open work
is whatever sits directly here, and the history is in `completed/`.

Work tasks in numeric order (T1, T2, …), one at a time.

## Order and shape of this breakdown

T1 and T2 are groundwork and touch no behavior: T1 moves three components out of the
2868-line `pages/assets.tsx`, T2 adds the pure module every later task derives from. T3 fixes
an invalidation gap that exists today. T4 is the structural change — the drawer replaces the
inline row expansion — and most later tasks fill its body. T13 closes the feature with the
manual QA the repo's test setup cannot reach.

**Locale keys are added by the task that introduces the string**, not batched at the end.
`locales/i18n.test.ts` rejects a key present in one file and absent from another *in both
directions*, so a task that adds an English string without the other eight breaks the suite
it is supposed to leave green. T13 is a parity sweep, not the place keys first appear.

## Definition of Done

A task counts as done when:

- [ ] Code is merged via a reviewed PR
- [ ] Tests covering the task pass
- [ ] The linked acceptance criteria are satisfied
- [ ] Spec/plan updated if behavior changed
- [ ] `npm run lint` and the TypeScript build pass
- [ ] Any user-facing string added in this task exists in all nine locale files, and
      `locales/i18n.test.ts` passes
