#!/usr/bin/env bash

# Status line: показать модель, ветку и стоимость
# Claude Code передаёт данные сессии JSON-ом в stdin (переменных окружения CLAUDE_MODEL/CLAUDE_COST нет)

input=$(cat)

model=$(echo "$input" | jq -r '.model.display_name // "unknown"')
cost=$(echo "$input" | jq -r '.cost.total_cost_usd // 0' | awk '{printf "$%.2f", $0}')
dir=$(echo "$input" | jq -r '.workspace.current_dir // "."')
branch=$(git -C "$dir" branch --show-current 2>/dev/null)
[ -z "$branch" ] && branch="no-git"

echo "[$model] $branch | $cost"
