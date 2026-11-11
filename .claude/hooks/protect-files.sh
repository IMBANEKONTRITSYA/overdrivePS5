#!/usr/bin/env bash

# PreToolUse (Edit|Write): блокирует изменение защищённых файлов

file=$(jq -r '.tool_input.file_path // empty')
[ -z "$file" ] && exit 0

protected=(
  ".env"
  ".env."
  "secrets/"
  ".pem"
  ".key"
  "ps5-react/"
  "package-lock.json"
  "node_modules/"
)

for p in "${protected[@]}"; do
  if [[ "$file" == *"$p"* ]]; then
    echo "Файл '$file' защищён (совпадение с '$p'). Не изменяй его без явной просьбы." >&2
    exit 2
  fi
done

exit 0
