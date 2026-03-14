#!/bin/bash
# Project Detection — detect linters/formatters and protected config files

detect_linter_command() {
  local project_dir="${1:-.}"

  # Priority 1: CLAUDE.md declaration
  if [[ -f "$project_dir/CLAUDE.md" ]]; then
    local declared
    declared=$(grep -A2 'quality_gate:' "$project_dir/CLAUDE.md" 2>/dev/null | grep 'command:' | sed 's/.*command:[[:space:]]*//' | tr -d '"' | tr -d "'" | xargs)
    if [[ -n "$declared" ]]; then
      echo "$declared"
      return 0
    fi
  fi

  # Priority 2: Config-file auto-detection
  if [[ -f "$project_dir/biome.json" ]] || [[ -f "$project_dir/biome.jsonc" ]]; then
    echo "npx biome check --fix"
    return 0
  fi

  if [[ -f "$project_dir/.prettierrc" ]] || [[ -f "$project_dir/.prettierrc.json" ]] || [[ -f "$project_dir/.prettierrc.js" ]] || [[ -f "$project_dir/prettier.config.js" ]] || [[ -f "$project_dir/prettier.config.mjs" ]]; then
    echo "npx prettier --write"
    return 0
  fi

  if [[ -f "$project_dir/.eslintrc" ]] || [[ -f "$project_dir/.eslintrc.json" ]] || [[ -f "$project_dir/.eslintrc.js" ]] || [[ -f "$project_dir/eslint.config.js" ]] || [[ -f "$project_dir/eslint.config.mjs" ]]; then
    echo "npx eslint --fix"
    return 0
  fi

  if grep -q '\[tool\.ruff\]' "$project_dir/pyproject.toml" 2>/dev/null || [[ -f "$project_dir/.ruff.toml" ]] || [[ -f "$project_dir/ruff.toml" ]]; then
    echo "ruff check --fix"
    return 0
  fi

  if [[ -f "$project_dir/go.mod" ]]; then
    echo "gofmt -w"
    return 0
  fi

  # No linter detected
  return 1
}

# Returns newline-separated list of detected linter/formatter config files
detect_linter_config_files() {
  local project_dir="${1:-.}"
  local configs=()

  [[ -f "$project_dir/biome.json" ]] && configs+=("biome.json")
  [[ -f "$project_dir/biome.jsonc" ]] && configs+=("biome.jsonc")
  [[ -f "$project_dir/.prettierrc" ]] && configs+=(".prettierrc")
  [[ -f "$project_dir/.prettierrc.json" ]] && configs+=(".prettierrc.json")
  [[ -f "$project_dir/.prettierrc.js" ]] && configs+=(".prettierrc.js")
  [[ -f "$project_dir/prettier.config.js" ]] && configs+=("prettier.config.js")
  [[ -f "$project_dir/prettier.config.mjs" ]] && configs+=("prettier.config.mjs")
  [[ -f "$project_dir/.eslintrc" ]] && configs+=(".eslintrc")
  [[ -f "$project_dir/.eslintrc.json" ]] && configs+=(".eslintrc.json")
  [[ -f "$project_dir/.eslintrc.js" ]] && configs+=(".eslintrc.js")
  [[ -f "$project_dir/eslint.config.js" ]] && configs+=("eslint.config.js")
  [[ -f "$project_dir/eslint.config.mjs" ]] && configs+=("eslint.config.mjs")
  [[ -f "$project_dir/pyproject.toml" ]] && configs+=("pyproject.toml")
  [[ -f "$project_dir/.ruff.toml" ]] && configs+=(".ruff.toml")
  [[ -f "$project_dir/ruff.toml" ]] && configs+=("ruff.toml")
  [[ -f "$project_dir/.editorconfig" ]] && configs+=(".editorconfig")

  printf '%s\n' "${configs[@]}"
}

# Returns newline-separated list of user-declared protected files from CLAUDE.md
get_declared_protected_files() {
  local project_dir="${1:-.}"

  if [[ -f "$project_dir/CLAUDE.md" ]]; then
    grep 'protected_files:' "$project_dir/CLAUDE.md" 2>/dev/null | sed 's/.*\[//' | sed 's/\]//' | tr ',' '\n' | tr -d ' "'"'" | grep -v '^$'
  fi
}
