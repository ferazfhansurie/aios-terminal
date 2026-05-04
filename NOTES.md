# Notes

Implementation findings captured during build-out.

## Claude CLI cost surface

Verified on 2026-05-04 with `claude --version` = 2.1.126 (Claude Code).

- No public `claude --help` flag exposes cost. The `/cost` slash command
  only works inside an interactive REPL.
- Actual usage data lives in the per-session JSONL transcripts at
  `~/.claude/projects/<encoded-cwd>/<session-uuid>.jsonl`. Each
  `assistant` line carries `message.usage` with fields
  `input_tokens`, `cache_creation_input_tokens`,
  `cache_read_input_tokens`, `output_tokens`, plus `message.model`
  for per-model pricing. Encoded cwd uses `-` for `/`
  (e.g. `/Users/firazfhansurie` → `-Users-firazfhansurie`).
- Used by: `helpers/hud.sh` (Phase 3, Task 3.6) — sums tokens per
  session and multiplies by `pricing.toml` rates.
- Fallback: if the JSONL schema changes, `helpers/hud.sh` hides the
  cost block and renders only session count + model name.

## adletic CLI relocatability (PF-2)

The `adletic` CLI script is at `~/Repo/firaz/adletic/aios-firaz/bin/adletic`
and `~/.local/bin/adletic` is already a symlink to it. The script uses
`$AIOS_ROOT` (env var) and `$HOME` for self-location — no `$0` /
`BASH_SOURCE` / `dirname` / `readlink` self-resolution. No shim needed.

### Deviation from plan Task 1.3

Task 1.3 instructed to move `~/.local/bin/adletic` (assumed real file)
into `~/.config/adletic/adletic` and symlink back. Reality: the script
lives in the `aios-firaz` repo (already version-controlled there) and
`~/.local/bin/adletic` is already a symlink to it. Moving the file
into this dotfiles repo would:

1. Delete it from `aios-firaz` (in-flight AIOS sessions would break)
2. Decouple it from the `$AIOS_ROOT/bin/adletic` location its own
   header comments reference
3. Create cross-repo coupling between the dotfiles and aios-firaz

Decision: keep the script in `aios-firaz`, leave `~/.local/bin/adletic`
pointing there. The plan's intent ("CLI under version control with
symlink in PATH") is already satisfied. No commit for Task 1.3.

## Dependency install (PF-3)

All seven tools installed via Homebrew on 2026-05-04:

- yazi 26.1.22
- micro 2.0.15
- fzf 0.72.0 (already present)
- glow 2.1.2
- fswatch 1.20.1
- terminal-notifier 2.0.0
- chafa 1.18.2

No formula failed to resolve.
