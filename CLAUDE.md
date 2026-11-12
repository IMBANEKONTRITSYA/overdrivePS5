# Overdrive (overdrivePS5)

Homebrew-магазин игр для PS5 на фреймворке [ps5-react](https://github.com/half144/ps5-react).
Исходники восстановлены из JS-бандла в `eboot.bin` последней сборки оригинального проекта (MyLuxy/overdrive).
Подробности для пользователей: @README.md

## Структура

| Путь | Что это |
| --- | --- |
| `app/index.jsx` | Точка входа приложения |
| `app/app.json` | Манифест: titleId `PPSA99058`, версия, шрифты, ресурсы, доступы |
| `app/version.js` | `VERSION` — по нему CI называет релиз |
| `app/browse/` `game/` `search/` `downloads/` `files/` | Экраны |
| `app/state/` | Состояние и логика: каталог, очередь загрузок, источники, кеши, обновления |
| `app/ui/` | Общие компоненты, цвета, звуки, вибрация |
| `app/i18n/` | Локализация: `core.js` (`t`), `index.js` (`useT`, `useLocale`), `locales.js`, `plural.js`, `locales/*.json` |
| `app/data/` | Каталог: `catalog.js`, `releases/<id>.json`, `pages/<id>.json` |
| `app/assets.config.js` | Какие глифы запекаются в шрифты |
| `ps5-react/` | Vendored фреймворк — **не редактировать** |
| `packaging/make-exfat.sh` | Сборка exFAT-образа для ShadowMount+ |
| `.github/workflows/build.yml` | Сборка в CI |

## Сборка

Только Linux (Ubuntu 24.04), как в CI. Нативный превью ps5-react работает только на macOS (Apple Silicon), так что на Linux проверить результат можно только на консоли.

```bash
cd ps5-react
python3 tools/build_ps5.py --app-dir ../app --llvm /usr/bin
cd ..
sudo bash packaging/make-exfat.sh ps5-react/dist/PPSA99058 Overdrive.exfat OVERDRIVE
zip -q -X -j update.zip Overdrive.exfat   # то, что качает встроенный апдейтер
```

Зависимости: см. шаг «Install the toolchain» в `.github/workflows/build.yml` (clang-18/llvm-18 с симлинками без суффикса, cmake, ninja, node, zlib, exfatprogs и т.д.) плюс `pip install -r ps5-react/requirements.txt` в venv.

CI запускается только вручную (Run workflow): кладёт сборку в **черновик** релиза `v<VERSION>`. Публикация черновика = релиз. Если версия уже опубликована, сборка падает — нужно поднять версию.

### Выпуск версии
Поднимать вместе: `VERSION` в `app/version.js` (`1.0.2`) и `version` в `app/app.json` (`01.002.000`).

## Стиль кода — важно

Код — реконструированный вывод esbuild. Держим diff с оригиналом минимальным:

- Сохраняй стиль файла: `var` на верхнем уровне модуля, JSX в виде вызовов `(0, jsx)(View, { ... })` / `(0, jsxs)(...)` из `react/jsx-runtime`, отступы как в файле.
- Компоненты и API — из `@ps5-react/core` (`View`, `Text`, `Image`, `FileSystem`, `DeviceInfo`, `Fonts` ...). Справка по API — в `ps5-react/README.md`, `ps5-react/AGENTS.md`, `ps5-react/docs/`.
- В начале каждого файла есть шапка `// ../pub-game-store/native/...` + `// reconstructed from ...`. Меняя файл, добавь в шапку строку `// MODIFIED: <что и зачем>` (одна строка на изменение).
- Комментарии в коде — на английском, как в остальном репозитории.
- **Не прогоняй файлы через форматтеры** (prettier и т.п.) — это перепишет весь файл.
- Экспорты — в конце файла: `export { Name };`.

## Данные каталога

- `app/data/catalog.js` экспортирует `games`, `features`, `twins`. Игра: `{id, title, platform, providers, direct, developer, publisher, releaseDate, year, genres, features, metacritic, recommendations, sizeGb, art: {cover, coverFallbacks, tint, hero, logo, logoAspect}}`.
- `app/data/releases/<id>.json` — массив релизов: `{id, format, filename, url, requiresBrowser, sizeBytes, version, category, provider, source, flow, label, platform, record, health, unavailableReason, ...}`.
- `app/data/pages/<id>.json` — `{about, shots, summary}`.
- Файлов ~2000 на каждый каталог; читаются с консоли через `FileSystem.readFile('/app0/data/...')` (см. `app/state/catalog.js`). Папки перечислены в `resources` в `app.json`.
- Это сгенерированные данные: не правь их массово руками и не меняй формат без правки читающего кода в `app/state/`.

## Локализация

- 14 языков: en, de, es, fr, it, pt-BR, ru, id, ja, zh-Hans, ar, ur, hi, bn. Исходный — `en`.
- Ключи плоские: `"area.name": "..."`, параметры `{count}`, множественное число — ICU: `{count, plural, one {# game} other {# games}}`.
- Новый ключ → добавить во **все** `app/i18n/locales/*.json`. Во всех 14 файлах одинаковый набор ключей (421); проверка — скрипт в скилле `add-i18n-string`.
- Ар/урду — RTL: учитывай `rtl` из `useLocale()` в отступах.
- Шрифты запекаются только для европейских глифов (`assets.config.js`); CJK/индийские/арабские — через `textFonts` в `app.json`.

## Обновления

Апдейтер уже есть: `app/state/update.js` (лента), `app/state/updater.js`, `app/ui/UpdateDialog.jsx`.
Лента `FEED` смотрит на `IMBANEKONTRITSYA/overdrivePS5/releases/latest` — туда же CI кладёт сборки, так что опубликованный релиз доходит до установленных копий. Копии, собранные из апстрима (MyLuxy/overdrive), эту ленту не видят. Переопределение для тестов — файл `update-feed` (см. `FEED_OVERRIDES` в `app/state/update.js`).

## Git

- Сообщения коммитов на английском в стиле репозитория: `feat: ...`, `fix: ...`, `chore: ...`, строчными.
- `dist/`, `.deps/`, `.build/`, `node_modules/` в `.gitignore` — не коммитить.

## Никогда

- Не редактировать `ps5-react/` (vendored; обновлять только целиком из апстрима).
- Не реформатировать и не «модернизировать» реконструированный код без задачи.
- Не коммитить секреты и токены.
- Не менять формат `app/data/` без обратной совместимости.

## Проверка

Автотестов у приложения нет. Проверка: сборка проходит без ошибок + ручной прогон на консоли (геймпад: L1/R1 — разделы, ✕ — выбор, ○ — назад; RTL-языки; офлайн).
