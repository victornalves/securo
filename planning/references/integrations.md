# Optional Integrations: GitHub / Jira / Confluence

These are **mirrors of the repo, never the source of truth, and never mandatory**. Set them
up only when the user asks. The Markdown under `planning/` always wins if they disagree.

## Where the targets are configured

Sync destinations live in `planning/config.yml` (template: `planning/assets/templates/config.yml`).
It records the Confluence parent page, the space, and the Jira project so the whole team
shares one destination. If a sync is requested and `config.yml` is missing or blank, create
it / fill it (confirming the values with the user) before syncing.

Required for Confluence sync: `confluence.project_page_id` — the ID of the project's parent
page. This page **is** the planning index (mirrors `planning/README.md`); all spec pages are
created as direct children of it. No intermediate page is created.

Required for Jira sync: `jira.project_key` — the Jira project where epics, bugs, and tasks
are created.

## Sync mode

Controlled by `sync.auto` in `planning/config.yml`. Set during the first-run bootstrap:

- **`true` (recommended)**: after any write to a `planning/` artifact (spec.md, plan.md, task
  file, or the index), automatically mirror the change to Jira and Confluence. No
  pre-confirmation needed; report what was synced in a one-line note at the end of the turn.
- **`false`**: sync only when the user explicitly requests it with "sync NNN" or "sync all".
  Confirm what will be created/updated before acting.

Toggle anytime with "enable auto-sync" / "disable auto-sync". When enabling, check that
`project_page_id` and `project_key` are set — if either is blank, prompt the user to fill
them first.

## Mapping

| Spec-driven artifact           | Jira                                                    | Confluence                                            | When                    |
| ------------------------------ | ------------------------------------------------------- | ----------------------------------------------------- | ----------------------- |
| `planning/README.md`           | —                                                       | Parent page (`project_page_id`) updated in place       | On bootstrap and every index change |
| `spec.md` created (Draft)      | —                                                       | `NNN – Title` entry page + `[DRAFT] Spec – Title` subpage, both under `project_page_id` | On spec creation |
| `spec.md` approved             | Epic / Bug / Task created                               | `[DRAFT]` prefix removed from page title              | On spec approval        |
| `plan.md` created (Draft)      | —                                                       | `[DRAFT] Plan – Title` subpage under spec page        | On plan creation        |
| `plan.md` approved             | —                                                       | `[DRAFT]` prefix removed from page title              | On plan approval        |
| Each task file in `tasks/`     | Task created (`issue_types.task`), linked to parent     | Aggregated in "Tasks" subpage                         | On task creation        |
| Task moved to `completed/`     | Jira Task transitioned to Done                          | Moved to "Completed" subpage                          | On task completion      |
| All tasks complete             | Parent Epic/Bug closed                                  | —                                                     | On spec Done            |

Issue types are read from `config.yml > jira.issue_types` and can be overridden per project.

## Confluence page hierarchy

```
[Project Page]  ← project_page_id  (= planning index, mirrors planning/README.md)
├── 001 – Feature Name
│   ├── Spec – Feature Name           ← spec.md content
│   ├── Plan – Feature Name           ← plan.md content (only when Approved)
│   └── Tasks – Feature Name          ← tasks/README.md + all open task files
│       └── Completed                 ← completed task files
├── 002 – Bug Name
│   ├── Spec – Bug Name
│   └── Tasks – Bug Name
│       └── Completed
└── 003 – Spike Name
    ├── Spec – Spike Name
    └── Tasks – Spike Name
        └── Completed
```

Page title convention:
- Index page: the parent page title is set by the user; do not rename it
- Spec entry pages: `NNN – Title` (zero-padded ID sorts them naturally)
- Artifact subpages: `Spec – Title`, `Plan – Title`, `Tasks – Title`
- Completed subpage: `Completed`

Do not create a Completed subpage until at least one task has been moved to `tasks/completed/`.

## Clickable cross-links

Every Confluence page must include navigation links so users can jump between related pages
without going through the Confluence sidebar.

**Parent (index) page** — top of the page, before the tables:
> No navigation header needed; this is the root.

Each row in the index table links to the spec entry page in Confluence (not just its title).

**Spec entry page (e.g. "001 – Feature Name")** — nav bar at the very top:
> [← Index ↑](project_page_url) · [Spec](spec_page_url) · [Plan](plan_page_url) · [Tasks](tasks_page_url)

Omit links to pages that don't exist yet (e.g. Plan before it's approved).

