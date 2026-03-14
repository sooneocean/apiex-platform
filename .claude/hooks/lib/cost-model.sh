#!/bin/bash
# Cost Model — token pricing and USD calculation

# Pricing per million tokens (USD) — Anthropic 2026 rates
# Format: model_prefix:input_rate:output_rate
COST_TABLE=(
  "claude-opus-4:15.00:75.00"
  "claude-sonnet-4:3.00:15.00"
  "claude-haiku-4:0.80:4.00"
  "opus:15.00:75.00"
  "sonnet:3.00:15.00"
  "haiku:0.80:4.00"
)

get_rate() {
  local model="$1"
  local rate_type="$2"  # input | output

  for entry in "${COST_TABLE[@]}"; do
    local prefix rate_in rate_out
    IFS=':' read -r prefix rate_in rate_out <<< "$entry"
    if [[ "$model" == *"$prefix"* ]]; then
      if [[ "$rate_type" == "input" ]]; then
        echo "$rate_in"
      else
        echo "$rate_out"
      fi
      return 0
    fi
  done

  # Default: sonnet rates
  if [[ "$rate_type" == "input" ]]; then
    echo "3.00"
  else
    echo "15.00"
  fi
}

# Calculate USD cost from tokens
# Usage: calculate_cost "model-id" input_tokens output_tokens
calculate_cost() {
  local model="$1"
  local input_tokens="${2:-0}"
  local output_tokens="${3:-0}"

  local input_rate output_rate
  input_rate=$(get_rate "$model" "input")
  output_rate=$(get_rate "$model" "output")

  # (tokens / 1,000,000) * rate
  echo "scale=6; ($input_tokens * $input_rate + $output_tokens * $output_rate) / 1000000" | bc 2>/dev/null || echo "0"
}

# Read cost alert thresholds from CLAUDE.md or return defaults
get_cost_thresholds() {
  local project_dir="${1:-.}"
  local defaults="2,5,10"

  if [[ -f "$project_dir/CLAUDE.md" ]]; then
    local declared
    declared=$(grep 'cost_alert_thresholds:' "$project_dir/CLAUDE.md" 2>/dev/null | sed 's/.*\[//' | sed 's/\]//' | tr -d ' ')
    if [[ -n "$declared" ]]; then
      echo "$declared"
      return 0
    fi
  fi

  echo "$defaults"
}

get_metrics_dir() {
  echo "${HOME}/.claude/metrics"
}

get_costs_file() {
  echo "$(get_metrics_dir)/costs.jsonl"
}
