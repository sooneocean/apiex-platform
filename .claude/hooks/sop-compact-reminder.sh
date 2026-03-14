#!/bin/bash
# Hook: SessionStart on compact
# Purpose: Re-inject SOP persistent state after context window compaction
#
# Strategy: Don't tell Claude to "go read files" — inject the actual data
# so it's guaranteed to be in context after compaction.
#
# Size guard: If sdd_context.json > 50KB, only inject key fields.
# Multi-SOP: If multiple in_progress found, list all for user to choose.

INPUT=$(cat)
PROJECT_DIR=$(echo "$INPUT" | jq -r '.cwd // "."' 2>/dev/null)
[ -z "$PROJECT_DIR" ] && PROJECT_DIR="."

MAX_JSON_SIZE=51200  # 50KB threshold

# ══════════════════════════════════════
# 1. Collect all active SDD Contexts
# ══════════════════════════════════════
ACTIVE_CONTEXTS=()   # array of "source|path"

# Unified: Quick & Full Spec all under dev/specs/*/sdd_context.json
for f in $(ls -td "$PROJECT_DIR"/dev/specs/*/sdd_context.json 2>/dev/null); do
  [ -f "$f" ] || continue
  STATUS=$(jq -r '.sdd_context.status // empty' "$f" 2>/dev/null)
  SPEC_MODE=$(jq -r '.sdd_context.spec_mode // "unknown"' "$f" 2>/dev/null)
  if [ "$STATUS" = "in_progress" ]; then
    # Capitalize spec_mode for display: "quick" → "Quick", "full" → "Full Spec"
    case "$SPEC_MODE" in
      quick) SOURCE="Quick" ;;
      full)  SOURCE="Full Spec" ;;
      *)     SOURCE="$SPEC_MODE" ;;
    esac
    ACTIVE_CONTEXTS+=("$SOURCE|$f")
  fi
done

# ══════════════════════════════════════
# 2. Helper: output one SDD Context
# ══════════════════════════════════════
output_sdd_context() {
  local SOURCE="$1"
  local CTX_PATH="$2"

  # Validate JSON
  if ! jq empty "$CTX_PATH" 2>/dev/null; then
    echo "⚠️ JSON 格式損壞，無法解析: $CTX_PATH"
    echo "請手動讀取檔案確認狀態: \`Read $CTX_PATH\`"
    return
  fi

  local FEATURE=$(jq -r '.sdd_context.feature // "unknown"' "$CTX_PATH")
  local STAGE=$(jq -r '.sdd_context.current_stage // "unknown"' "$CTX_PATH")
  local SPEC_MODE=$(jq -r '.sdd_context.spec_mode // "unknown"' "$CTX_PATH")
  local SPEC_FOLDER=$(jq -r '.sdd_context.spec_folder // ""' "$CTX_PATH")
  local LAST_UPDATED=$(jq -r '.sdd_context.last_updated // ""' "$CTX_PATH")
  local FILE_SIZE=$(wc -c < "$CTX_PATH" 2>/dev/null | tr -d ' ')

  echo "## 當前 SOP 狀態"
  echo "- Feature: $FEATURE"
  echo "- Stage: $STAGE"
  echo "- Spec Mode: $SPEC_MODE"
  echo "- Source: $SOURCE ($CTX_PATH)"
  echo "- Last Updated: $LAST_UPDATED"
  [ -n "$SPEC_FOLDER" ] && echo "- Spec Folder: $SPEC_FOLDER"
  echo ""

  # Stage status summary
  echo "## Stage 進度"
  jq -r '
    .sdd_context.stages | to_entries[] |
    select(.value.status != null and .value.status != "pending") |
    "- \(.key | ascii_upcase): \(.value.status) (\(if .value.agent then .value.agent elif .value.agents then (.value.agents | join(", ")) else "—" end))"
  ' "$CTX_PATH" 2>/dev/null
  echo ""

  # Full JSON or key-fields-only based on size
  if [ "$FILE_SIZE" -gt "$MAX_JSON_SIZE" ] 2>/dev/null; then
    echo "## SDD Context 關鍵欄位（完整檔案 >50KB，已精簡）"
    jq '{
      sdd_context: {
        version: .sdd_context.version,
        feature: .sdd_context.feature,
        current_stage: .sdd_context.current_stage,
        spec_mode: .sdd_context.spec_mode,
        spec_folder: .sdd_context.spec_folder,
        status: .sdd_context.status,
        current_stage_output: .sdd_context.stages[
          .sdd_context.current_stage | split(" ")[0] | ascii_downcase
        ].output
      }
    }' "$CTX_PATH" 2>/dev/null
    echo ""
    echo "完整檔案路徑: \`$CTX_PATH\`（如需完整內容請用 Read tool 讀取）"
  else
    echo "## SDD Context 完整內容"
    jq '.' "$CTX_PATH" 2>/dev/null
  fi
  echo ""

  # ── Stale Detection ──
  local STALE_WARNINGS=""
  for stage_key in s0 s1 s2 s3 s4 s5 s6 s7; do
    local STAGE_UPPER=$(echo "$stage_key" | tr 'a-z' 'A-Z')
    local STAGE_STATUS=$(jq -r ".sdd_context.stages.${stage_key}.status // \"pending\"" "$CTX_PATH" 2>/dev/null)

    # If current_stage points to this stage but status is still "pending"
    if [ "$STAGE" = "$STAGE_UPPER" ] && [ "$STAGE_STATUS" = "pending" ]; then
      STALE_WARNINGS="${STALE_WARNINGS}\n⚠️ STALE: current_stage=$STAGE 但 stages.${stage_key}.status=pending（Agent 可能未完成持久化）"
    fi
  done

  if [ -n "$STALE_WARNINGS" ]; then
    echo "## ⚠️ Stale Detection 警告"
    echo -e "$STALE_WARNINGS"
    echo ""
    echo "建議：讀取 sdd_context.json 確認實際狀態，必要時手動修正。"
    echo ""
  fi

  # List spec folder .md files
  if [ -n "$SPEC_FOLDER" ] && [ -d "$PROJECT_DIR/$SPEC_FOLDER" ]; then
    local MD_FILES=$(ls "$PROJECT_DIR/$SPEC_FOLDER"/*.md 2>/dev/null)
    if [ -n "$MD_FILES" ]; then
      echo "## 相關 Spec 檔案"
      for md in $MD_FILES; do
        echo "- $(basename "$md") → \`$SPEC_FOLDER/$(basename "$md")\`"
      done
      echo ""
    fi
  fi

  # Stage-specific recovery hints
  echo "## 強制恢復指令"
  echo "1. 你正在 **$STAGE** 階段，必須從這個階段繼續"
  echo "2. 執行前先讀取上方 SDD Context 的 output 欄位了解前序階段成果"

  case "$STAGE" in
    S4)
      echo "3. 檢查 stages.s4.output.completed_tasks 確認已完成哪些任務"
      echo "4. 對照 stages.s3.output.waves 確認剩餘任務"
      ;;
    S5)
      echo "3. 讀取 stages.s4.output.changes 了解實作內容"
      echo "4. 執行 Scoped Code Review（/code-review s5）"
      ;;
    S6)
      echo "3. 讀取 stages.s5.output 了解 review 結論"
      echo "4. 檢查 repair_loop_count 確認是否還有修復配額"
      ;;
    S1)
      PHASES=$(jq -r '.sdd_context.stages.s1.output.completed_phases // [] | length' "$CTX_PATH" 2>/dev/null)
      if [ "$PHASES" = "1" ]; then
        echo "3. S1 Phase 1 已完成，需從 Phase 2（architect）繼續"
      else
        echo "3. S1 從 Phase 1（codebase-explorer）開始"
      fi
      ;;
    S0|S2|S3)
      echo "3. 呼叫對應的 Skill 繼續此階段"
      ;;
  esac

  echo "5. 遵守 CLAUDE.md 所有規則"
  echo "6. 若需要更多 spec 細節，讀取上方列出的 .md 檔案路徑"
}

# ══════════════════════════════════════
# 3. Git branch
# ══════════════════════════════════════
GIT_BRANCH=$(git -C "$PROJECT_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")

# ══════════════════════════════════════
# 4. Main output
# ══════════════════════════════════════
echo "[SOP Context Recovery — Auto-injected]"
echo ""
echo "⚠️ MANDATORY: 對話已壓縮。以下是從 SDD Context 自動恢復的狀態，你必須基於此狀態繼續工作。"
echo ""
echo "Branch: $GIT_BRANCH"
echo ""

ACTIVE_COUNT=${#ACTIVE_CONTEXTS[@]}

if [ "$ACTIVE_COUNT" -eq 0 ]; then
  # ── No active SOP ──
  echo "[Context Compacted — No Active SOP]"
  echo "目前沒有進行中的 SOP 管線。"
  echo ""
  echo "Recovery:"
  echo "1. Check TaskList for any in-progress tasks"
  echo "2. 新功能需求請啟動 S0（Skill: s0-understand）"
  echo "3. 遵守 CLAUDE.md 規則"

elif [ "$ACTIVE_COUNT" -eq 1 ]; then
  # ── Single active SOP ──
  IFS='|' read -r SOURCE CTX_PATH <<< "${ACTIVE_CONTEXTS[0]}"
  output_sdd_context "$SOURCE" "$CTX_PATH"

else
  # ── Multiple active SOPs ──
  echo "⚠️ 發現 $ACTIVE_COUNT 個進行中的 SOP，請用戶指定要恢復哪個："
  echo ""
  for i in "${!ACTIVE_CONTEXTS[@]}"; do
    IFS='|' read -r SOURCE CTX_PATH <<< "${ACTIVE_CONTEXTS[$i]}"
    FEATURE=$(jq -r '.sdd_context.feature // "unknown"' "$CTX_PATH" 2>/dev/null)
    STAGE=$(jq -r '.sdd_context.current_stage // "unknown"' "$CTX_PATH" 2>/dev/null)
    echo "$((i+1)). [$SOURCE] $FEATURE — Stage: $STAGE ($CTX_PATH)"
  done
  echo ""
  echo "請詢問用戶：「偵測到多個進行中的 SOP，你要繼續哪一個？」"
  echo ""
  # Still output the first one as default context
  echo "--- 以下預設顯示第一個 SOP 的完整狀態 ---"
  echo ""
  IFS='|' read -r SOURCE CTX_PATH <<< "${ACTIVE_CONTEXTS[0]}"
  output_sdd_context "$SOURCE" "$CTX_PATH"
fi

# ── Mandatory rules (always) ──
echo ""
echo "## 強制規則"
echo "- Skill→Agent dispatch: detect SOP need → invoke Skill → Skill dispatches Agent"
echo "- CLAUDE.md rules: no Dio(), use design system, WLScaffold for pages"
echo "- DB safety: never delete without 3x confirmation + backup"
echo "- Gate rules: S0→S1 必停(確認需求), S3→S4 必停(確認計畫)"
echo "- Loop safety: S4↔S5 max 3x, S4↔S6 max 3x"
echo "- 使用繁體中文回應"

exit 0
