#!/bin/bash
# Hook: PostToolUse (all tools)
# Purpose: Log tool calls and periodically extract instincts via Haiku subagent
# Profile: standard+ (skipped in minimal)
#
# Flow:
#   1. Append tool call to JSONL log (fast, synchronous)
#   2. Every 25 calls, spawn background Haiku extraction
#   3. Instincts saved to project-scoped directory

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/hook-profile.sh"
check_hook "instinct-observer"

INPUT=$(cat)

SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty' 2>/dev/null)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // "unknown"' 2>/dev/null)
TOOL_INPUT=$(echo "$INPUT" | jq -c '.tool_input // {}' 2>/dev/null)
TOOL_OUTPUT=$(echo "$INPUT" | jq -r '.tool_output // empty' 2>/dev/null | head -c 500)

[[ -z "$SESSION_ID" ]] && exit 0

# Skip hook's own tool calls and trivial tools
case "$TOOL_NAME" in
  Bash|Read|Glob|Grep) ;; # Log these — they reveal patterns
  *) ;; # Log everything else too
esac

# Determine instincts directory (project-scoped by git remote hash)
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
GIT_HASH=$(cd "$PROJECT_DIR" && git remote get-url origin 2>/dev/null | md5 2>/dev/null | head -c 12 || echo "local")
INSTINCTS_DIR="${HOME}/.claude/instincts/${GIT_HASH}"
mkdir -p "$INSTINCTS_DIR"

# Append tool call to log
TOOL_LOG="$INSTINCTS_DIR/tool-log.jsonl"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
echo "{\"ts\":\"$TIMESTAMP\",\"sid\":\"$SESSION_ID\",\"tool\":\"$TOOL_NAME\",\"input\":$TOOL_INPUT}" >> "$TOOL_LOG" 2>/dev/null

# Track call count for extraction trigger
STATE_FILE="/tmp/.claude_instinct_${SESSION_ID}"
CALLS=0
if [[ -f "$STATE_FILE" ]]; then
  CALLS=$(cat "$STATE_FILE" 2>/dev/null || echo 0)
fi
CALLS=$((CALLS + 1))
echo "$CALLS" > "$STATE_FILE"

# Every 25 calls, trigger extraction (background, non-blocking)
if [[ $((CALLS % 25)) -eq 0 ]] && command -v claude >/dev/null 2>&1; then
  INSTINCT_FILE="$INSTINCTS_DIR/instincts.jsonl"
  RECENT_LOG=$(tail -25 "$TOOL_LOG" 2>/dev/null)

  # Spawn background Haiku extraction
  (
    PROMPT="Analyze these 25 recent tool calls and extract 0-3 reusable development instincts (patterns/habits). Each instinct should be an atomic, actionable behavior pattern. Output ONLY valid JSONL, one line per instinct: {\"id\":\"INS-XXX\",\"pattern\":\"description\",\"confidence\":0.0-1.0,\"category\":\"code|test|debug|refactor|explore\"}. If no meaningful patterns found, output nothing."

    RESULT=$(echo "$RECENT_LOG" | claude -p --model haiku "$PROMPT" 2>/dev/null || true)

    if [[ -n "$RESULT" ]]; then
      echo "$RESULT" | while IFS= read -r line; do
        # Validate JSON before appending
        if echo "$line" | jq empty 2>/dev/null; then
          echo "$line" >> "$INSTINCT_FILE"
        fi
      done
    fi
  ) &
fi

exit 0
