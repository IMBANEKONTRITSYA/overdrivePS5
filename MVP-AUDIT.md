# MVP audit and continuation record

Audit date: 2026-11-12. Baseline: `63f94cdfc049a8436515162278b951eb3960e996`.
Repository: https://github.com/IMBANEKONTRITSYA/overdrivePS5

## Status and evidence boundaries

This records investigation, not implemented fixes. No application or vendored framework source was changed during the audit. The separately requested deletion-safety fix is **pending**: inspection began, but implementation was interrupted to connect this checkout to GitHub.

The audited local `app/` files were compared with the baseline checkout: zero file-content differences after normalizing CRLF/LF. Findings below are static code findings. No Linux/PS5 build, packaging execution, live provider-link validation, or console test was performed. Do not interpret absence of a finding as proof of correctness.

Thirteen subsystem readers examined shell/navigation, browsing, game details, queue, downloads UI, source resolution, Files/storage, search, localization, updates, catalog data, build/packaging, and shared UI. Thirteen serious claims received independent code verification: twelve were confirmed (including duplicate reports of the same update-discovery issue), one was refuted. Several confirmed claims were downgraded to minor. These are not twelve distinct blockers. The automated final synthesis failed; this record is recovered from the detailed subsystem and verification results.

## Architecture

- `app/index.jsx`: boot/splash, providers, screen composition.
- `app/state/nav.jsx`, `app/ui/Header.jsx`: screen stack, sections, focus and immersive mode.
- `app/browse/`, `app/state/catalog.js`, `app/state/store.jsx`: discovery rails, filters, sorting, favorites and catalog lookup.
- `app/game/`: detail pages, editions/versions, release/source selection and download actions.
- `app/state/download-queue.js`: persistent queue, transfer, resume, extraction, publication, installation and cancellation.
- `app/state/download-sources.js`, `app/state/viking-capture.js`: provider resolution and browser-capture validation.
- `app/downloads/`: queue presentation, progress, alerts, browser/URL dialogs and throughput statistics.
- `app/files/`: storage scanning, package installation and deletion.
- `app/search/`: matching, suggestions, persisted history and controller keyboard.
- `app/i18n/`: locale loading, English fallback, plurals, formatting and RTL.
- `app/state/update.js`, `updater.js`, `install-location.js`: feed, verified update download and installation discovery/replacement.
- `app/ui/`, `app/assets/`, `app/sce_sys/`: shared primitives, imagery, fonts, sound/haptics and console artwork.
- `app/data/`: generated catalog, release records and page metadata.
- `.github/workflows/build.yml`, `packaging/make-exfat.sh`: manual Linux build, exFAT packaging and draft releases.
- `ps5-react/`: vendored runtime/native framework; do not edit.

Main workflow: catalog -> game/edition/version/source -> persisted queue -> download -> extraction where required -> package installation or homebrew publication/ShadowMount integration. Availability, recovery and file ownership must be validated along this whole chain.

## Completed structural checks

- 137 application JavaScript/JSX files; no missing relative import targets. This is a path-resolution check, not full import/export or JavaScript compilation validation.
- 1,845 listed games plus 217 alternate entries: 2,062 catalog IDs.
- All catalog IDs have release and page JSON files.
- 2,074 release files and 2,074 page files; twelve file pairs are unreferenced by catalog IDs. Not a demonstrated runtime blocker.
- Release JSON parsing counted 18,276 records. Most records are browser-oriented; `requiresBrowser` is true for 17,171 and false for 1,105. This is metadata, not proof of runtime provider success.
- Fourteen locale dictionaries parse. English/Italian: 418 keys each; Brazilian Portuguese: 417; the other eleven: 401.
- `app/version.js` is 1.0.2 and `app/app.json` is 01.002.000, consistent representations.
- Git 2.56.1 is available. Node/npm were not available in the audit shell; GitHub CLI was also unavailable. The original extracted folder had no Git history; the GitHub clone does.

## Confirmed findings, deduplicated

### A1 — Major: Files deletion lacks active ownership and installation guards

Evidence: `app/files/useFiles.js:19-25,61-99`, `app/files/FilesScreen.jsx:94-107`, `app/files/scan.js:33-70`.

