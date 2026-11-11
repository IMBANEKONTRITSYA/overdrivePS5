---
name: add-i18n-string
description: Добавить или изменить строку интерфейса во всех 14 локалях Overdrive. Используй, когда в UI появляется новый текст или нужно дописать недостающие переводы.
allowed-tools: Read, Edit, Bash, Grep, Glob
---

# Строка интерфейса во всех локалях

## Шаги

1. **Найди место и соседей**
   - Ключи плоские, с префиксом области: `browse.*`, `download.*`, `update.*` ...
   - `grep -n '"<префикс>\.' app/i18n/locales/en.json` — посмотри, как названы соседние ключи.

2. **Добавь ключ в `en.json`** (исходный язык)
   - Параметры: `{count}`, `{name}`.
   - Множественное число — ICU: `{count, plural, one {# game} other {# games}}`.

3. **Добавь тот же ключ во все остальные файлы** `app/i18n/locales/*.json`:
   ar, bn, de, es, fr, hi, id, it, ja, pt-BR, ru, ur, zh-Hans.
   - Переводи, сохраняя плейсхолдеры и ICU-конструкции без изменений.
   - Учитывай правила множественного числа языка (ru, ar — больше форм; см. `app/i18n/plural.js`).
   - Сохраняй форматирование файла (отступ 4 пробела, порядок ключей по алфавиту, как в файле).

4. **Используй в коде**
   - В компоненте: `const t = useT();` из `../i18n/index.js`, затем `t("area.key", { count })`.
   - Вне компонентов: `t` из `../i18n/core.js`.
   - Учти длину: длинные переводы (de, ru) могут не влезть — см. `app/i18n/fit.js`.

5. **Проверь полноту**

```bash
python3 - <<'EOF'
import json, glob
en = set(json.load(open("app/i18n/locales/en.json")))
for f in sorted(glob.glob("app/i18n/locales/*.json")):
    keys = set(json.load(open(f)))
    print(f, "missing:", len(en - keys), "extra:", len(keys - en))
EOF
```
