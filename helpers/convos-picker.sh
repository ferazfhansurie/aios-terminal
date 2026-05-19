#!/usr/bin/env bash
# convos-picker.sh — fzf over your claude.ai conversations.
# Enter: open in default browser (claude.ai/chat/<uuid>).
# Ctrl-N: open the new-chat page.
# Auth via the same decrypted-cookie path used by claude-usage-fetch.py.

set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

LIST=$(python3 - <<'PY'
import subprocess, sqlite3, os, re, sys, json, urllib.request
from datetime import datetime, timezone
from Crypto.Cipher import AES; from Crypto.Protocol.KDF import PBKDF2

pw = subprocess.run(['security','find-generic-password','-w','-s','Claude Safe Storage'],
                    capture_output=True, text=True).stdout.strip()
key = PBKDF2(pw, b'saltysalt', dkLen=16, count=1003)
def dec(e):
    p = e[3:] if e[:3]==b'v10' else e
    pl = AES.new(key, AES.MODE_CBC, IV=b' '*16).decrypt(p)
    pad = pl[-1]
    if 1<=pad<=16 and pl[-pad:]==bytes([pad])*pad: pl=pl[:-pad]
    return pl[32:].decode('utf-8', errors='replace') if len(pl)>32 else pl.decode('utf-8', errors='replace')

c = {}
for n,_,e in sqlite3.connect(os.path.expanduser('~/Library/Application Support/Claude/Cookies')).execute(
        "SELECT name,host_key,encrypted_value FROM cookies WHERE host_key LIKE '%claude.ai%'"):
    if e:
        try: c[n] = dec(e)
        except Exception: pass

org = re.search(r'([0-9a-f-]{36})', c.get('lastActiveOrg','')).group(1)
ck = '; '.join(f'{k}={v}' for k,v in c.items() if v and v.isprintable())
url = f'https://claude.ai/api/organizations/{org}/chat_conversations?limit=100'
req = urllib.request.Request(url, headers={
    'Cookie': ck, 'Accept': 'application/json',
    'Referer': 'https://claude.ai/',
    'anthropic-client-platform': 'web_claude_ai',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'})
try:
    data = json.load(urllib.request.urlopen(req, timeout=10))
except Exception as e:
    print(f"ERR\t\tcould not fetch: {e}", file=sys.stderr)
    sys.exit(1)

now = datetime.now(timezone.utc)
def relative(iso):
    try:
        t = datetime.fromisoformat(iso.replace('Z','+00:00'))
        d = (now - t).total_seconds()
        if d < 3600: return f"{int(d/60)}m"
        if d < 86400: return f"{int(d/3600)}h"
        if d < 86400*30: return f"{int(d/86400)}d"
        return t.date().isoformat()
    except Exception: return ""

for conv in data:
    uuid = conv.get('uuid','')
    name = (conv.get('name') or '(untitled)').replace('\n',' ').strip()[:80]
    when = relative(conv.get('updated_at',''))
    model = (conv.get('model') or '').replace('claude-','')
    print(f"{uuid}\t{when}\t{model}\t{name}")
PY
) || { tmux display-message "convos: fetch failed (see stderr)"; exit 1; }

[[ -z "$LIST" ]] && { tmux display-message "no conversations"; exit 0; }

# Pretty-print columns, then fzf. Hidden uuid in col 1 used to open.
RESULT=$(printf '%s\n' "$LIST" \
  | awk -F'\t' '{ printf "%-6s %-10s %s\t%s\n", $2, $3, $4, $1 }' \
  | fzf --prompt 'convo> ' \
        --header 'enter=open · ctrl-n=new chat · esc=cancel' \
        --delimiter='\t' --with-nth=1 --accept-nth=2 \
        --no-mouse --reverse \
        --expect=ctrl-n) || exit 0

KEY=$(printf '%s' "$RESULT" | sed -n '1p')
UUID=$(printf '%s' "$RESULT" | sed -n '2p')

if [[ "$KEY" == "ctrl-n" ]]; then
  open "https://claude.ai/new"
  exit 0
fi
[[ -n "$UUID" ]] && open "https://claude.ai/chat/$UUID"
