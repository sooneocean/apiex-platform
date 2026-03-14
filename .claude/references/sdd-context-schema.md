# SDD Context Schema v3.0.0（唯一真相）

> 本檔案是 SDD Context JSON 的**唯一定義**。所有 S-stage commands 和 agents 引用此處。

## 儲存路徑

| Spec Mode | 路徑 | 說明 |
|-----------|------|------|
| **Full Spec** | `{spec_folder}/sdd_context.json` | 與 spec 文件共存，永久保留 |
| **Quick** | `{spec_folder}/sdd_context.json` | 獨立資料夾，S7 完成後保留（`status: "completed"`） |

> **統一路徑**：Quick 與 Full Spec 都使用 `dev/specs/{YYYY-MM-DD}_{N}_{feature-name}/sdd_context.json`。
> Quick 資料夾內僅有 `sdd_context.json`，Full Spec 資料夾另含 spec .md 文件。
> 這允許多個 Quick SOP 同時並行，不再互相覆寫。

## 完整 JSON Schema

```json
{
  "sdd_context": {
    "version": "3.0.0",
    "feature": "功能名稱",
    "current_stage": "S0 | S1 | S2 | S3 | S4 | S5 | S6 | S7",
    "spec_mode": "full | quick",
    "spec_mode_reason": "判斷原因（如：bug fix, 單檔修改）",
    "work_type": "new_feature | refactor | bugfix | investigation（可選，預設 new_feature）",
    "work_type_revised": "new_feature | refactor | bugfix（可選，investigation 轉型時填入）",
    "spec_folder": "dev/specs/YYYY-MM-DD_N_feature-name（Full Spec 才有，N 為當日序號）",
    "execution_mode": "autopilot | semi-auto | manual（預設 autopilot，控制 Gate 行為）",
    "status": "in_progress | completed | cancelled",
    "started_at": "ISO8601",
    "last_updated": "ISO8601",
    "last_updated_by": "human | claude | codex（最後更新者）",
    "completed_at": "ISO8601（S7 完成時填入）",
    "stages": {
      "s0": {
        "status": "completed | in_progress | pending | pending_confirmation | skipped",
        "agent": "requirement-analyst",
        "started_at": "ISO8601",
        "completed_at": "ISO8601",
        "output": {
          "brief_spec_path": "dev/specs/{folder}/s0_brief_spec.md（Full Spec 才有）",
          "work_type": "new_feature | refactor | bugfix | investigation",
          "requirement": "核心需求描述",
          "goal": "目標",
          "success_criteria": ["標準1", "標準2"],
          "pain_points": ["痛點1"],
          "scope_in": ["範圍內項目"],
          "scope_out": ["範圍外項目"],
          "constraints": ["約束條件"],
          "frontend_design": {
            "flowchart_path": "dev/specs/{folder}/frontend/flowchart.html（可選，前端偵測通過時產出）",
            "wireframe_path": "dev/specs/{folder}/frontend/wireframe.html（可選，前端偵測通過時產出）",
            "mockup_path": "dev/specs/{folder}/frontend/mockup.html（可選，手動觸發 mockup skill 產出）"
          }
        }
      },
      "s1": {
        "_phase_guide": "Phase 1（codebase-explorer）產出：impact_scope, risks, unknowns, dependencies, tech_debt, regression_risks ║ Phase 2（architect）產出：dev_spec_path, tasks, acceptance_criteria, solution_summary, assumptions, work_type_revised",
        "status": "...",
        "agents": ["codebase-explorer", "architect"],
        "supporting_agents": ["sql-expert"],
        "output": {
          "completed_phases": [1, 2],
          "work_type_revised": "（可選）investigation 轉型後的實際類型",
          "dev_spec_path": "dev/specs/{folder}/s1_dev_spec.md（Full Spec 才有）",
          "impact_scope": {
            "frontend": ["檔案路徑"],
            "backend": ["檔案路徑"],
            "database": ["資料表"]
          },
          "tasks": [
            { "id": 1, "name": "任務名稱", "agent": "sql-expert", "dependencies": [], "complexity": "S", "dod": ["完成標準"] }
          ],
          "acceptance_criteria": [
            { "scenario": "場景名稱", "given": "前置條件", "when": "執行動作", "then": "預期結果" }
          ],
          "risks": [
            { "type": "技術風險", "level": "Medium", "description": "...", "mitigation": "..." }
          ],
          "unknowns": ["待確認項目"],
          "assumptions": ["假設"],
          "solution_summary": "技術方案摘要（architect Phase 2 產出）",
          "dependencies": {
            "upstream": ["上游依賴"],
            "downstream": ["下游依賴"]
          },
          "tech_debt": ["技術債項目"],
          "regression_risks": ["回歸風險項目"],
          "failed_approaches": [
            { "approach": "嘗試的方案描述", "reason": "失敗原因", "timestamp": "ISO8601" }
          ]
        }
      },
      "s2": {
        "status": "...",
        "agents": ["architect"],
        "started_at": "ISO8601",
        "completed_at": "ISO8601",
        "output": {
          "review_report_path": "dev/specs/{folder}/s2_review_report.md（Full Spec 才有）",
          "conclusion": "pass | conditional_pass | fail",
          "engine_used": "codex | opus_fallback（實際執行審查的引擎）",
          "r1_engine": "codex | opus_fallback",
          "short_circuit": "true | false（是否 Short-Circuit 通過）",
          "findings_summary": {
            "p0_maintained": 0,
            "p1_maintained": 0,
            "p2_maintained": 0,
            "dismissed": 0
          },
          "fixes_applied": ["修正描述1", "修正描述2（陣列，列出所有修正項目）"],
          "key_design_change": "關鍵設計變更描述（有重大修正時填入）",
          "reason": "Quick 模式跳過 S2（僅 skipped 時使用）"
        }
      },
      "s3": {
        "status": "...",
        "agent": "architect",
        "output": {
          "implementation_plan_path": "dev/specs/{folder}/s3_implementation_plan.md（Full Spec 才有）",
          "waves": [
            {
              "wave": 1,
              "name": "Foundation（可選，波次名稱）",
              "tasks": [
                { "id": 1, "name": "任務名稱", "agent": "sql-expert", "dependencies": [], "complexity": "S", "dod": ["完成標準"], "parallel": false, "affected_files": ["預期檔案"] }
              ],
              "parallel": "false | true | 描述（可選，波次並行策略）"
            }
          ],
          "total_tasks": 5,
          "estimated_waves": 5,
          "verification": {
            "static_analysis": ["fvm flutter analyze", "dotnet build"],
            "unit_tests": ["fvm flutter test", "dotnet test"]
          }
        }
      },
      "s4": {
        "status": "...",
        "agents": ["sql-expert", "dotnet-expert", "flutter-expert"],
        "output": {
          "implementation_plan_path": "...",
          "completed_tasks": [
            {
              "task_id": 1,
              "agent": "dotnet-expert",
              "tdd_evidence": {
                "red": {
                  "test_file": "tests/UserServiceTests.cs",
                  "test_command": "dotnet test --filter UserServiceTests",
                  "exit_code": 1,
                  "output_summary": "Failed: 1, Passed: 0",
                  "commit_hash": "a1b2c3d",
                  "timestamp": "ISO8601"
                },
                "green": {
                  "test_command": "dotnet test --filter UserServiceTests",
                  "exit_code": 0,
                  "output_summary": "Passed: 1, Failed: 0",
                  "commit_hash": "e4f5g6h",
                  "timestamp": "ISO8601"
                },
                "refactor": {
                  "commit_hash": "i7j8k9l（可選，null if no refactor）",
                  "test_still_passing": true,
                  "timestamp": "ISO8601"
                },
                "skipped": false,
                "skip_reason": "null | no_testable_logic | test_already_passing"
              },
              "mini_review": {
                "verdict": "pass | flag | skipped",
                "issues_count": 0,
                "dod_coverage": { "total": 3, "met": 3 }
              }
            }
          ],
          "progress": { "total": 5, "completed": 5, "in_progress": 0, "pending": 0, "completion_rate": "100%" },
          "changes": { "added": ["新增檔案"], "modified": ["修改檔案"], "deleted": [] },
          "build_status": { "flutter_analyze": "passed", "dotnet_build": "passed", "flutter_test": "passed", "dotnet_test": "passed" },
          "tdd_summary": {
            "total_tasks": 5,
            "tdd_completed": 4,
            "tdd_skipped": 1,
            "compliance_rate": "80%",
            "skip_reasons": { "no_testable_logic": 1 }
          },
          "failed_approaches": [
            { "approach": "嘗試的方案描述", "reason": "失敗原因", "timestamp": "ISO8601" }
          ]
        }
      },
      "s5": {
        "status": "in_progress | pending_confirmation | completed | fix_required | redesign_required",
        "agent": "reviewer",
        "repair_loop_count": "0（S4↔S5 安全閥計數器，stage 層級，非 output 內）",
        "started_at": "ISO8601",
        "completed_at": "ISO8601",
        "output": {
          "// — 報告（Full Spec 才有）—": "",
          "engine_used": "codex | opus_fallback（實際執行審查的引擎）",
          "review_report_path": "dev/specs/{folder}/s5_code_review_report.md | null",

          "// — 審查範圍 —": "",
          "review_scope": "scoped | full",
          "scoped_files": ["file1.dart", "file2.cs"],

          "// — 結論 —": "",
          "conclusion": "pass | conditional_pass | fix_required | redesign_required",
          "score": "3.5/5（string，允許小數+分母格式）",

          "// — 對抗式審查 metadata（v2.4.0 改為陣列；每個元素代表一次審查 session）—": "",
          "adversarial_review": [
            {
              "session_id": "20260213_143025",
              "r1_agent": "R1 Challenger agent/model",
              "r2_agent": "R2 Defender agent/model",
              "r3_agent": "R3 Arbiter agent/model",
              "r1_findings": { "p0": 0, "p1": 0, "p2": 0 },
              "r3_verdict": "pass | conditional_pass | fix_required | redesign_required",
              "blocking_found": ["CR-P1-001"],
              "resolved_by": ["Fix-1"]
            }
          ],

          "// — 問題統計（optional，v2.4.0+ 標註。目前 S5 Skill 未寫入；blocking_fixes/recommended_fixes/dismissed 陣列長度即為實質計數）—": "",
          "// 映射：p0+p1_blocking ≈ blocking_fixes.length, p1_recommended ≈ recommended_fixes.length, p2 可分佈於 recommended/dismissed, dismissed = dismissed.length": "",
          "issues": {
            "p0": 0,
            "p1_blocking": 0,
            "p1_recommended": 0,
            "p2": 0,
            "dismissed": 0
          },

          "// — 問題詳情（R3 裁決後的最終清單，按行動分類）—": "",
          "blocking_fixes": [
            {
              "id": "CR-P1-001",
              "description": "問題描述",
              "file": "path/to/file.cs（可選）",
              "line": "42（可選）",
              "fix": "修正描述",
              "r2_response": "接受 | 部分接受",
              "r3_verdict": "維持 P1"
            }
          ],
          "recommended_fixes": [
            {
              "id": "CR-P1-003",
              "description": "建議描述",
              "file": "path/to/file.cs（可選）",
              "line": "42（可選）",
              "fix": "修正描述",
              "r2_response": "部分接受",
              "r3_verdict": "P1 但不阻斷"
            }
          ],
          "dismissed": [
            {
              "id": "CR-P2-001",
              "description": "已駁回的問題",
              "r2_response": "反駁",
              "r3_verdict": "移除"
            }
          ],

          "// — 修正追蹤 —": "",
          "fixes_applied": ["修正描述1", "修正描述2"],

          "// — Spec 對照驗證（S5 Skill 自行執行，非 R1 職責）—": "",
          "spec_verification": {
            "s0_criteria": { "total": 8, "passed": 8, "partial": 0, "failed": 0 },
            "s1_scope_match": {
              "frontend": { "expected": 6, "actual": 6, "match": true },
              "backend": { "expected": 14, "actual": 14, "match": true },
              "database": { "expected": 2, "actual": 2, "match": true }
            },
            "s1_dod": { "total": 13, "passed": 13, "partial": 0, "failed": 0 },
            "issues": [
              {
                "id": "SC-S0-003",
                "source": "s0_criteria",
                "description": "S0 成功標準第 3 條未達成",
                "status": "failed",
                "evidence": "Grep 搜尋無對應實作"
              },
              {
                "id": "SC-SCOPE-FE",
                "source": "s1_scope",
                "description": "Frontend 多改 1 檔（scope creep）",
                "status": "partial",
                "evidence": "expected 6, actual 7"
              },
              {
                "id": "SC-DOD-06-02",
                "source": "s1_dod",
                "description": "Task 6 DoD 項 2 缺少測試涵蓋",
                "status": "failed",
                "evidence": "Grep test/ 無對應 TC"
              }
            ]
          },

          "// — Spec Audit 深度審計結果（可選，由 /spec-audit 命令 S5 整合模式寫入）—": "",
          "spec_audit": {
            "audit_id": "SA-{YYYY-MM-DDTHH-MM-SS}",
            "engine_status": "completed | degraded | unavailable",
            "dimensions": {
              "d1_frontend": { "total": 0, "passed": 0, "partial": 0, "failed": 0 },
              "d2_backend": { "total": 0, "passed": 0, "partial": 0, "failed": 0 },
              "d3_database": { "total": 0, "passed": 0, "partial": 0, "failed": 0 },
              "d4_user_flow": { "total": 0, "passed": 0, "partial": 0, "failed": 0 },
              "d5_business_logic": { "total": 0, "passed": 0, "partial": 0, "failed": 0 },
              "d6_test_coverage": { "total": 0, "passed": 0, "partial": 0, "failed": 0 }
            },
            "cross_validation": {
              "api_contract": { "total": 0, "consistent": 0, "inconsistent": 0 },
              "entity_table": { "total": 0, "consistent": 0, "inconsistent": 0 },
              "flow_edge_case": { "total": 0, "covered": 0, "orphan": 0 },
              "test_coverage": { "total": 0, "covered": 0, "missing": 0 }
            },
            "findings_summary": { "p0": 0, "p1": 0, "p2": 0, "total": 0 },
            "report_path": "dev/specs/{folder}/audit/spec_audit_report.md"
          },

          "// — 動作與迴圈 —": "",
          "next_action": { "action": "proceed | back_to_s4 | back_to_s1", "reason": "..." },
          "repair_history": [
            {
              "loop": 1,
              "trigger_issues": ["CR-P1-001"],
              "fixes_applied": ["修正描述"],
              "result": "fix_required | pass",
              "timestamp": "ISO8601"
            }
          ],
          "failed_approaches": [
            { "approach": "嘗試的方案描述", "reason": "失敗原因", "timestamp": "ISO8601" }
          ]
        }
      },
      "s6": {
        "status": "pending_confirmation | completed | in_progress | fix_required",
        "agent": "test-engineer",
        "output": {
          "tdd_audit": {
            "compliance_rate": "100%",
            "total_tasks": 5,
            "tdd_completed": 4,
            "tdd_skipped": 1,
            "invalid_skips": 0,
            "invalid_evidence": 0,
            "verdict": "pass | fail"
          },
          "acceptance_criteria": {
            "total": 4,
            "met": 4,
            "unmet": 0,
            "details": [
              { "ac_id": "AC-1", "description": "場景描述", "result": "pass | fail", "evidence": "驗證證據" }
            ]
          },
          "manual_test_checklist_path": "dev/specs/{folder}/s6_test_checklist.md | null",
          "e2e_tests": [ { "scenario": "正常流程", "result": "passed" } ],
          "integration_tests": {
            "triggered": true,
            "trigger_reason": "S4 變更涉及 Service/API",
            "total": 5,
            "passed": 4,
            "failed": 1,
            "skipped": 0,
            "test_file": "test path",
            "failure_classification": { "spec": 0, "dev": 1, "env": 0, "test": 0 }
          },
          "defects": { "total": 0, "fixed": 0, "pending": 0 },
          "repair_loop_count": 0,
          "recommendation": "proceed_to_s7 | user_decision",
          "verification_evidence": [
            { "test_type": "e2e | integration", "command": "exact command", "exit_code": 0, "output_summary": "...", "timestamp": "ISO8601" }
          ],
          "failed_approaches": [
            { "approach": "嘗試的方案描述", "reason": "失敗原因", "timestamp": "ISO8601" }
          ]
        }
      },
      "s7": {
        "status": "...",
        "agent": "git-operator",
        "output": {
          "commit_hash": "abc1234",
          "branch": "feature/xxx",
          "changes": { "frontend": ["檔案清單"], "backend": ["檔案清單"], "database": ["檔案清單"] },
          "stats": { "files_changed": 10, "insertions": 320, "deletions": 45 }
        }
      }
    },
    "audit_history": [
      {
        "audit_id": "SA-{YYYY-MM-DDTHH-MM-SS}",
        "timestamp": "ISO8601",
        "trigger": "standalone | s5_integration",
        "engine_status": "completed | degraded | unavailable",
        "dimensions": {
          "d1_frontend": { "total": 0, "passed": 0, "partial": 0, "failed": 0 },
          "d2_backend": { "total": 0, "passed": 0, "partial": 0, "failed": 0 },
          "d3_database": { "total": 0, "passed": 0, "partial": 0, "failed": 0 },
          "d4_user_flow": { "total": 0, "passed": 0, "partial": 0, "failed": 0 },
          "d5_business_logic": { "total": 0, "passed": 0, "partial": 0, "failed": 0 },
          "d6_test_coverage": { "total": 0, "passed": 0, "partial": 0, "failed": 0 }
        },
        "cross_validation": {
          "api_contract": { "total": 0, "consistent": 0, "inconsistent": 0 },
          "entity_table": { "total": 0, "consistent": 0, "inconsistent": 0 },
          "flow_edge_case": { "total": 0, "covered": 0, "orphan": 0 },
          "test_coverage": { "total": 0, "covered": 0, "missing": 0 }
        },
        "findings_summary": { "p0": 0, "p1": 0, "p2": 0, "total": 0 },
        "report_path": "dev/specs/{folder}/audit/history/{timestamp}/spec_audit_report.md"
      }
    ],
    "failed_approaches": [
      {
        "stage": "S4",
        "approach": "嘗試使用 X 方案但因 Y 原因失敗",
        "reason": "失敗原因描述（技術/架構/相容性等）",
        "timestamp": "ISO8601"
      }
    ],
    "pipeline_cost": {
      "total_usd": 0.00,
      "by_model": { "opus": 0.00, "sonnet": 0.00, "haiku": 0.00 },
      "by_stage": { "s0": 0.00, "s1": 0.00, "s2": 0.00, "s3": 0.00, "s4": 0.00, "s5": 0.00, "s6": 0.00, "s7": 0.00 },
      "session_count": 1
    },
    "instincts_extracted": [
      {
        "id": "INS-001",
        "pattern": "從本次 SOP 中提取的可重用行為模式",
        "confidence": 0.7,
        "source_stage": "S5",
        "promoted_to_global": false
      }
    ],
    "lessons_learned": {
      "what_went_well": ["做得好的地方"],
      "what_went_wrong": ["踩到的坑或重工的原因"],
      "failed_approaches_summary": "從 failed_approaches 自動彙整的失敗路徑摘要",
      "instincts_summary": "從 instincts_extracted 自動彙整的學習摘要",
      "new_pitfalls": ["[tag] 新發現的 pitfall 描述"],
      "captured_at": "ISO8601"
    }
  }
}
```

