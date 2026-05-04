#!/bin/zsh
# helpers/git-status.sh — print "<branch><dirty>" for a given path, cached 5s.
# Output empty when path is not a git repo.

set -eu

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

DIR="${1:-$PWD}"
CACHE_DIR="${HOME}/.cache/adletic"
mkdir -p "$CACHE_DIR"
HASH=$(print -- "$DIR" | md5)
CACHE="${CACHE_DIR}/git-${HASH}.txt"

if [[ -f "$CACHE" ]]; then
  age=$(( $(date +%s) - $(stat -f %m "$CACHE") ))
  if (( age < 5 )); then
    cat "$CACHE"; exit 0
  fi
fi

cd "$DIR" 2>/dev/null || { print -n -- "" >| "$CACHE"; exit 0; }
branch=$(git -C "$DIR" branch --show-current 2>/dev/null || true)
[[ -z "$branch" ]] && { print -n -- "" >| "$CACHE"; exit 0; }

dirty=" ✓"
if ! git -C "$DIR" diff --quiet 2>/dev/null \
   || ! git -C "$DIR" diff --cached --quiet 2>/dev/null \
   || [[ -n "$(git -C "$DIR" ls-files --others --exclude-standard 2>/dev/null)" ]]; then
  dirty=" ●"
fi

print -n -- "${branch}${dirty}" >| "$CACHE"
cat "$CACHE"
