# Adletic terminal — Windows boot script. Sourced by alacritty (Git Bash --rcfile).
# Prints AIOS banner, hints at next steps, then leaves an interactive bash prompt.
# Sister to welcome.sh (macOS / zsh). Skip with ADLETIC_SKIP_BOOT=1.

# Pull in the user's normal bashrc so PATH, prompt, aliases all work.
[ -r /etc/bash.bashrc ] && . /etc/bash.bashrc
[ -r "$HOME/.bashrc" ]  && . "$HOME/.bashrc"

if [ "${ADLETIC_SKIP_BOOT:-0}" = "1" ]; then
  return 0
fi

# Brand colors
ORANGE=$'\e[38;2;242;101;34m'
DIM=$'\e[38;2;160;160;160m'
WHITE=$'\e[38;2;255;255;255m'
RESET=$'\e[0m'
BOLD=$'\e[1m'

clear

# Banner
echo ""
printf "  ${ORANGE}${BOLD}█████  ██  ██████  ███████${RESET}\n"
printf "  ${ORANGE}${BOLD}██   ██ ██ ██    ██ ██     ${RESET}\n"
printf "  ${ORANGE}${BOLD}███████ ██ ██    ██ ███████${RESET}\n"
printf "  ${ORANGE}${BOLD}██   ██ ██ ██    ██      ██${RESET}\n"
printf "  ${ORANGE}${BOLD}██   ██ ██  ██████  ███████${RESET}\n"
echo ""
printf "  ${DIM}ai operating system for builders${RESET}\n"
printf "  ${DIM}adletic terminal · windows · git bash${RESET}\n"
echo ""

# Quick checks — tell user what's wired and what's missing.
printf "  "
if command -v aios >/dev/null 2>&1 || [ -x "$HOME/bin/aios-cli.exe" ]; then
  printf "${ORANGE}●${RESET} ${DIM}aios${RESET}"
else
  printf "${DIM}○ aios (not installed — run install.sh)${RESET}"
fi

if command -v claude >/dev/null 2>&1; then
  printf "   ${ORANGE}●${RESET} ${DIM}claude${RESET}"
else
  printf "   ${DIM}○ claude${RESET}"
fi

if command -v git >/dev/null 2>&1; then
  printf "   ${ORANGE}●${RESET} ${DIM}git${RESET}"
else
  printf "   ${DIM}○ git${RESET}"
fi
echo ""
echo ""

printf "  ${DIM}type ${WHITE}aios${DIM} to open the menu · ${WHITE}claude${DIM} for a fresh session${RESET}\n"
echo ""

# Hand off to interactive bash (replaces this rc-file shell with an interactive one).
PS1='\[\e[38;2;242;101;34m\]aios\[\e[0m\] \[\e[38;2;160;160;160m\]\w\[\e[0m\] $ '
export PS1