`finishedJobs` considers only COMPLETE queue states. Direct deletion does not reject paths owned by an active extraction or a locally tracked `Packages.install` task. Existing directories under `downloads/extracted` are exposed by scanning while extraction can still write to them. The unsafe concurrent deletion is established; failure of every package installation after unlinking an input is not established and depends on native behavior.

Required fix: guard the deletion boundary using current queue ownership and local installation state; compare overlapping directory paths with segment boundaries, not just exact strings. Recheck after asynchronous mounted-image inspection. Coordinate deletion and installation so neither can start against a path already in the other operation. Keep locks alive across relevant component lifecycle changes. Do not merely hide a button.

### A2 — Major: Files can delete the supported folder installation of Overdrive

Evidence: `app/files/scan.js:7,43-56,70`, `app/files/useFiles.js:28-37,80-92`, `app/state/install-location.js:31-39`.

A writable `homebrew/PPSA99058` folder can be listed and recursively removed after user confirmation. Mounted-image checks do not establish folder ownership or protect the running title. This requires deliberate deletion confirmation; it is not spontaneous deletion.

Required fix: identify and protect the current app installation and its ancestors/contents. Include the standard folder and image names as conservative fallback protection; do not infer that an unreachable ShadowMount service proves an image is unmounted.

### A3 — Major: Restart cannot discard a completed single archive after extraction failure

Evidence: `app/state/download-queue.js:275-328,435-437,525-530,753-756,1148-1163`.

When a failed single-archive job retains its final `downloadDestination`, restart selects partial-file cleanup, which rejects an existing final file before resetting the job. Resume can recover the same archive and repeat extraction failure, or fail earlier if native recovery rejects it.

Required fix: distinguish queue-owned completed archive data from unrelated existing files; make explicit restart safely discard owned failed data and start fresh without deleting installed/published output.

### A4 — Major: Update fallback excludes the distributed image filename

Evidence: `app/state/install-location.js:8-9,36-42`, `app/state/update.js:29-64`, `.github/workflows/build.yml:60-63`.

If ShadowMount's installation API fails or returns no path, fallback matches `Overdrive-PPSA99058*.exfat`, but the packaged/documented name is `Overdrive.exfat`. A normal image install can therefore fail discovery, logging and abandoning the update check. Successful API discovery bypasses the defect.

Required fix: recognize the distributed filename with identity and ambiguity safeguards.

### A5 — Major, distribution-dependent: Update feed points at upstream

Evidence: `app/state/update.js:11-13,33-50`, `.github/workflows/build.yml:90-98`, `app/state/updater.js:27-34`.

The default feed is MyLuxy/overdrive while CI publishes into the workflow repository. Independent releases in IMBANEKONTRITSYA/overdrivePS5 will not be discovered by the unchanged default. A newer compatible upstream release may be offered and replace this rebuild only if the user initiates installation and asset/digest requirements pass; this is not a silent automatic overwrite.

Required decision: use this fork as the distribution feed or intentionally retain upstream. Update documentation links consistently once decided.

### A6 — Major catalog usability: Many visible entries have only marked-unavailable releases

Evidence: `app/data/releases/CUSA00003.json`, `app/game/sources.js:52-53`, `app/state/download-queue.js:625,1086`, `app/state/catalog.js:181-183`.

706 of 1,845 listed entries and two of 217 alternate entries have no raw release without a truthy `unavailableReason`. Across release files, 1,198 records carry explicit HTTP refusal metadata: 742 HTTP 401 and 456 HTTP 403, all Archive.org providers after case normalization. Counts concern entries, not unique works; raw records are counted before multipart grouping. They are not current live availability measurements.

Required fix: honestly distinguish browseable metadata from downloadable content; avoid promoting known-unavailable choices. Use homebrew or otherwise authorized payloads for end-to-end tests. Do not bypass provider access controls.

### A7 — Localization gap: Update and browser-capture instructions fall back to English

Evidence: `app/i18n/core.js:31-51`, `app/i18n/locales/*.json`, `app/downloads/BrowserCaptureDialog.jsx:31-34`, `app/ui/UpdateDialog.jsx:56-78`.

