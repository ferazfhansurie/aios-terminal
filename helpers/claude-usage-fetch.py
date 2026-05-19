#!/usr/bin/env python3
"""claude-usage-fetch.py — pull live claude.ai dashboard numbers.

Reads Claude Desktop's encrypted cookie store, decrypts via the macOS
keychain ("Claude Safe Storage" / PBKDF2-saltysalt-1003), then GETs:

  /api/organizations/{uuid}/usage       → 5h / 7d / sonnet / design %
  /api/organizations/{uuid}/rate_limits → plan tier (e.g. claude_max_20x)

Writes:
  ~/.cache/adletic/claude-usage.json   raw payload
  ~/.cache/adletic/claude-usage.txt    pre-formatted tmux fragment
"""
import json
import os
import re
import sqlite3
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

try:
    from Crypto.Cipher import AES
    from Crypto.Protocol.KDF import PBKDF2
except ImportError:
    sys.stderr.write("pycryptodome missing — pip3 install pycryptodome\n")
    sys.exit(2)

CACHE = Path.home() / ".cache" / "adletic"
CACHE.mkdir(parents=True, exist_ok=True)
RAW = CACHE / "claude-usage.json"
OUT = CACHE / "claude-usage.txt"
COOKIES_DB = Path.home() / "Library/Application Support/Claude/Cookies"


def _cookies():
    pw = subprocess.run(
        ["security", "find-generic-password", "-w", "-s", "Claude Safe Storage"],
        capture_output=True, text=True,
    ).stdout.strip()
    if not pw:
        raise RuntimeError("no Claude Safe Storage password in keychain")
    key = PBKDF2(pw, b"saltysalt", dkLen=16, count=1003)

    def dec(enc: bytes) -> str:
        payload = enc[3:] if enc[:3] == b"v10" else enc
        plain = AES.new(key, AES.MODE_CBC, IV=b" " * 16).decrypt(payload)
        pad = plain[-1]
        if 1 <= pad <= 16 and plain[-pad:] == bytes([pad]) * pad:
            plain = plain[:-pad]
        if len(plain) > 32:
            plain = plain[32:]
        return plain.decode("utf-8", errors="replace")

    out = {}
    for name, _h, enc in sqlite3.connect(COOKIES_DB).execute(
        "SELECT name,host_key,encrypted_value FROM cookies WHERE host_key LIKE '%claude.ai%'"
    ):
        if enc:
            try:
                out[name] = dec(enc)
            except Exception:
                pass
    return out


def _color(pct: float) -> str:
    if pct >= 90: return "#ef4444"
    if pct >= 70: return "#f26522"
    if pct >= 50: return "#fbbf24"
    return "#a0a0a0"


def _countdown(iso: str) -> str:
    if not iso:
        return ""
    try:
        t = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        delta = t - datetime.now(timezone.utc)
        secs = max(int(delta.total_seconds()), 0)
        if secs == 0: return "now"
        d, secs = divmod(secs, 86400)
        h, secs = divmod(secs, 3600)
        m, _ = divmod(secs, 60)
        if d:
            return f"{d}d {h}h"
        if h:
            return f"{h}h {m}m"
        return f"{m}m"
    except Exception:
        return ""


def _tier_label(rate_limits: dict) -> str:
    tier = (rate_limits or {}).get("rate_limit_tier") or ""
    # default_claude_max_20x → Max 20x
    m = re.search(r"max[_ ]?(\d+x)", tier, re.I)
    if m:
        return f"Max {m.group(1)}"
    if "pro" in tier.lower():
        return "Pro"
    if "team" in tier.lower():
        return "Team"
    return tier.replace("_", " ").title() if tier else ""


def _request(url, hdr):
    req = urllib.request.Request(url, headers=hdr)
    with urllib.request.urlopen(req, timeout=8) as r:
        return json.loads(r.read())


def fetch():
    cookies = _cookies()
    sess = cookies.get("sessionKey", "")
    if not sess or not sess.startswith("sk-"):
        raise RuntimeError(f"sessionKey decrypt failed (got {sess[:8]!r})")
    org_raw = cookies.get("lastActiveOrg", "")
    m = re.search(r"([0-9a-f-]{36})", org_raw)
    if not m:
        raise RuntimeError("no org uuid")
    org_id = m.group(1)

    cookie_hdr = "; ".join(f"{k}={v}" for k, v in cookies.items() if v and v.isprintable())
    hdr = {
        "Cookie": cookie_hdr,
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Claude/1.0",
        "Accept": "application/json, text/plain, */*",
        "Referer": "https://claude.ai/settings/usage",
        "anthropic-client-platform": "web_claude_ai",
    }

    base = f"https://claude.ai/api/organizations/{org_id}"
    usage = _request(f"{base}/usage", hdr)
    try:
        rate = _request(f"{base}/rate_limits", hdr)
    except Exception:
        rate = {}

    payload = {"org_id": org_id, "usage": usage, "rate_limits": rate}
    RAW.write_text(json.dumps(payload, indent=2))

    plan = _tier_label(rate)

    def chip(label, key, *, hide_zero=False):
        block = usage.get(key) or {}
        u = block.get("utilization")
        if u is None:
            return None
        pct = int(round(u))
        if hide_zero and pct == 0:
            return None
        cd = _countdown(block.get("resets_at", ""))
        cd_part = f" #[fg=#555555]({cd})" if cd else ""
        return f"#[fg={_color(pct)}]{label} {pct}%{cd_part}"

    # Primary: 5h + 7d (always shown). Niche: sonnet + design (hide at 0%).
    chips = [
        chip("5h", "five_hour"),
        chip("7d", "seven_day"),
        chip("son", "seven_day_sonnet", hide_zero=True),
        chip("dsn", "seven_day_omelette", hide_zero=True),
    ]
    chips = [c for c in chips if c]

    plan_seg = f"#[fg=#f26522,bold]{plan}#[default]" if plan else ""
    sep = "#[fg=#444444] · #[default]"
    parts = [plan_seg] + chips if plan_seg else chips
    text = sep.join(parts) + "#[default]"
    OUT.write_text(text)
    print(text)


if __name__ == "__main__":
    try:
        fetch()
    except Exception as e:
        sys.stderr.write(f"claude-usage-fetch error: {type(e).__name__}: {e}\n")
        sys.exit(1)
