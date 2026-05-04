# aios-terminal

a raycast-style modal terminal for claude code + multi-session ai work.

```
●firaz · ○ · ~/    claude-opus-4-7 · 41.9k/1.0M · ▱▱▱▱▱▱▱▱▱▱ 4%
```

⌘e file tree, ⌘p fuzzy launcher, ⌘j ask claude, ⌘i cross-session inbox,
⌘o scratchpad, ⌘/ cheatsheet. tmux underneath. one window stays one
window — modals overlay, dismiss back to the prompt.

## why

if you live inside claude code all day, the default terminal is two things:
a slow scrollback, and a place where you forget which folder/session/branch
you're in. the bar at the top says *which workspace*, which *model*, *active
context %*, *git branch + dirty*. the bar at the bottom says *which other
sessions are busy*, *unread inbox count per session*, *current cost*.
nothing decorative, nothing missing.

ai-first, but not always-on. claude is one chord away (`⌘j`). it doesn't
permanently occupy half the screen.

## what's in here

- `alacritty.toml` — colors, font, ⌘-chord bindings, ⌘q confirm-quit
- `tmux.conf` — multiplexer config: HUD, modal popups, prefix bindings
- `welcome.sh` — banner + interactive workspace picker on terminal launch
- `adletic` — multi-session manager CLI (list/send/switch/new/cd/inbox)
- `modals/` — ⌘-chord popups (explorer, palette, just-ask, inbox, outbox, cheatsheet, switch)
- `helpers/` — HUD, FX rates, claude-cost parser, fswatch inbox daemon, file-pickers
- `cheatsheet.md` — keybinding reference rendered by ⌘/

## modals

| chord | modal | what |
|---|---|---|
| ⌘e | explorer | yazi file tree + preview, edit in micro on enter |
| ⌘p | palette | fzf launcher over sessions, recent files, slash-commands |
| ⌘j | just-ask | quick claude question popup |
| ⌘i | inbox | unread inter-session messages, `d` marks all read |
| ⌘o | outbox | append-only scratchpad → `~/.aios/notes.md` |
| ⌘/ | cheatsheet | rendered via glow |
| ⌘⇧s | switch | workspace switcher (alternative to welcome picker) |

## install

requires alacritty, tmux ≥3.2, and:
- yazi (file browser)
- micro (mode-less editor — ctrl+s saves, no vim)
- fzf, glow, fswatch, terminal-notifier (macOS)
- jq (JSON for the workspace registry)

```bash
brew install yazi micro fzf glow fswatch terminal-notifier jq
git clone https://github.com/ferazfhansurie/aios-terminal ~/.config/aios
mkdir -p ~/.config/alacritty ~/.local/bin
ln -s ~/.config/aios/alacritty.toml ~/.config/alacritty/alacritty.toml
ln -s ~/.config/aios/adletic ~/.local/bin/aios
```

then point alacritty's `program` at `~/.config/aios/welcome.sh` (already in
the shipped `alacritty.toml`).

## architecture

two layers, separable:

- **rust binary** (any alacritty install) — terminal-level capability layer.
  upstream alacritty unmodified.
- **dotfiles + scripts** (this repo) — every modal, every chord, every helper.
  iterates daily without rebuilding rust.

the `~/.aios/instances.json` registry is the single source of truth for
"which workspace lives at which folder". each tmux session ↔ one entry.
`aios cd <name>` retargets a workspace; `aios new <name>` opens an fzf
folder picker. the file format is shared with the (separate) electron
aios desktop app — the registry is the cross-process contract.

## license

mit. see [LICENSE](LICENSE).

built on top of [alacritty](https://github.com/alacritty/alacritty),
[tmux](https://github.com/tmux/tmux), [yazi](https://github.com/sxyazi/yazi),
[micro](https://github.com/zyedidia/micro), [fzf](https://github.com/junegunn/fzf),
[glow](https://github.com/charmbracelet/glow). standing on giants.