## S5 欄位語義說明

| 欄位 | 語義 | 常見誤解 | 正確理解 |
|------|------|---------|---------|
| `repair_loop_count` | S4↔S5 安全閥計數器（`s5` 層級，非 `s5.output`） | 等於 `repair_history` 條目數 | 僅計算**正式 S4↔S5 迴圈**（S4 Skill dispatch 觸發），session 內 hotfix（如 loop "2-extra"）不計入 |
| `repair_history` | 修復歷史記錄（`s5.output` 內） | 跟 repair_loop_count 同層 | repair_loop_count 在 stage 層級（操作 metadata），repair_history 在 output 內（審查產出） |
| `blocking_fixes` | R3 裁決後的 blocking 問題清單 | 記錄歷史 | **即時狀態**：conclusion 為 pass 或 conditional_pass 時必須為空 `[]` |
| `recommended_fixes` | 建議修復清單 | 可跨 session 合併 | 須遵守 CLAUDE.md 獨立驗證原則 |
| `conclusion` | S5 最終結論 | 值域固定小寫 | **大小寫不敏感**：schema 定義 `pass`，實際可能 `PASS`。程式比對須正規化 |
| `adversarial_review` | 對抗式審查記錄 | 單一物件 | **陣列**，每個元素代表一次審查 session |
| `issues` | 問題計數摘要 | 必填 | **選填**（v2.4.0+），S5 Skill 未寫入。實質計數由陣列長度決定 |

