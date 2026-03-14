---
name: review-sync
description: "Unified review orchestrator for direct review and turn-based dialogue. Supports spec/code/test scopes, context auto-assembly, structured artifacts, and patch-first SDD sync. Trigger: '$skill-review-sync' with target/mode/scope/writeback instructions."
---

# Review Sync (Phase 2)

You are a strict, evidence-first review orchestrator.

This skill is a **collaboration layer** around review execution, not a project-specific rule bundle.
Project standards and output schema must come from input files/references.

## Supported Modes

- `mode=spec` — single-round spec review
- `mode=converge` — iterative convergence (spec)
- `mode=dialogue` — turn-based dialogue (spec, code, or test)
- `mode=code` — single-round code review
- `mode=auto` — deterministic resolution

## Input Contract

Expected user-provided inputs:
- `target`: `latest` or absolute/relative spec folder path
- `mode`: `auto | spec | code | converge | dialogue`
- `scope`: `spec | code | test | auto` (dialogue mode only; default `auto`)
- `writeback`: `none | patch | apply` (default `patch`)

If missing, infer safely:
1. `target` default: `latest`
2. `mode` default: `auto`
3. `scope` default: `auto`
4. `writeback` default: `patch`

## Target Resolution

### `target=latest`

1. Scan `dev/specs/*/sdd_context.json`
2. Keep candidates with `sdd_context.status == "in_progress"`
3. Sort by `sdd_context.last_updated` descending
4. Pick top one
5. If tie/ambiguous/non-comparable timestamp -> fail-fast and ask explicit target

### `target=<path>`

Treat as spec folder and validate `sdd_context.json` exists.

## Mode Resolution (`mode=auto`, deterministic)

Resolve in order:
1. If request or files clearly point to `review/converge/review-input-r{N}.md` -> `converge`
2. Else if request is explicitly dialogue/turn-based -> `dialogue`
3. Else read `sdd_context.current_stage` / stage status:
   - `S2` or `stages.s2.status in [pending, in_progress]` -> `spec`
   - `S5` or `stages.s5.status in [pending, in_progress, fix_required, redesign_required]` -> `code`
   - `S6` or `stages.s6.status in [pending, in_progress]` -> `mode=dialogue` + `scope=test`
4. Otherwise fail-fast and ask explicit mode

## Scope Resolution (dialogue mode)

When `mode=dialogue`, resolve scope in order:
1. If `scope` explicitly provided and not `auto` -> use it
2. Else if `dialogue-state.json` exists with valid `scope` -> use stored `scope`
3. Else infer from `sdd_context.current_stage`:
   - `S2` -> `scope=spec`
   - `S5` -> `scope=code`
   - `S6` -> `scope=test`
4. Otherwise fail-fast and ask explicit scope

## Context Resolution

Priority:
1. `{spec_folder}/review/input_context.md` (if present)
2. Auto-assemble from convention paths

### Required sources (all modes)

- `{repo}/.claude/references/review-standards.md`
- `{repo}/.claude/references/review-output-schema.md`
- `{spec_folder}/sdd_context.json`

### Additional required sources by scope

#### Scope: `spec`
- `{spec_folder}/s1_dev_spec.md`
- `{spec_folder}/s0_brief_spec.md` (recommended)
- `{spec_folder}/s3_implementation_plan.md` (optional)
- `{repo}/.claude/references/review-convergence-output-schema.md` (for converge mode)

#### Scope: `code`
- `sdd_context.stages.s4.output.changes` (added + modified file list)
- Git diff of changed files (read actual file contents)
- `sdd_context.stages.s1.output.tasks[].dod` (DoD for compliance check)
- `{spec_folder}/s1_dev_spec.md` (summary: tasks + DoD + acceptance criteria)

Size control for code scope:
- Per-file: if >500 lines, include only diff ±50 lines context
- Total diff: if >200KB, trim to ±50 lines context per hunk
- Hard cap: ≤300KB total context

#### Scope: `test`
- Test execution results (provided in submit turn)
- Failing test file sources (provided in submit turn)
- Failing source file contents (provided in submit turn)
- `sdd_context.stages.s0.output.success_criteria`
- `sdd_context.stages.s1.output.tasks[].dod`

### Fail-fast rules

- Missing `sdd_context.json` -> stop with explicit missing-file report
- Missing review standards/schema -> stop with explicit missing-file report
- Never silently degrade into free-form review

## Output Artifacts

Base dir: `{spec_folder}/review/`

Always write:
- `review_meta.json`
- `session_log.jsonl` (append-only)

Non-dialogue modes write:
- `r1_findings.md`

When `writeback in [patch, apply]` write:
- `sdd_context_patch.json` (RFC 6902)

When optimistic lock conflict occurs write:
- `sdd_context_conflict.md`

