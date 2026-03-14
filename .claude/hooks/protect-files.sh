#!/bin/bash
# Hook: PreToolUse on Edit|Write
# Purpose: Block modifications to protected files (secrets, linter configs, user-declared)
# Protection layers:
#   1. Hardcoded: .env (always blocked)
#   2. Auto-detected: linter/formatter config files (from quality-gate detection)
#   3. User-declared: CLAUDE.md protected_files list

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# If no file_path, skip
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

BASENAME=$(basename "$FILE_PATH")
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"

# Layer 1: Hardcoded .env protection (always active, regardless of profile)
if [ "$BASENAME" = ".env" ] || [[ "$BASENAME" == .env.* ]]; then
  echo "HOOK BLOCKED: '$FILE_PATH' is a protected .env file. This file should not be modified by Claude." >&2
  exit 2
fi

# Layer 2: Auto-detected linter config protection
if [[ -f "$SCRIPT_DIR/lib/project-detect.sh" ]]; then
  source "$SCRIPT_DIR/lib/project-detect.sh"
  LINTER_CONFIGS=$(detect_linter_config_files "$PROJECT_DIR")
  if [[ -n "$LINTER_CONFIGS" ]]; then
    while IFS= read -r config; do
      if [[ "$BASENAME" == "$config" ]] || [[ "$FILE_PATH" == *"/$config" ]]; then
        echo "HOOK BLOCKED: '$FILE_PATH' is a linter/formatter config file protected by quality-gate. Do not modify linter configs to suppress warnings — fix the code instead." >&2
        exit 2
      fi
    done <<< "$LINTER_CONFIGS"
  fi

  # Layer 3: User-declared protected files from CLAUDE.md
  DECLARED=$(get_declared_protected_files "$PROJECT_DIR")
  if [[ -n "$DECLARED" ]]; then
    while IFS= read -r protected; do
      if [[ "$BASENAME" == "$protected" ]] || [[ "$FILE_PATH" == *"/$protected" ]]; then
        echo "HOOK BLOCKED: '$FILE_PATH' is listed in CLAUDE.md protected_files." >&2
        exit 2
      fi
    done <<< "$DECLARED"
  fi
fi

exit 0
