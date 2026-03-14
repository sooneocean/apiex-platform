#!/bin/bash
# Hook: Stop (after each Claude response)
# Purpose: Track token usage and cost per response, warn on threshold breach
# Profile: standard+ (skipped in minimal)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/hook-profile.sh"
check_hook "cost-tracker"

INPUT=$(cat)

# Extract usage data from stop event
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty' 2>/dev/null)
MODEL=$(echo "$INPUT" | jq -r '.model // "unknown"' 2>/dev/null)
INPUT_TOKENS=$(echo "$INPUT" | jq -r '.usage.input_tokens // 0' 2>/dev/null)
OUTPUT_TOKENS=$(echo "$INPUT" | jq -r '.usage.output_tokens // 0' 2>/dev/null)

[[ -z "$SESSION_ID" ]] && exit 0

# Source cost model
source "$SCRIPT_DIR/lib/cost-model.sh"

# Calculate cost
COST=$(calculate_cost "$MODEL" "$INPUT_TOKENS" "$OUTPUT_TOKENS")

# Ensure metrics directory exists
METRICS_DIR=$(get_metrics_dir)
mkdir -p "$METRICS_DIR"

# Append JSONL record
COSTS_FILE=$(get_costs_file)
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
echo "{\"timestamp\":\"$TIMESTAMP\",\"session_id\":\"$SESSION_ID\",\"model\":\"$MODEL\",\"input_tokens\":$INPUT_TOKENS,\"output_tokens\":$OUTPUT_TOKENS,\"cost_usd\":$COST}" >> "$COSTS_FILE"

# Calculate session total
SESSION_TOTAL=$(grep "\"session_id\":\"$SESSION_ID\"" "$COSTS_FILE" 2>/dev/null | jq -s '[.[].cost_usd] | add // 0' 2>/dev/null || echo "0")

# Check thresholds
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
THRESHOLDS=$(source "$SCRIPT_DIR/lib/cost-model.sh" && get_cost_thresholds "$PROJECT_DIR")
IFS=',' read -ra LEVELS <<< "$THRESHOLDS"

# State file for warned level
STATE_FILE="/tmp/.claude_cost_tracker_${SESSION_ID}"
WARNED_LEVEL=0
if [[ -f "$STATE_FILE" ]]; then
  WARNED_LEVEL=$(cat "$STATE_FILE" 2>/dev/null || echo 0)
fi

# Determine warning level
CURRENT_LEVEL=0
for i in "${!LEVELS[@]}"; do
  THRESHOLD="${LEVELS[$i]}"
  if (( $(echo "$SESSION_TOTAL >= $THRESHOLD" | bc -l 2>/dev/null || echo 0) )); then
    CURRENT_LEVEL=$((i + 1))
  fi
done

# Persist warned level
echo "$CURRENT_LEVEL" > "$STATE_FILE"

# Warn only on level increase
if [[ $CURRENT_LEVEL -gt 0 ]] && [[ $CURRENT_LEVEL -gt $WARNED_LEVEL ]]; then
  case $CURRENT_LEVEL in
    1)
      echo "[COST-TRACKER] Session total: \$${SESSION_TOTAL} — 已超過 \$${LEVELS[0]} 閾值，注意成本。" ;;
    2)
      echo "[COST-TRACKER ⚠️] Session total: \$${SESSION_TOTAL} — 已超過 \$${LEVELS[1]} 閾值，建議控制操作規模。" ;;
    3)
      echo "[COST-TRACKER 🚨] Session total: \$${SESSION_TOTAL} — 已超過 \$${LEVELS[2]} 閾值！考慮切換至 sonnet 或縮小範圍。" ;;
  esac
fi

exit 0
