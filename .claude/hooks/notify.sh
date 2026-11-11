#!/usr/bin/env bash

# Notification: системное уведомление когда Claude ждёт

if command -v notify-send &> /dev/null; then
  notify-send "Claude Code" "Ждёт вашего ввода" --icon=dialog-information
elif command -v osascript &> /dev/null; then
  osascript -e 'display notification "Claude Code ждёт вашего ввода" with title "Claude Code"'
fi

exit 0
