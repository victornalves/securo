# Code & Tooling Conventions

The team works mostly in **Python**, and many contributors are data scientists rather than
career software engineers. So the goal here is guidance plus *automatic* guardrails: tools
that fix or block problems without anyone having to remember rules. Read this during the
Implement phase, or when setting up a repo for the first time.

> This is a starter set, not final. It's meant to grow — add conventions as the team agrees
> on them.

## 1. Formatting & linting — Ruff

Use [Ruff](https://docs.astral.sh/ruff/) as the single tool for both formatting and
linting. One tool, one config, no debates.

Add to `pyproject.toml`:

```toml
[tool.ruff]
line-length = 100
target-version = "py311"

[tool.ruff.lint]
# Start lenient, tighten over time. E = pycodestyle, F = pyflakes,
# I = import sorting, UP = pyupgrade, B = common bugs.
select = ["E", "F", "I", "UP", "B"]
```

Day-to-day commands:

```bash
ruff format .        # auto-format everything
ruff check . --fix   # lint and auto-fix what it safely can
```

## 2. Commit guardrail — pre-commit hooks

So nobody commits unformatted or broken code, install a git hook that runs Ruff before each
commit and **blocks the commit if it fails**.

`.pre-commit-config.yaml`:

```yaml
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.6.0
    hooks:
      - id: ruff          # lint
        args: [--fix]
      - id: ruff-format   # format
```

Set it up once per clone:

```bash
pip install pre-commit
pre-commit install        # now every `git commit` is checked automatically
pre-commit run --all-files  # optional: check the whole repo right now
```

## 3. Tests — pytest

- Tests live in `tests/`, files named `test_*.py`.
- Each acceptance criterion in the spec should map to at least one test.
- `pytest -q` to run; keep tests fast and independent.

## 4. Dependencies & environment

Prefer [`uv`](https://docs.astral.sh/uv/) for fast, reproducible environments
(`uv add <pkg>`, `uv run ...`). At minimum, pin dependencies in `pyproject.toml` — avoid
"works on my machine".

## 5. Notebooks (for the data scientists)

Notebooks are great for exploration, but they're hard to review and version.

- Keep exploratory notebooks in `notebooks/`.
- Move reusable logic into importable modules (`src/` or a package) so it can be tested.
- Strip outputs before committing (e.g. add the `nbstripout` pre-commit hook) to keep diffs
  clean and avoid committing data.

## 6. Small, readable habits

- Type hints on function signatures — they double as documentation and catch mistakes.
- Short functions with clear names; a function that needs a comment to explain *what* it
  does usually wants to be split or renamed.
- Use `logging` instead of `print` in anything that isn't a throwaway script.
- Docstrings on public functions/classes (one line is fine).

## Offering setup

When a repo lacks this tooling, offer to scaffold it: create/extend `pyproject.toml` with
the Ruff config, add `.pre-commit-config.yaml`, and walk the user through
`pre-commit install`. Don't force it — propose it and let them opt in.