**不變量（Invariants）**：
1. **非阻斷-Blocking 互斥**：conclusion 為 pass 或 conditional_pass（不分大小寫）→ blocking_fixes 為空
2. **阻斷-Blocking 伴隨**：conclusion 為 fix_required 或 redesign_required → blocking_fixes.length > 0
3. **安全閥上限**：repair_loop_count <= 3（s5 stage 層級）
4. **階段前進條件**：current_stage 為 S6/S7 → s5.output.conclusion 為 pass
5. **Investigation 轉型約束**：work_type_revised != null → work_type == "investigation"（僅 investigation 可轉型）
6. **完成時間約束**：completed_at != null → status == "completed"（完成時間戳只在完成時設定）
7. **審計 ID 唯一約束**：audit_history 中每筆的 audit_id 必須唯一（格式：SA-{timestamp}）
8. **TDD 證據完整約束**：S4 的 `completed_tasks` 每項必須有 `tdd_evidence`（`skipped: true` + 合法 `skip_reason` 視為有效）
9. **失敗路徑格式約束**：`failed_approaches`（頂層 + S1/S4/S5/S6 stage-level）每項必須有 `approach`、`reason`、`timestamp` 三欄位
10. **管線成本一致性**：`status: "completed"` → `pipeline_cost.total_usd` 必須 > 0（已完成的 SOP 必須有成本記錄）

