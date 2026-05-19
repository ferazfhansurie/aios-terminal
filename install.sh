#!/usr/bin/env bash
# install.sh — set up the Adletic terminal config on a fresh Mac.
# Run as: bash <(curl -fsSL …) OR ./install.sh from a cloned dir.
#
# What it installs:
#   • brew dependencies: tmux, fzf, ffmpeg, python3 (system), node (for ccusage fallback)
#   • python lib:       pycryptodome (decrypts Claude Desktop cookies)
#   • alacritty config: ~/.config/alacritty → ~/.config/adletic/alacritty.toml
#   • tmux config:      uses ~/.config/adletic/tmux.conf via the `aios` zsh fn
#   • status-bar pills + helpers: ~/.config/adletic/helpers/
#   • voicemode service: optional — only if user wants STT/TTS
#
# Manual steps it will prompt for at the end:
#   • Sign in to Claude Desktop (gives us the cookie for usage chips)
#   • Grant microphone permission to whichever terminal app is used
#   • Optional: install Adletic terminal (Alacritty fork) for branded chrome
#
# Idempotent — safe to re-run. Skips anything already present.

set -euo pipefail

OK()   { printf "\033[32m✓\033[0m %s\n" "$*"; }
INFO() { printf "\033[2m·\033[0m %s\n" "$*"; }
WARN() { printf "\033[33m!\033[0m %s\n" "$*"; }
ERR()  { printf "\033[31m✗\033[0m %s\n" "$*" >&2; }

require_macos() {
  [[ "$(uname)" == "Darwin" ]] || { ERR "macOS only (got $(uname))"; exit 1; }
}

ensure_homebrew() {
  if command -v brew >/dev/null 2>&1; then
    OK "homebrew present"
  else
    INFO "installing homebrew (will prompt for sudo)"
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    # Add to PATH for this session
    if [[ -x /opt/homebrew/bin/brew ]]; then
      eval "$(/opt/homebrew/bin/brew shellenv)"
    fi
    OK "homebrew installed"
  fi
}

brew_install() {
  local pkg="$1"
  if brew list "$pkg" >/dev/null 2>&1; then
    OK "$pkg already installed"
  else
    INFO "brew install $pkg"
    brew install "$pkg"
    OK "$pkg installed"
  fi
}

ensure_python_lib() {
  local lib="$1"
  # Install for whichever python3 is on PATH (the same one the helpers use).
  if python3 -c "import $lib" 2>/dev/null; then
    OK "python lib $lib present"
  else
    INFO "installing python lib $lib (user-site)"
    python3 -m pip install --user --break-system-packages "$lib" 2>/dev/null \
      || python3 -m pip install --user "$lib"
    OK "$lib installed"
  fi
}

clone_or_pull() {
  local repo="$1" dest="$2"
  if [[ -d "$dest/.git" ]]; then
    INFO "updating $dest"
    git -C "$dest" pull --rebase --autostash || WARN "pull failed, continuing"
    OK "$dest up to date"
  else
    INFO "cloning $repo → $dest"
    git clone "$repo" "$dest"
    OK "$dest cloned"
  fi
}

# ────────────────────────────────────────────────────────────────────────
# Main
# ────────────────────────────────────────────────────────────────────────

require_macos

cat <<'BANNER'

┌──────────────────────────────────────────────────────────────┐
│   adletic terminal · config installer                         │
│                                                               │
│   bottom-bar pills, voice-to-text, screenshots-to-claude,     │
│   live claude.ai usage chips, conversation picker.            │
└──────────────────────────────────────────────────────────────┘

BANNER

ensure_homebrew

INFO "checking system deps"
for pkg in tmux fzf ffmpeg jq; do
  brew_install "$pkg"
done

# python3 ships with macOS; we install lib into user site.
ensure_python_lib pycryptodome

# ────────────────────────────────────────────────────────────────────────
# Drop config files
# ────────────────────────────────────────────────────────────────────────

ADLETIC_DIR="$HOME/.config/adletic"

if [[ -d "$ADLETIC_DIR" && "$(realpath "$ADLETIC_DIR" 2>/dev/null)" == "$(realpath "$(dirname "$0")" 2>/dev/null)" ]]; then
  OK "already running from $ADLETIC_DIR"
else
  mkdir -p "$ADLETIC_DIR"
  # If invoked from inside the source dir, rsync the files in.
  SRC_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
  if [[ "$SRC_DIR" != "$ADLETIC_DIR" ]]; then
    INFO "syncing config from $SRC_DIR → $ADLETIC_DIR"
    rsync -a --exclude '.git' "$SRC_DIR/" "$ADLETIC_DIR/"
    OK "config files copied"
  fi
