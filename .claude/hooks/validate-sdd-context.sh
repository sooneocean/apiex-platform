#!/bin/bash
# Hook: PostToolUse on Edit|Write
# Purpose: Validate sdd_context.json invariants after write
# v3.0.0: 10 invariant rules (added Rule#9 failed_approaches, Rule#10 pipeline_cost)

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# 只對 sdd_context.json 生效
if [[ "$FILE_PATH" != *"sdd_context.json"* ]]; then
  exit 0
fi

# 從磁碟讀取（同時支援 Write 和 Edit 觸發）
if [ ! -f "$FILE_PATH" ]; then
  exit 0
fi

CONTENT=$(cat "$FILE_PATH")

# 前置驗證：確認合法 JSON
if ! echo "$CONTENT" | jq empty 2>/dev/null; then
  echo "[SDD Invariant Warning] Failed to parse $FILE_PATH as valid JSON"
  exit 0
fi

WARNINGS=""

# 偵測版本以決定驗證範圍
VERSION=$(echo "$CONTENT" | jq -r '.sdd_context.version // "2.4.0"')
MAJOR_MINOR=$(echo "$VERSION" | sed 's/\.[0-9]*$//')

# 正規化 conclusion 為小寫
CONCLUSION=$(echo "$CONTENT" | jq -r '.sdd_context.stages.s5.output.conclusion // empty' | tr '[:upper:]' '[:lower:]')
BLOCKING_COUNT=$(echo "$CONTENT" | jq '(.sdd_context.stages.s5.output.blocking_fixes // []) | length')

# Rule 1: 非阻斷結論 + blocking_fixes 非空（pass/conditional_pass 不應有 blocking）
if [[ "$CONCLUSION" == "pass" || "$CONCLUSION" == "conditional_pass" ]] && [ "$BLOCKING_COUNT" -gt 0 ] 2>/dev/null; then
  WARNINGS+="[SDD Invariant Warning] Rule#1: conclusion=$CONCLUSION but blocking_fixes has $BLOCKING_COUNT items. Should be empty when passed.\n"
fi

# Rule 2: 阻斷結論 + blocking_fixes 空（fix_required/redesign_required 必須有 blocking）
if [[ "$CONCLUSION" == "fix_required" || "$CONCLUSION" == "redesign_required" ]] && [ "$BLOCKING_COUNT" -eq 0 ] 2>/dev/null; then
  WARNINGS+="[SDD Invariant Warning] Rule#2: conclusion=$CONCLUSION but blocking_fixes is empty. Should have blocking issues.\n"
fi

# Rule 3: repair_loop_count > 3（stage 層級，fallback output 層級）
LOOP_COUNT=$(echo "$CONTENT" | jq '.sdd_context.stages.s5.repair_loop_count // .sdd_context.stages.s5.output.repair_loop_count // 0')
if [ "$LOOP_COUNT" -gt 3 ] 2>/dev/null; then
  WARNINGS+="[SDD Invariant Warning] Rule#3: repair_loop_count=$LOOP_COUNT exceeds safety valve limit (max 3).\n"
fi

# Rule 4: S6/S7 without S5 pass
CURRENT_STAGE=$(echo "$CONTENT" | jq -r '.sdd_context.current_stage // empty' | tr '[:upper:]' '[:lower:]')
if [[ "$CURRENT_STAGE" == "s6" || "$CURRENT_STAGE" == "s7" ]]; then
  if [ "$CONCLUSION" != "pass" ] && [ -n "$CONCLUSION" ]; then
    WARNINGS+="[SDD Invariant Warning] Rule#4: current_stage=$CURRENT_STAGE but s5.conclusion=$CONCLUSION (expected pass).\n"
  fi
fi