**Spec / Plan artifact pages** — breadcrumb at top:
> [Index](project_page_url) › [001 – Feature Name](url) › Spec

**Tasks page** — breadcrumb + link to completed:
> [Index](project_page_url) › [001 – Feature Name](url) › Tasks · [View Completed →](completed_url)

**Completed page** — breadcrumb + link back:
> [Index](project_page_url) › [001 – Feature Name](url) › [Tasks](tasks_url) › Completed

When writing page URLs back to the local Markdown, store them in the `Confluence` field of
the artifact header table so the repo files are also clickable references.

## Writing keys back

Whatever Jira/Confluence returns (epic key, issue keys, page IDs/URLs) must be written
**back into the Markdown** — the index row and the artifact header tables (`Jira`,
`Confluence` fields) — so the repo stays the canonical reference.

## GitHub PR links

When a task is implemented, record its PR in the task file (`PR: #123`) and in the index
row once merged. Always optional — a task with no PR link is fine.

## Pull — importing changes from Jira / Confluence into local files

The pull command reconciles remote changes back into the local `planning/` files. Use it
when the team has made edits directly in Jira or Confluence (status updates, comments,
content edits) and wants those reflected locally.

Invoked by: "pull NNN", "pull all", "atualiza NNN", "pull tudo".

Always confirm what will be overwritten before applying — pull is the one operation where
local files can be modified from a remote source.

### What to pull from Jira

For each task file in `tasks/` and `tasks/completed/` that has a `Jira` key:

1. Fetch the current issue status via `getJiraIssue`.
2. **Status sync:**
   - If the Jira Task is Done but the local file is not in `completed/` → set Status to
     `Done` and move the file to `tasks/completed/`.
   - If the Jira Task is In Progress but the local file is still `Todo` → update Status
     to `In Progress`.
   - If the Jira issue (Epic/Bug) is closed and the spec is not yet marked Done → flag it
     to the user for review; do not auto-close the spec.
3. **Dependency links sync:** fetch the issue's links via `getJiraIssue`. For each "is
   blocked by" link found, resolve the blocking issue back to a local task ID (via the
   `Jira` field in task files) and update `Depends on` in the local file. Remove any
   local `Depends on` entries that no longer have a matching link in Jira.
4. **Comments sync:** fetch comments added since the last pull (use the issue's `updated`
   timestamp stored in the `Jira` field, or fall back to fetching all comments). Append new
   comments to the `## Notes` section of the corresponding local file, prefixed with
   `> [Jira comment – AuthorName]:`.
5. Update the `Jira` field timestamp in the local file to mark the last pull time.

### What to pull from Confluence

For each local file (`spec.md`, `plan.md`, task files) that has a `Confluence` URL in its
header:

1. Fetch the page content via `getConfluencePage`.
2. Compare the page's `lastModified` timestamp against the local file's last known sync
   timestamp (stored in the `Confluence` field).
3. If the page was modified after the last sync:
   - Convert the Confluence page body to Markdown (strip Confluence macros, preserve
     structure and text).
   - **Overwrite the local file** with the converted content, preserving the header
     metadata table (ID, Status, Jira, Confluence fields).
   - Report which files were updated and a brief diff summary.
4. If the page has not changed since last sync, skip it silently.

> **Note on source of truth during pull:** normally the local repo is the source of truth.
> During a pull, Confluence content takes precedence for the files being pulled. After the
> pull completes, the local file is again the source of truth — any further edits should
> happen locally and be pushed via sync.

### Pull report

After every pull, emit a summary:

```
Pulled NNN – Feature Name:
  ✓ T2-slug: status Todo → In Progress (from Jira DATA-47)
  ✓ T3-slug: status In Progress → Done, moved to completed/ (from Jira DATA-48)
  ✓ spec.md: updated from Confluence (page modified 2026-06-10)
  — plan.md: no changes
  + 2 new Jira comments appended to T1-slug Notes
```

## Jira sync (via the Atlassian connector)

Jira integration triggers at three points in the workflow. In all cases: confirm with the
user before acting if `sync.auto` is `false`; act silently and report in one line if `true`.

**Description formatting — always set `contentFormat: "markdown"`** when calling
`createJiraIssue` or `editJiraIssue` with a description. Without it, Jira receives raw text
and renders `\n` literally instead of as line breaks. The connector converts Markdown to ADF
automatically when this parameter is set.

### Trigger 1 — Spec approved

