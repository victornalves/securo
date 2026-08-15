#!/usr/bin/env python3
"""Scaffold a new spec folder from the templates and register it in the index.

Usage:
    python new_spec.py "Feature name" [--type Feature] [--planning-dir ./planning]
                       [--status Backlog] [--author NAME]

Creates planning/NNN-slug/{spec,plan,tasks}.md from the bundled templates, assigns the next
sequential ID, and adds a row to the chosen table in planning/README.md (creating the index
and config.yml from templates if they don't exist yet).

The repo Markdown is the source of truth — this script only touches local files.
"""

from __future__ import annotations

import argparse
import datetime as dt
import re
import shutil
from pathlib import Path

TEMPLATES = Path(__file__).resolve().parent.parent / "assets" / "templates"
VALID_TYPES = ["Feature", "Bug", "Spike", "Refactor"]
VALID_STATUS = ["Backlog", "In Progress"]


def slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return re.sub(r"-{2,}", "-", s)


def next_id(specs_dir: Path) -> str:
    ids = [
        int(m.group(1))
        for p in specs_dir.glob("[0-9][0-9][0-9]-*")
        if p.is_dir() and (m := re.match(r"(\d{3})-", p.name))
    ]
    return f"{(max(ids) + 1) if ids else 1:03d}"


def set_field(text: str, label: str, value: str) -> str:
    """Rewrite a `| Label | value |` row in a header table."""
    pattern = re.compile(rf"^\|\s*{re.escape(label)}\s*\|[^|]*\|.*$", re.MULTILINE)
    return pattern.sub(f"| {label} | {value} |", text, count=1)


def fill(template: Path, *, title_word: str, name: str, fid: str, today: str,
         type_: str | None) -> str:
    text = template.read_text(encoding="utf-8")
    text = text.replace(f"# {title_word}: <Feature Name>", f"# {title_word}: {name}")
    text = set_field(text, "ID", fid)
    text = set_field(text, "Last updated", today)
    if type_ is not None:
        text = set_field(text, "Type", type_)
    return text


def ensure_index(specs_dir: Path) -> Path:
    index = specs_dir / "README.md"
    if not index.exists():
        shutil.copy(TEMPLATES / "index.md", index)
        # remove the example/placeholder rows so we start clean
        lines = [
            ln for ln in index.read_text(encoding="utf-8").splitlines()
            if not ln.strip().startswith("| 001 |") and "| — |" not in ln.replace(" ", "")
            and not re.match(r"^\|\s*—", ln)
        ]
        index.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return index


def ensure_config(specs_dir: Path) -> None:
    cfg = specs_dir / "config.yml"
    if not cfg.exists():
        shutil.copy(TEMPLATES / "config.yml", cfg)


def add_index_row(index: Path, *, status: str, fid: str, type_: str, name: str,
                  slug: str) -> None:
    lines = index.read_text(encoding="utf-8").splitlines()
    if status == "Backlog":
        row = f"| {fid} | {type_} | {name} | |"
    else:  # In Progress
        docs = (f"[spec]({fid}-{slug}/spec.md) · [plan]({fid}-{slug}/plan.md) · "
                f"[tasks]({fid}-{slug}/tasks/)")
        row = f"| {fid} | {type_} | {name} | {docs} | — | — |"

    # find the section header, then the last table row under it, and insert after it
    try:
        start = next(i for i, ln in enumerate(lines) if ln.strip() == f"## {status}")
    except StopIteration as exc:  # pragma: no cover
        raise SystemExit(f"Section '## {status}' not found in {index}") from exc

    insert_at = start + 1
    for i in range(start + 1, len(lines)):
        if lines[i].startswith("## "):
            break
        if lines[i].lstrip().startswith("|"):
            insert_at = i + 1
    lines.insert(insert_at, row)
    index.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    ap = argparse.ArgumentParser(description="Scaffold a new spec.")
    ap.add_argument("name", help="Human-readable title, e.g. 'PR review bot'")
    ap.add_argument("--type", default="Feature", choices=VALID_TYPES)
    ap.add_argument("--status", default="Backlog", choices=VALID_STATUS)
    ap.add_argument("--planning-dir", default="./planning", type=Path, dest="specs_dir")
    ap.add_argument("--author", default="<name>")
    args = ap.parse_args()

    specs_dir: Path = args.specs_dir
    specs_dir.mkdir(parents=True, exist_ok=True)
    ensure_config(specs_dir)
    index = ensure_index(specs_dir)

    fid = next_id(specs_dir)
    slug = slugify(args.name)
    folder = specs_dir / f"{fid}-{slug}"
    if folder.exists():
        raise SystemExit(f"{folder} already exists")
    folder.mkdir()

    today = dt.date.today().isoformat()
    (folder / "spec.md").write_text(
        fill(TEMPLATES / "spec.md", title_word="Spec", name=args.name, fid=fid,
             today=today, type_=args.type).replace("<name>", args.author),
        encoding="utf-8")
    (folder / "plan.md").write_text(
        fill(TEMPLATES / "plan.md", title_word="Plan", name=args.name, fid=fid,
             today=today, type_=None).replace("<name>", args.author),
        encoding="utf-8")
    tasks_dir = folder / "tasks"
    (tasks_dir / "completed").mkdir(parents=True)
    (tasks_dir / "completed" / ".gitkeep").write_text("", encoding="utf-8")
    readme = (TEMPLATES / "tasks-readme.md").read_text(encoding="utf-8")
    (tasks_dir / "README.md").write_text(
        readme.replace("<Feature Name>", args.name), encoding="utf-8")

    add_index_row(index, status=args.status, fid=fid, type_=args.type, name=args.name,
                  slug=slug)

    print(f"Created {folder} ({args.type}) and added it to {index} under '{args.status}'.")
    print(f"  - {folder/'spec.md'}\n  - {folder/'plan.md'}\n  - {tasks_dir}/ (with completed/)")


if __name__ == "__main__":
    main()
