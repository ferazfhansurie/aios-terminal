#!/bin/zsh
# Adletic file picker — fzf inside a tmux popup, types @/abs/path into the
# current Claude/zsh prompt on selection.
#
# Bound to:  ⌘⇧F (Alacritty) → tmux Prefix+f → this script
#
# Walks from the CURRENT pane's working dir (so picking is project-scoped).

emulate -L zsh -o NO_NOMATCH
[[ -r /etc/zprofile ]] && source /etc/zprofile
[[ -r "$HOME/.zprofile" ]] && source "$HOME/.zprofile"
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/opt/homebrew/sbin:$PATH"

# Detect the cwd of the pane that triggered us. Tmux passes it via
# pane_current_path when invoked from a binding; fall back to $PWD.
START_DIR="${TMUX_PANE_PATH:-$PWD}"
cd "$START_DIR" 2>/dev/null || cd "$HOME"

# Find files, skipping common noise. Use fd if available (faster), else find.
if command -v fd >/dev/null 2>&1; then
  list_cmd=(fd --type f --hidden --strip-cwd-prefix
           --exclude .git --exclude node_modules --exclude .next
           --exclude dist --exclude build --exclude .DS_Store
           --max-depth 8)
else
  list_cmd=(find . -type f
           -not -path '*/node_modules/*' -not -path '*/.git/*'
           -not -path '*/.next/*' -not -path '*/dist/*'
           -not -path '*/build/*'
           -maxdepth 8)
fi

preview_cmd='[[ -f {} ]] && (bat --style=plain --color=always --line-range=:200 {} 2>/dev/null || head -200 {} 2>/dev/null)'

selected=$("${list_cmd[@]}" 2>/dev/null \
  | sed 's|^\./||' \
  | fzf --reverse \
        --prompt="send file → claude  " \
        --header="cwd: $START_DIR" \
        --preview="$preview_cmd" \
        --preview-window=right:60%:wrap \
        --height=100%)

if [[ -z "$selected" ]]; then
  exit 0
fi

# Resolve absolute path (handles relative selections).
abs=$(cd "$START_DIR" && realpath "$selected" 2>/dev/null)
[[ -z "$abs" ]] && exit 1

# Type "@<abs> " into the calling pane.
# `tmux send-keys` without -t targets the current/active pane,
# which is the one that triggered the popup.
tmux send-keys "@$abs "