When a spec status changes to `Approved`:

1. Read `planning/config.yml` for `project_key` and `issue_types`.
2. Create one issue using the type matching the spec's Type field:
   - Feature → `issue_types.epic` (default: Epic)
   - Bug → `issue_types.bug` (default: Bug)
   - Spike → `issue_types.spike` (default: Task)
   - Refactor → `issue_types.refactor` (default: Task)
3. Use the spec title as the issue summary. Use the Goals section as the description.
   For Bug: prepend reproduction steps and expected vs. actual behavior.
4. Write the returned Jira key into the `Jira` field of `spec.md`.

### Trigger 2 — Tasks created or edited

Runs after task files are created under `tasks/`, or after any task file's `Depends on`
field is added or changed. Two phases — always in this order:

**Phase A — Create issues (if not yet created):**
1. Read the `Jira` key from `spec.md` — this is the parent issue.
2. For each task file without a `Jira` key, create one Jira Task (`issue_types.task`)
   linked to the parent issue. Use the task title as summary and `## Implementation guidance`
   as description.
3. Write the returned Jira key into the `Jira` field of each task file.

**Phase B — Wire dependency links:**
4. Call `getIssueLinkTypes` once to fetch the available link types for this Jira project.
   Find the type that represents "is blocked by" (look for "Blocks", "is blocked by", or
   equivalent — names vary per instance). If none exists, skip silently and note it.
5. For each task file where `Depends on` is not `—`:
   - Parse the comma-separated task IDs (e.g. `T1, T3`).
   - Resolve each to its Jira key via the `Jira` field of the corresponding task file.
   - Call `createIssueLink` to create a "is blocked by" link: this task ← blocked by → dependency.
6. Remove any stale links (dependency was removed from `Depends on`) by checking existing
   links on the issue and deleting those no longer present locally.
7. Report created and removed links in the one-line summary.

### Trigger 3 — Task completed (file moved to `tasks/completed/`)

When a task file is moved to `tasks/completed/`:

1. Read the `Jira` key from the task file.
2. Call `getTransitionsForJiraIssue` to fetch available transitions — never hardcode a
   status name, as Jira workflows vary per project.
3. Apply the transition that represents Done (look for "Done", "Resolved", "Closed", or
   equivalent in the returned list).
4. If all task files for the spec are now in `completed/` and the spec is being moved to
   Done in `planning/README.md`, also close the parent Epic/Bug using the same approach.

### Work type fallback

Before creating any issue, check that the configured work type exists in the project (via
`getJiraProjectIssueTypesMetadata`). If the type is unavailable, fall back to
`issue_types.task` (default: `"Task"`) and note the substitution in the one-line summary.
Never fail the sync because of a missing work type. If `issue_types.task` itself is also
missing, abort and ask the user to correct `config.yml`.

## Confluence sync

Confluence pages are created as soon as artifacts exist — not gated on approval. Draft pages
use a `[DRAFT]` prefix in the title so reviewers know the status at a glance.

### On spec creation

1. Read `planning/config.yml` for `space_key` and `project_page_id`.
2. Update the parent page (`project_page_id`) to mirror `planning/README.md` (three tables: In Progress, Backlog, Done).
3. Create the spec's entry page titled `NNN – Title` as a direct child of `project_page_id`.
4. Create the `[DRAFT] Spec – Title` subpage under it with the content of `spec.md`.
5. Add navigation links per the **Clickable cross-links** section.
6. Write the returned page URL into the `Confluence` field of `spec.md`.

### On spec approval

1. Rename `[DRAFT] Spec – Title` → `Spec – Title` (remove the `[DRAFT]` prefix).
2. Update the page content if `spec.md` changed during the review.

### On plan creation

1. Create `[DRAFT] Plan – Title` as a subpage of the spec's entry page.
2. Write the returned page URL into the `Confluence` field of `plan.md`.

### On plan approval

1. Rename `[DRAFT] Plan – Title` → `Plan – Title`.
2. Update the page content if `plan.md` changed during the review.

### On task creation

1. Create (or update) the `Tasks – Title` subpage under the spec's entry page, aggregating
   the content of `tasks/README.md` and all open task files.

### General rules

- Keep editing in the repo and **re-publish** on changes — never edit directly in Confluence
  unless pulling changes back via the pull command.
- Always add navigation links to every page per the **Clickable cross-links** section.
- Write all returned page URLs back into the local Markdown `Confluence` fields.