fi

# Symlink alacritty.toml so Alacritty (any build, not just the fork) picks it up.
ALACRITTY_LINK="$HOME/.config/alacritty/alacritty.toml"
mkdir -p "$(dirname "$ALACRITTY_LINK")"
if [[ -L "$ALACRITTY_LINK" && "$(readlink "$ALACRITTY_LINK")" == "$ADLETIC_DIR/alacritty.toml" ]]; then
  OK "alacritty.toml already linked"
elif [[ -e "$ALACRITTY_LINK" ]]; then
  WARN "$ALACRITTY_LINK exists and is not our symlink — leaving alone (point it at $ADLETIC_DIR/alacritty.toml manually if you want our config)"
else
  ln -s "$ADLETIC_DIR/alacritty.toml" "$ALACRITTY_LINK"
  OK "linked $ALACRITTY_LINK → $ADLETIC_DIR/alacritty.toml"
fi

# Make every helper executable.
chmod +x "$ADLETIC_DIR/helpers/"*.sh "$ADLETIC_DIR/helpers/"*.py 2>/dev/null || true
OK "helpers marked executable"

# Seed personal files from .example templates if not present.
seed_example() {
  local src="$1" dst="$2"
  if [[ -e "$dst" ]]; then
    OK "$(basename "$dst") already present (leaving alone)"
  elif [[ -e "$src" ]]; then
    cp "$src" "$dst"
    chmod +x "$dst" 2>/dev/null || true
    OK "seeded $(basename "$dst") from .example — edit to taste"
  fi
}
seed_example "$ADLETIC_DIR/helpers/browser-bookmarks.example.sh" "$ADLETIC_DIR/helpers/browser-bookmarks.sh"
seed_example "$ADLETIC_DIR/quick-launcher.example.conf"          "$ADLETIC_DIR/quick-launcher.conf"

# ────────────────────────────────────────────────────────────────────────
# zsh function for the `aios` launcher (tmux wrapper)
# ────────────────────────────────────────────────────────────────────────

ZRC="$HOME/.zshrc"
if grep -q "^adletic-aios()" "$ZRC" 2>/dev/null; then
  OK "adletic-aios zsh function already in .zshrc"
else
  cat >> "$ZRC" <<'ZSHFN'

# ─── adletic terminal launcher ────────────────────────────────────
# Drop you into a tmux session that loads the adletic config (status
# bar pills, ⌥⌘V voice, ⌥⌘D drop-doc, etc).  Plain `tmux` still works
# normally; this is just the branded path.
adletic-aios() {
  local sess="aios-$$-$(date +%s)"
  tmux -L adletic -f "$HOME/.config/adletic/tmux.conf" new-session -s "$sess"
}
ZSHFN
  OK "adletic-aios zsh function added — restart your shell or 'source ~/.zshrc'"
fi

# ────────────────────────────────────────────────────────────────────────
# Optional services
# ────────────────────────────────────────────────────────────────────────

cat <<'OPTIONAL'

────────────────────────────────────────────────────────────────
 optional next steps (skip if not wanted)
────────────────────────────────────────────────────────────────

1. install Claude Desktop and sign in
   → required for the live usage chips (5h, 7d, plan tier) and 💬
     conversation picker.
   → download: https://claude.ai/download
   → after install, sign in.  The status bar will populate within
     60 seconds.

2. install VoiceMode for local STT (Whisper) — needed for the 🎤
   voice pill / ⌥⌘V transcription.  Skip if you don't want
   speech-to-text.
     uvx voice-mode service install whisper
     uvx voice-mode service enable whisper
   The pill works without this but will silently no-op on click.

3. install Adletic terminal (Alacritty fork) for the branded
   chrome (AIOS.app icon, dock menu, MotionBoards theme).  Or
   keep using stock Alacritty / iTerm — config still works.
     git clone https://github.com/ferazfhansurie/adletic-terminal
     cd adletic-terminal && make app && cp -r target/release/osx/AIOS.app /Applications/

4. grant Microphone permission to your terminal app
   → first time you ⌥⌘V or click 🎤, macOS will prompt.
   → System Settings → Privacy & Security → Microphone

────────────────────────────────────────────────────────────────

OPTIONAL

OK "install complete — run 'adletic-aios' (or restart shell first) to launch the branded tmux session"
