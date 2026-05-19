#!/usr/bin/env bash
# speak-stop.sh — kill any in-flight macOS `say` process.
pkill -x say 2>/dev/null || true
exit 0