## 持久化規則（三步驟）

每個 S-stage Skill 在階段完成時：

1. **讀取**現有 `sdd_context.json`（路徑依 spec_mode 決定）
2. **更新**當前階段的 `status`→`completed`、`completed_at`、`output`；推進 `current_stage`→下一階段；更新 `last_updated`
3. **寫回**檔案

## 特殊情況

| 情境 | 處理 |
|------|------|
| **S0 建立** | S0 是唯一的建立者，其他階段只更新。S0 完成由 S1（codebase-explorer）推進 |
| **S3 必停** | `status`→`pending_confirmation`，`current_stage` 維持 `S3`（用戶確認後由 S4 推進） |
| **S5 確認** | 通過時 `status`→`pending_confirmation`，`current_stage` 維持 `S5`（用戶確認後由 S6 推進） |
| **S6 確認** | 通過時 `status`→`pending_confirmation`，`current_stage` 維持 `S6`（用戶確認後由 S7 推進） |
| **S4↔S5 迴路** | 回到 S4 時重置 S4→`in_progress`、S5→`pending` |
| **S7 完成** | 兩種模式都保留 `{spec_folder}/sdd_context.json`（`status: "completed"`） |
| **用戶取消** | `status: "cancelled"`，寫入 mini `lessons_learned`（取消原因 + pitfalls） |