# Rule 5 & 6: 僅 v2.5.0+ 驗證
if [[ "$VERSION" == "2.5.0" ]] || [[ "$MAJOR_MINOR" > "2.4" ]]; then
  # Rule 5: work_type_revised != null → work_type == "investigation"
  WORK_TYPE_REVISED=$(echo "$CONTENT" | jq -r '.sdd_context.work_type_revised // empty')
  WORK_TYPE=$(echo "$CONTENT" | jq -r '.sdd_context.work_type // empty')
  if [ -n "$WORK_TYPE_REVISED" ] && [ "$WORK_TYPE" != "investigation" ]; then
    WARNINGS+="[SDD Invariant Warning] Rule#5: work_type_revised=$WORK_TYPE_REVISED but work_type=$WORK_TYPE (expected investigation).\n"
  fi

  # Rule 6: completed_at != null → status == "completed"
  COMPLETED_AT=$(echo "$CONTENT" | jq -r '.sdd_context.completed_at // empty')
  STATUS=$(echo "$CONTENT" | jq -r '.sdd_context.status // empty')
  if [ -n "$COMPLETED_AT" ] && [ "$STATUS" != "completed" ]; then
    WARNINGS+="[SDD Invariant Warning] Rule#6: completed_at=$COMPLETED_AT but status=$STATUS (expected completed).\n"
  fi
fi

# Rule 7: audit_id uniqueness (v2.7.0+)
if [[ "$MAJOR_MINOR" > "2.6" ]] || [[ "$VERSION" == "2.7.0" ]]; then
  AUDIT_IDS=$(echo "$CONTENT" | jq '[.sdd_context.audit_history // [] | .[].audit_id] | length')
  UNIQUE_IDS=$(echo "$CONTENT" | jq '[.sdd_context.audit_history // [] | .[].audit_id] | unique | length')
  if [[ "$AUDIT_IDS" != "$UNIQUE_IDS" ]] 2>/dev/null; then
    WARNINGS+="[SDD Invariant Warning] Rule#7: audit_history contains duplicate audit_ids ($AUDIT_IDS total, $UNIQUE_IDS unique).\n"
  fi
fi

# Rule 8: TDD evidence completeness (v2.8.0+)
if [[ "$MAJOR_MINOR" > "2.7" ]] || [[ "$VERSION" == "2.8.0" ]]; then
  TASKS_WITHOUT_TDD=$(echo "$CONTENT" | jq '[.sdd_context.stages.s4.output.completed_tasks // [] | .[] | select(.tdd_evidence == null)] | length')
  if [ "$TASKS_WITHOUT_TDD" -gt 0 ] 2>/dev/null; then
    WARNINGS+="[SDD Invariant Warning] Rule#8: $TASKS_WITHOUT_TDD completed tasks in S4 lack tdd_evidence.\n"
  fi
fi

# Rule 9: failed_approaches format validation (v3.0.0+)
if [[ "$MAJOR_MINOR" > "2.8" ]] || [[ "$VERSION" =~ ^3\. ]]; then
  # Validate top-level failed_approaches format
  INVALID_FA=$(echo "$CONTENT" | jq '[.sdd_context.failed_approaches // [] | .[] | select(.approach == null or .reason == null or .timestamp == null)] | length')
  if [ "$INVALID_FA" -gt 0 ] 2>/dev/null; then
    WARNINGS+="[SDD Invariant Warning] Rule#9: $INVALID_FA top-level failed_approaches entries missing required fields (approach, reason, timestamp).\n"
  fi

  # Validate stage-level failed_approaches
  for stage in s1 s4 s5 s6; do
    STAGE_INVALID=$(echo "$CONTENT" | jq "[.sdd_context.stages.${stage}.output.failed_approaches // [] | .[] | select(.approach == null or .reason == null or .timestamp == null)] | length")
    if [ "$STAGE_INVALID" -gt 0 ] 2>/dev/null; then
      WARNINGS+="[SDD Invariant Warning] Rule#9: ${stage} has $STAGE_INVALID failed_approaches entries missing required fields.\n"
    fi
  done
fi

# Rule 10: pipeline_cost consistency (v3.0.0+)
if [[ "$MAJOR_MINOR" > "2.8" ]] || [[ "$VERSION" =~ ^3\. ]]; then
  PIPELINE_STATUS=$(echo "$CONTENT" | jq -r '.sdd_context.status // empty')
  PIPELINE_COST=$(echo "$CONTENT" | jq '.sdd_context.pipeline_cost.total_usd // null')
  if [[ "$PIPELINE_STATUS" == "completed" ]] && [[ "$PIPELINE_COST" == "null" || "$PIPELINE_COST" == "0" ]]; then
    WARNINGS+="[SDD Invariant Warning] Rule#10: status=completed but pipeline_cost.total_usd is missing or zero.\n"
  fi
fi

if [ -n "$WARNINGS" ]; then
  echo -e "$WARNINGS"
fi

exit 0