Eleven dictionaries lack seventeen English keys (five capture keys, `downloads.notice.captured`, eleven update keys). Brazilian Portuguese lacks `downloads.notice.captured`. Fallback keeps rendering functional but leaves actionable instructions untranslated. Treat as localized-feature completion, not a boot blocker. Use the project's add-i18n-string skill for changes across all fourteen dictionaries.

### A8 — Minor: Folder publication has a non-idempotent crash window

Evidence: `app/state/download-queue.js:449-457,560-575,981-1000`.

The folder is renamed into homebrew before publication metadata is persisted. A crash or cleanup error in that window can leave an already published folder with stale queue metadata; retry meets an existing destination. This is failed automatic recovery, not demonstrated loss of the published application.

### A9 — Minor: Explicit package-install retry cancellation leaves stale queue state

Evidence: `app/state/download-queue.js:234-241,1125-1143,1255-1261`.

The early install-retry branch bypasses normal cancellation cleanup and can retain `cancelling=true`, usually in `installer-required`. Native client cancellation does not guarantee console installation stops. Recovery must preserve package/installed files and must not assume cancellation rolls installation back.

### A10 — Minor: Storage statistics can remain stale during steady transfers

Evidence: `app/downloads/useQueue.js:15,23-26`, `app/downloads/SummaryPanel.jsx:38-88`.

Parent queue updates omit byte/speed-only progress; the Activity child updates independently, while sibling Drive usage reads only during render. Free-space text and bars can remain unchanged until another parent render. Independent queue capacity checks still exist; this is informational staleness, not proven capacity-check failure.

### A11 — Minor/documented limitation: Folder installs have no automatic update path

Evidence: `app/state/update.js:20-22`, `app/state/updater.js:30-34`, `app/browse/BrowsePage.jsx:34-50`.

Folder installs intentionally select no release asset. A manual migration notice already exists; do not report this as absent guidance or an image-install blocker. Its wording says automatic updates stop "soon" despite already being disabled.

## Refuted claim — do not repeat

The claim that automatic browser capture cannot match `vik1ngfile.site` because the queue passes only the canonical prefix was refuted. The native PS5 browser matcher recognizes both domains (`ps5-react/native/ps5/payloads/browser/browser_match.c`, `browser_url.c`, `browser_scan.c`). Passing a single prefix is not the effective domain restriction. Actual hardware capture success remains untested. No vendored edit is called for.

## Implementation order and acceptance checks

1. A1/A2 deletion safety first. Tests: active extraction folder, active queue package, local package installation, app folder/image, overlapping ancestor/child paths, sibling names sharing a prefix, operations started during an awaited mount check, queue/mount lookup failure, remount during an install. Assert refusal causes zero removal calls; ordinary unrelated files must remain deletable.
2. A3/A8 recovery. Test completed corrupt archive restart, partial resume, crash before/after publication metadata save, existing unrelated output, and persistence restoration. Never delete unrelated or installed output to make retry pass.
3. Reproducible Linux build using CI's toolchain; verify bundle/resources/native package and exFAT packaging. Do not edit vendored framework or call a JS-only check a PS5 build.
4. Console smoke test with an authorized payload: boot, navigate by controller, choose source/storage, download, interrupt/relaunch/resume, extract, install, inspect Files and remove safely. Include offline, low-space and disconnected-drive cases.
5. A4/A5 update discovery and distribution decision. Exercise normal image API discovery, API-unavailable fallback, duplicate installs, digest failure, interrupted replacement and manual legacy-folder migration.
6. A6 availability presentation, A7 translations, then A9/A10 and controller/RTL polish.

## Implementation record

