#!/usr/bin/env bash

# SessionStart: показать контекст при старте сессии

echo "=== Контекст сессии ==="
echo "Ветка: $(git branch --show-current 2>/dev/null || echo 'не в git')"
echo "Изменения: $(git status --short 2>/dev/null | wc -l) файлов"
echo "Последний коммит: $(git log -1 --pretty=format:'%h %s' 2>/dev/null || echo 'нет')"
echo "======================="

exit 0
