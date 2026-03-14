#!/bin/bash
# Hook: PreToolUse (all tools)
# Purpose: Track tool call count and suggest /compact at logical intervals
# Profile: standard+ (skipped in minimal)
#
# Strategy:
#   - Count tool calls per session
#   - Suggest /compact every ~50 calls (configurable)
#   - Mark SOP stage completions as ideal compact points
#   - Complement context-guard (size-based) with count-based awareness

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/hook-profile.sh"
check_hook "strategic-compact"

INPUT=$(cat)

SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty' 2>/dev/null)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // "unknown"' 2>/dev/null)

[[ -z "$SESSION_ID" ]] && exit 0

# State file
STATE_FILE="/tmp/.claude_strategic_compact_${SESSION_ID}"
CALLS=0
LAST_SUGGESTED=0
if [[ -f "$STATE_FILE" ]]; then
  CALLS=$(sed -n '1p' "$STATE_FILE" 2>/dev/null || echo 0)
  LAST_SUGGESTED=$(sed -n '2p' "$STATE_FILE" 2>/dev/null || echo 0)
fi
CALLS=$((CALLS + 1))

# Suggest interval (every ~50 calls since last suggestion)
INTERVAL=50
SINCE_LAST=$((CALLS - LAST_SUGGESTED))

if [[ $SINCE_LAST -ge $INTERVAL ]]; then
  echo "[STRATEGIC-COMPACT] ${CALLS} tool calls in this session. Consider running /compact to optimize context usage."
  echo "  Tip: SDD Context, CLAUDE.md, and git state survive compaction. Reasoning and conversation history do not."
  LAST_SUGGESTED=$CALLS
fi

# Persist state
printf "%d\n%d\n" "$CALLS" "$LAST_SUGGESTED" > "$STATE_FILE"

exit 0