2026-11-12, branch `claude/compassionate-sagan-0kznhd`. Verification so far: every locale parses with the same 424 keys, and the full Linux build (`tools/build_ps5.py --app-dir ../app --llvm /usr/bin`, clang 18, with the mirrored dependencies from B1 in place) completed on the final tree: `tools/verify.py PPSA99058` reports `PASS: title metadata, icon, PS5 ELF/segments, SELF integrity, hashes and ZIP`, producing `dist/PPSA99058` (75 MB), `PPSA99058.zip` and the receipt. The exFAT packaging (`make-exfat.sh` needs `mkfs.exfat` and root) could not run in that environment, but CI did: workflow run 43311750722 on commit `a63549d` (the first run of this repository's workflow; the two runs just before it never started, blocked by GitHub Actions billing) fetched both mirrored dependencies, built with `verify.py` PASS, packaged `Overdrive.exfat` (466,616,320 bytes) and `update.zip` (21,328,923 bytes) and put them, with sha256 digests, in draft release `v1.0.2`. The console run was not performed; each item below stays **open for console verification** until that happens.

- **A1/A2 — implemented.** `app/files/useFiles.js` refuses, before and again after the asynchronous mount check, any deletion whose targets overlap (by path segment) a job that is queued, running or deleting itself, a package the Files screen is installing (held in a module-level set, so leaving the screen does not drop the lock), or Overdrive's own install: the `PPSA99058` folder, an `Overdrive.exfat` / `Overdrive-PPSA99058*.exfat` image, or whatever path ShadowMount's `games/info` reports for the title. A refusal removes nothing and `FilesScreen.jsx` shows its reason (`files.kept*`). Installing a file that is being deleted is refused too.
- **A3 — implemented.** `restart` of a single-file job that downloaded its final file itself (storage identity known, not adopted, bytes written) discards that file, its sidecars and an unpublished `downloads/extracted` output of its own, then starts fresh. Set jobs, adopted files and published output are untouched.
- **A4 — implemented.** `install-location.js` accepts `Overdrive.exfat` as well as `Overdrive-PPSA99058*.exfat`; two matches still read as installed twice.
- **A5 — decided and implemented.** The feed is this repository's `releases/latest`; the in-app migration link, `update.replaceByHand`, both READMEs and the issue templates point here. Copies built from upstream keep upstream's feed.
- **A7 — implemented.** All fourteen dictionaries carry the same keys.
- **A8 — implemented.** The folder publication records `publishTo` and saves before the rename into `homebrew`, and tolerates meeting its own folder on retry.
- **A9 — implemented.** Cancelling an install retry only cancels the console's task; the job is not flagged `cancelling` and the package stays.
- **A10 — implemented.** The Downloads panel re-reads drive usage every 5 s while shown.
- **A11 — implemented.** The folder-install notice says updates are not offered, not "soon".
- **A6 — implemented, presentation only.** The catalog does carry an availability summary: `providers` lists hosts of releases not marked unavailable, and all 706 listed entries without a usable release (and no others) have `providers: []`, so `downloadable(game)` in `app/state/catalog.js` needs no release file at startup. Such entries no longer fill the spotlight, the popular and top-chart showcases or the genre covers; detailed cards mark them "No source"; the game page shows the Download button as unavailable with "Its sources are no longer available" and does not enqueue; a "Has a source" option in the Download filter hides them. `describeSource` no longer attaches speed claims to unavailable sources. Entries stay browseable; no provider request or access-control workaround was added. Remaining: multipart sets are judged by the same `providers` summary, which is not validated per volume.
- **B1 — Major, new: two pinned build dependencies have left GitHub.** `blackbearreloaded/ps5-homebrew-ui` (the `platform` checkout) and the `blackbearreloaded/ps5-opengl` v1.0.0 SDK release return 404 / "not found" from GitHub, so `build_ps5.py`, and therefore the workflow, failed at the first `git clone`; this repository has never had a workflow run. Fixed without touching `ps5-react/`: `packaging/fetch-deps.sh` seeds `.deps/platform` from forks that still carry commit `4bd94257` (JVK3R, Skystar9999, Phononenom, J7mbo; checked 2026-11-12) and the SDK tarball from JVK3R's release, whose sha256 equals the pin; the build's own revision and digest checks remain the gate. The workflow runs the script before Build; both READMEs document it. Exercised here: fresh run and idempotent second run of the script, and the build past dependency checkout with these files in place.

## Resume guidance

Do not repeat the entire audit before implementation. Read the relevant finding and its files, confirm that the baseline code still matches, then implement a narrow change with targeted tests. All findings remain **open** until a fix and its actual verification are recorded. Static checks do not replace a Linux build or console run. No issue numbers, PRs, successful builds, or implemented fixes are implied by this document.
