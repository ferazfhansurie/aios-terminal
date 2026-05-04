#!/bin/zsh
# ⌘Q confirmation. Bound from alacritty.toml — replaces the default Quit
# action so an accidental cmd+q doesn't nuke every workspace.

result=$(osascript <<'EOF' 2>/dev/null
tell application "System Events"
  activate
  display dialog "Close Adletic? All workspaces and Claude sessions will exit." buttons {"Cancel", "Close"} default button "Cancel" cancel button "Cancel" with icon caution with title "Quit Adletic"
end tell
EOF
)

if [[ "$result" == *"button returned:Close"* ]]; then
  osascript -e 'tell application "AIOS" to quit' 2>/dev/null
fi