## 恢復規則

1. 掃描 `dev/specs/*/sdd_context.json`，找 `status: "in_progress"`（Quick 與 Full Spec 統一路徑）
2. 找到後顯示恢復摘要，等待用戶確認「繼續」或「取消」
3. 恢復後從第一個 `pending` 或 `in_progress` 的 stage 繼續

## 版本相容

v3.0.0 向後相容 v2.8.x/v2.7.x/v2.6.x/v2.5.x/v2.4.x/v2.3.x/v2.2.x/v2.0/v2.1。舊版 contexts 不需遷移，新欄位預設為 null。

v2.8.0 → v3.0.0 變更：
- `failed_approaches`（頂層）：新增可選陣列，記錄架構級失敗路徑（stage, approach, reason, timestamp）
- `failed_approaches`（S1/S4/S5/S6 stage-level）：新增可選陣列，記錄技術級失敗嘗試（approach, reason, timestamp）
- `pipeline_cost`（頂層）：新增可選物件，記錄整條管線的 token 成本（total_usd, by_model, by_stage, session_count）
- `instincts_extracted`（頂層）：新增可選陣列，記錄從本次 SOP 提取的可重用行為模式（id, pattern, confidence, source_stage, promoted_to_global）
- `lessons_learned`：擴充 +`failed_approaches_summary`、+`instincts_summary` 自動彙整欄位
- 新增不變量 Rule 9（failed_approaches 格式）、Rule 10（pipeline_cost 一致性）
- 向後相容：所有新欄位皆為可選，既有 sdd_context.json 不需 migration