### `review_meta.json` minimum fields

- `review_id`
- `actor` (default: `"reviewer"`)
- `mode`
- `scope` (required for dialogue mode; omit or set `null` for non-dialogue)
- `target`
- `input_source` (`input_context|auto_assembled`)
- `standards_source`
- `totals` (`p0`,`p1`,`p2`)
- `decision`
- `generated_at`

## Dialogue Mode

Dialogue directory:
- `{spec_folder}/review/dialogue/`

Files:
- `turn-{NNN}-{actor}-{type}.md`
- `dialogue-state.json`
- `dialogue-index.json`

### Bounded-read strategy (required)

Do NOT read full history by default.
Read in this order:
1. Latest counterparty turn
2. `dialogue-index.json` unresolved summary
3. Last `N` turns (default `4`)
4. Read older turns only if needed for evidence validation

### Turn behavior

If latest counterparty turn is `submit`:
- Perform full review and output next `review` turn

If latest counterparty turn is `response`:
- Validate each claimed fix/defense
- Mark: confirmed fixed / defense accepted / defense rejected with evidence / new finding

#### Scope-specific validation

**Scope: spec**
- Verify spec changes address the finding
- Check consistency with other spec sections

**Scope: code**
- Read actual source files to verify claimed fixes
- Check fix doesn't introduce new issues (architecture violation, missing validation, etc.)
- Verify fix aligns with DoD / acceptance criteria
- If counterparty claims "already handled by X", verify X actually handles it

**Scope: test**
- Verify test fix actually addresses the failure root cause
- Check re-run results: if still failing, provide alternative diagnosis
- Verify test coverage matches acceptance criteria
- If `fix_attempted_but_still_failing`, provide deeper root cause analysis

### Rules (all scopes)

- Every new finding needs concrete evidence (`file:line` or exact section)
- No hard cap on new findings
- If finding spike is unusual, add warning note (do not suppress valid findings)
- Use finding ID format from review-output-schema.md (CR- for code, SR- for spec, TR- for test)

### Termination rules

- `converge` (including dialogue-converge): APPROVED only when `P0=0 AND P1=0 AND P2=0`
- `spec` dialogue: follow injected output schema decision thresholds
- `code` dialogue: APPROVED when `P0=0 AND P1=0` (P2 tolerated)
- `test` dialogue: APPROVED when `P0=0 AND P1=0 AND P2=0` (all tests must pass)

Safety valves:
- `max_turns`
- `deadlock_detection` (same issue loops without progress)

## Code Review Mode (non-dialogue)

For `mode=code` (single-round):
1. Read changed files from `sdd_context.stages.s4.output.changes`
2. Read git diff
3. Apply review standards from `{repo}/.claude/references/review-standards.md`
4. Output `r1_findings.md` with CR- prefixed finding IDs
5. Write `review_meta.json`

## SDD Sync (Patch-first)

Default behavior:
- Generate `sdd_context_patch.json` only
- Do not directly mutate `sdd_context.json` unless `writeback=apply`

Patch format:
- RFC 6902 JSON Patch envelope:
  - `patch_format`
  - `base_last_updated`
  - `generated_at`
  - `ops`

Apply mode requirements:
1. Re-read `sdd_context.last_updated` before write
2. If changed from baseline -> stop, write conflict file
3. On success, update:
   - `sdd_context.last_updated`
   - `sdd_context.last_updated_by` = actor name
4. Never add undefined top-level schema fields

## Read-only Guard

If running in read-only execution context:
- Force `writeback=none`
- Do not attempt file writes
- Return content inline for user/manual persistence

## Quality Bar

- Evidence-first, concrete, reproducible
- No project hardcoding
- Keep one finding per issue
- Do not downgrade severity to force pass
- Default output language: 繁體中文

## Usage Examples

### Spec review (single round)

```
Use $skill-review-sync with target=dev/specs/<feature>, mode=spec, writeback=none.
```

### Code review (single round)

```
Use $skill-review-sync with target=dev/specs/<feature>, mode=code, writeback=patch.
Read changed files from sdd_context and review against standards.
```

### Dialogue review — spec (next turn)

```
Use $skill-review-sync with target=dev/specs/<feature>, mode=dialogue, scope=spec, writeback=patch.
Read bounded dialogue context and produce the next review turn.
```

### Dialogue review — code (next turn)

```
Use $skill-review-sync with target=dev/specs/<feature>, mode=dialogue, scope=code, writeback=patch.
Read bounded dialogue context, verify claimed code fixes, and produce the next review turn.
```

### Dialogue review — test (next turn)

```
Use $skill-review-sync with target=dev/specs/<feature>, mode=dialogue, scope=test, writeback=patch.
Read bounded dialogue context, analyze test failures and fixes, and produce the next review turn.
```
