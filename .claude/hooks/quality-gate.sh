#!/bin/bash
# Hook: PostToolUse on Edit|Write
# Purpose: Auto-lint/format files after edit, report unfixed violations
# Profile: standard+ (skipped in minimal)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/lib/hook-profile.sh"
check_hook "quality-gate"

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Skip if no file path
[[ -z "$FILE_PATH" ]] && exit 0

# Skip non-code files
case "$FILE_PATH" in
  *.md|*.json|*.yaml|*.yml|*.toml|*.txt|*.html|*.css|*.svg|*.png|*.jpg|*.gif)
    exit 0 ;;
esac

# Skip if file doesn't exist (deleted)
[[ ! -f "$FILE_PATH" ]] && exit 0

# Detect project root
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"

# Source project detection
source "$SCRIPT_DIR/lib/project-detect.sh"

# Get linter command
LINTER_CMD=$(detect_linter_command "$PROJECT_DIR")
if [[ -z "$LINTER_CMD" ]]; then
  exit 0
fi

# Run linter on the specific file
RESULT=$(cd "$PROJECT_DIR" && eval "$LINTER_CMD" "$FILE_PATH" 2>&1) || true
EXIT_CODE=$?

if [[ $EXIT_CODE -ne 0 ]] && [[ -n "$RESULT" ]]; then
  # Only show first 10 lines to avoid noise
  TRUNCATED=$(echo "$RESULT" | head -10)
  LINE_COUNT=$(echo "$RESULT" | wc -l | tr -d ' ')
  MSG="[QUALITY-GATE] Auto-format applied to $(basename "$FILE_PATH")."
  if [[ $LINE_COUNT -gt 10 ]]; then
    MSG+=" ($LINE_COUNT issues found, showing first 10)"
  fi
  echo "$MSG"
fi

exit 0
