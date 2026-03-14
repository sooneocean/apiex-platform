#!/bin/bash
# SessionStart hook: regenerate manifest + Codex skill adapters if .claude/ files changed
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
MANIFEST="$PROJECT_DIR/.claude/manifest.json"

# Check if any .claude/ asset is newer than manifest
if [ ! -f "$MANIFEST" ] || \
   [ -n "$(find "$PROJECT_DIR/.claude/commands" "$PROJECT_DIR/.claude/agents" \
           "$PROJECT_DIR/.claude/references" "$PROJECT_DIR/.claude/skills" \
           "$PROJECT_DIR/.claude/hooks" \
           -newer "$MANIFEST" \( -name '*.md' -o -name '*.sh' \) 2>/dev/null | head -1)" ]; then
  python3 "$PROJECT_DIR/scripts/generate_manifest.py" --project-dir "$PROJECT_DIR" 2>/dev/null || true
  # Sync Codex skill adapters after manifest update
  if [ -f "$PROJECT_DIR/scripts/generate-codex-skill-adapters.sh" ]; then
    bash "$PROJECT_DIR/scripts/generate-codex-skill-adapters.sh" "$PROJECT_DIR" 2>/dev/null || true
  fi
fi
