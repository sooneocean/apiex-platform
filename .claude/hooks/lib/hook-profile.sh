#!/bin/bash
# Hook Profile System — shared library
# Profiles: minimal | standard | full
# Env: CHILLVIBE_HOOK_PROFILE (default: standard)
# Env: CHILLVIBE_DISABLED_HOOKS (comma-separated hook IDs)

get_hook_profile() {
  echo "${CHILLVIBE_HOOK_PROFILE:-standard}"
}

is_hook_enabled() {
  local hook_id="$1"
  local profile
  profile=$(get_hook_profile)

  # Check disabled list
  if [[ -n "$CHILLVIBE_DISABLED_HOOKS" ]]; then
    IFS=',' read -ra DISABLED <<< "$CHILLVIBE_DISABLED_HOOKS"
    for disabled in "${DISABLED[@]}"; do
      if [[ "$(echo "$disabled" | xargs)" == "$hook_id" ]]; then
        return 1
      fi
    done
  fi

  # Profile-based filtering
  case "$profile" in
    minimal)
      case "$hook_id" in
        protect-files|validate-sdd-context|context-guard|sop-compact-reminder|generate-manifest)
          return 0 ;;
        *)
          return 1 ;;
      esac
      ;;
    standard|full)
      return 0
      ;;
    *)
      # Unknown profile, default to standard
      return 0
      ;;
  esac
}

# Guard: source this at the top of any hook script
# Usage: source "$(dirname "$0")/lib/hook-profile.sh" && check_hook "hook-id" || exit 0
check_hook() {
  local hook_id="$1"
  if ! is_hook_enabled "$hook_id"; then
    exit 0
  fi
}
