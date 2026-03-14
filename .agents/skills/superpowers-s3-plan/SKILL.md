---
name: superpowers-s3-plan
description: "S3 實作計畫轉接。借用 superpowers:writing-plans 的任務拆解方法，但輸出固定到 SOP 的 s3_implementation_plan.md。"
metadata:
  short-description: "S3 + writing-plans 轉接"
---

# S3 Plan Adapter

## 何時用

當 `current_stage` 為 `S3`，或你要建立 `s3_implementation_plan.md` 時。

## 套用原則（來自 writing-plans）

- 任務必須切成 2-5 分鐘可完成的小步驟
- 每個任務必須有明確 DoD 與驗證命令
- 優先 TDD、YAGNI、DRY
- 任務要標註可並行與依賴關係

## 強制約束

- 輸出路徑只能是：`dev/specs/{YYYY-MM-DD}_{N}_{feature}/s3_implementation_plan.md`
- 模板只能用：`dev/specs/_templates/s3_implementation_plan_template.md`
- 必須回寫 `sdd_context.json` 的 `stages.s3`、`current_stage`、`last_updated_by`
- 不得改用 `docs/plans/*`

## 建議流程

1. 讀取 `s1_dev_spec.md`、`sdd_context.json`
2. 以 writing-plans 方式拆解任務
3. 寫入 `s3_implementation_plan.md`
4. 驗證模板欄位完整（任務總覽、依賴圖、波次、驗證計畫）
5. 更新 `sdd_context.json`
