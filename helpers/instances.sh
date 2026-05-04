#!/bin/zsh
# helpers/instances.sh — single source of truth for AIOS workspace folders.
#
# Reads/writes ~/.aios/instances.json (shared with the Electron AIOS app).
# Sourced by both the adletic CLI and welcome.sh.
#
# Each entry: { id, name, path, created }.
# - name = tmux session name (and the label shown in the picker)
# - path = absolute cwd to land in when the session is created

zmodload zsh/datetime 2>/dev/null

AIOS_INSTANCES="$HOME/.aios/instances.json"

_aios_ensure_instances() {
  local dir="${AIOS_INSTANCES:h}"
  [[ -d "$dir" ]] || mkdir -p "$dir"
  [[ -f "$AIOS_INSTANCES" ]] || print -- '[]' >| "$AIOS_INSTANCES"
}

aios_get_path() {
  # NOTE: do not use a local var named `path` — it shadows zsh's $PATH array.
  local name="$1"
  [[ -z "$name" ]] && { print -- "$HOME"; return 0; }
  _aios_ensure_instances
  local resolved
  resolved=$(jq -r --arg n "$name" 'map(select(.name == $n)) | .[0].path // empty' \
        "$AIOS_INSTANCES" 2>/dev/null)
  [[ -n "$resolved" && -d "$resolved" ]] && { print -- "$resolved"; return 0; }
  print -- "$HOME"
}

aios_set_path() {
  # NOTE: do not use a local var named `path` — it shadows zsh's $PATH array.
  local name="$1" target="$2"
  if [[ -z "$name" || -z "$target" ]]; then
    print -u2 "aios_set_path: usage: <name> <abs-path>"
    return 1
  fi
  _aios_ensure_instances
  local tmp="${AIOS_INSTANCES}.tmp.$$"
  local ts="${EPOCHSECONDS:-0}000"
  jq --arg n "$name" --arg p "$target" --argjson ts "$ts" '
    (. // []) as $arr
    | ($arr | map(select(.name != $n))) as $rest
    | ($arr | map(select(.name == $n)) | .[0]) as $existing
    | if $existing then
        $rest + [($existing | .path = $p)]
      else
        $rest + [{
          id:      ("aios-" + $n + "-" + ($ts | tostring)),
          name:    $n,
          path:    $p,
          created: $ts
        }]
      end
  ' "$AIOS_INSTANCES" > "$tmp" && mv "$tmp" "$AIOS_INSTANCES"
}

aios_pick_folder() {
  local initial="${1:-}"
  _aios_ensure_instances
  local existing
  existing=$(jq -r '.[].path // empty' "$AIOS_INSTANCES" 2>/dev/null)
  {
    print -- "$HOME"
    print -- "$existing"
    [[ -d "$HOME/Repo" ]] && find "$HOME/Repo" -maxdepth 3 -type d \
      ! -path '*/node_modules/*' ! -path '*/.git/*' \
      ! -name 'node_modules' ! -name '.git' 2>/dev/null
  } | awk '!seen[$0]++' | fzf \
    --height=50% --reverse --no-info \
    --prompt="📁 folder ❯ " \
    --header=$'\nenter pick · esc cancel\n' \
    --query="$initial"
}