v2.8.0 新增可選欄位：
- `s0.output.frontend_design`：新增可選物件，記錄前端設計產出路徑（flowchart_path + wireframe_path + mockup_path）
- flowchart / wireframe 由前端偵測通過時自動產出；mockup 為手動觸發；S1 architect 消費
- 向後相容：欄位可選，既有 sdd_context.json 不需 migration

v2.7.0 → v2.8.0 變更：
- `s4.output.completed_tasks[].tdd_evidence`：新增必填物件，記錄 RED/GREEN/REFACTOR 三步驟證據（test_command, exit_code, output_summary, commit_hash, timestamp）
- `s4.output.tdd_summary`：新增必填物件，彙總 TDD 合規率（total_tasks, tdd_completed, tdd_skipped, compliance_rate, skip_reasons）
- `s6.output.automated_tests`：移除（S4 TDD 已覆蓋單元測試）
- `s6.output.tdd_audit`：新增必填物件，TDD 合規審計結果（compliance_rate, invalid_skips, invalid_evidence, verdict）
- `s6.output.acceptance_criteria`：新增必填物件，驗收標準比對結果（total, met, unmet, details）
- 新增不變量 Rule 8：TDD 證據完整約束
- 向後相容：新欄位為新增，既有 sdd_context.json 消費端須處理 tdd_evidence 缺失情境（視為 v2.7.0 舊資料）

