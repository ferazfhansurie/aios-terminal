#!/bin/zsh
# helpers/pricing.sh — given a model + input/output token counts, print USD cost.
# Usage: pricing.sh <model> <input_tokens> <output_tokens>

set -eu

MODEL="${1:?usage: pricing.sh <model> <in_toks> <out_toks>}"
IN_TOK="${2:?}"
OUT_TOK="${3:?}"

PRICING="$HOME/.config/adletic/pricing.toml"

# Extract input + output rates for this model from pricing.toml.
in_rate=$(awk -v m="[$MODEL]" '
  $0==m {found=1; next}
  found && /^\[/ {exit}
  found && /^input/ {gsub(/[^0-9.]/, ""); print; exit}
' "$PRICING")

out_rate=$(awk -v m="[$MODEL]" '
  $0==m {found=1; next}
  found && /^\[/ {exit}
  found && /^output/ {gsub(/[^0-9.]/, ""); print; exit}
' "$PRICING")

if [[ -z "$in_rate" || -z "$out_rate" ]]; then
  print -- "0"; exit 0
fi

# (in_tok / 1e6) * in_rate  +  (out_tok / 1e6) * out_rate
awk -v i="$IN_TOK" -v o="$OUT_TOK" -v ir="$in_rate" -v or="$out_rate" \
  'BEGIN { printf "%.4f\n", (i/1000000)*ir + (o/1000000)*or }'