v2.6.0 → v2.7.0 變更：
- `audit_history`（頂層）：新增可選陣列，記錄所有 spec-audit 審計歷史（standalone + s5_integration）
- `s5.output.spec_audit`：新增可選物件，記錄 S5 整合模式的審計摘要（dimensions + cross_validation + findings_summary）
- 新增不變量 Rule 7：audit_history 中 audit_id 必須唯一
- 向後相容：兩個新欄位皆為可選，既有 sdd_context.json 不需 migration

v2.5.0 → v2.6.0 變更：
- `s4.output.completed_tasks`：從 flat ID array 改為 object array（含 mini_review metadata）
- 向後相容：消費端應同時處理 number 和 object 元素
- 新增可選欄位 `s4_task_review`（頂層 Boolean，覆寫 spec_mode 預設）

v2.4.0 → v2.5.0 變更：
- `last_updated_by`：新增（頂層），記錄最後更新者（human/claude/codex）
- `engine_used`：新增（s2.output + s5.output），記錄實際執行審查的引擎
- 不變量從 4 條擴充至 6 條：新增 Rule 5（investigation 轉型約束）、Rule 6（完成時間約束）
- `validate-sdd-context.sh` 支援版本偵測：v2.4.x 僅驗 4 條，v2.5.0+ 驗全 6 條

v2.3.1 → v2.4.0 變更（S5 Schema 結構修正 + 不變量守護）：
- `s5.repair_loop_count`：從 `s5.output` 移至 `s5` stage 層級（與 `status`/`agent`/`output` 同層），語義為 S4↔S5 安全閥計數器
- `s5.output.adversarial_review`：從單一物件改為**陣列**，每個元素代表一次審查 session（含 session_id, r1_agent, r2_agent, r3_agent, r1_findings, r3_verdict, blocking_found, resolved_by）
- `s5.output.issues`：標註為**選填**（S5 Skill 未寫入，實質計數由 blocking_fixes/recommended_fixes/dismissed 陣列長度決定）
- 新增 **S5 欄位語義說明** 區塊，含不變量（Invariants）定義
- 新增 PostToolUse Hook `validate-sdd-context.sh`，自動驗證 4 條不變量

v2.3.0 → v2.3.1 變更（S5 Spec 對照驗證）：
- `s5.output.spec_verification`：新增（可選，S5 Skill 執行 Spec Check 後填入）
  - `s0_criteria`：S0 成功標準通過率（total/passed/partial/failed）
  - `s1_scope_match`：S1 影響範圍對比（每層含 expected/actual/match）
  - `s1_dod`：S1 任務 DoD 通過率（total/passed/partial/failed）
  - `issues`：未達項清單（SC- ID、來源、描述、狀態、證據）

v2.2.1 → v2.3.0 變更（S5 Schema 正規化 + 持久化擴充）：
- `s5.output.conclusion`：值域擴充 +`conditional_pass`（有條件通過 ≠ 完全通過）
- `s5.output.score`：型別從 number 改為 string（`"X/5"` 格式，允許小數）
- `s5.output.adversarial_review`：推薦巢狀結構；舊版扁平 `r1_engine`/`r3_engine`/`session` 為 legacy compatible，消費端應 fallback 讀取
- `s5.output.issues`：正式定義計數物件結構（`p0`, `p1_blocking`, `p1_recommended`, `p2`, `dismissed`），混合嚴重度+行動維度
- `s5.output.blocking_fixes`：正式定義，子結構擴充 +`r2_response`, +`r3_verdict`
- `s5.output.recommended_fixes`：正式定義，子結構含可選 `file`/`line`
- `s5.output.dismissed`：新增（被駁回問題清單，含 R2 反駁理由 + R3 裁決）
- `s5.output.review_report_path`：新增（Full Spec 模式產出 `s5_code_review_report.md`）
- `s5.output.fixes_applied`：新增（修正描述清單）
- `s5.output.repair_history`：新增（S4↔S5 迴圈歷史，含 trigger_issues/fixes_applied/result/timestamp）
- 移除 `s5.output.p0_issues`/`p1_issues`/`p2_issues`（從未使用，由 `blocking_fixes`/`recommended_fixes`/`dismissed` 取代）

v2.2.1 新增欄位：
- `work_type`（頂層 + s0.output）：工作類型分類，可選，預設 `new_feature`
- `work_type_revised`（頂層 + s1.output）：investigation 轉型後的實際類型，可選
- `lessons_learned` 為可選欄位（僅 S7 填入）

舊的 sdd_context.json 不需要遷移。缺少 `work_type` 的舊 context 視為 `new_feature`。
