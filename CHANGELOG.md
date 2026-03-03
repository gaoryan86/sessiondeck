# Changelog

All notable changes to this project will be documented in this file.

## [0.1.6] - 2026-03-03

### Fixed

- Fixed macOS Spotlight launcher breakage after moving the project directory.
- `scripts/install-macos-launcher.sh` now installs a stable helper script in `~/Applications` and points `Session Deck.app` to that helper.
- Launcher helper now searches common project locations when the old absolute path is no longer valid.

## [0.1.5] - 2026-03-03

### Changed

- Unified product terminology across docs to match the three-tab UI model:
  `Session Manager`, `Session Timeline`, and `Recovery`.
- Clarified that pre-compact context recovery belongs to `Session Timeline`.
- Added explicit `Recovery` module description for Trash-based restore workflow.

## [0.1.4] - 2026-03-03

### Added

- Three-view product structure with dedicated tabs: `Session Manager`, `Session Timeline`, and `Recovery`.
- New screenshot set aligned to the three main product sections.

### Changed

- Major frontend updates in `index.html` for the new three-section workflow.
- Backend updates in `server.mjs` to support the expanded UI and data flows.
- README and README.zh-CN were substantially refined and synchronized with the latest product behavior.

## [0.1.3] - 2026-03-02

### Fixed

- Global Search now filters the Session Manager table by matched session keys.
- Clearing Global Search results now restores the Session Manager table correctly.
- Manager preview is now cleared when active session is no longer visible after filtering.
- Demo Recovery screenshot flow now preserves `Event Detail` content.

### Changed

- Improved active tab contrast for `Session Manager` and `Recovery (Read-only)` to make selected state more obvious.
- Refreshed screenshots after loading the first session to ensure consistent example states.
- Added `test-results/` to `.gitignore` to prevent accidental test artifact commits.

## [0.1.2] - 2026-03-02

### Fixed

- macOS launcher now resolves Node.js reliably when started from Finder (non-interactive PATH).

### Changed

- Replaced Recovery screenshot with a sanitized view (no session content).

## [0.1.1] - 2026-03-02

### Added

- Bilingual full README: `README.md` + `README.zh-CN.md`.
- Cross-platform launcher scripts for Windows: `Session Deck.bat` and `Stop Session Deck.bat`.
- macOS Spotlight launcher installer: `scripts/install-macos-launcher.sh`.

### Changed

- Renamed macOS launch scripts to `Session Deck.command` and `Stop Session Deck.command`.
- Screenshot capture flow now supports `?demo=1` to auto-select a session and show richer preview states.
- Refreshed screenshots with selected session + visible preview context.

## [0.1.0] - 2026-03-02

### Added

- Session Manager with searchable list, batch selection, and key session columns.
- Safe delete flow: move session files to system Trash and remove index entries.
- Recovery read-only view: load main session and subagents, pre-compact mode, compact point navigation, Markdown export.
- Rebuild capability for official `sessions-index.json` without mutating session content.
- Full-text search across sessions with optional subagent coverage.
- Sidecar-based naming/tagging for sessions.
- Batch Markdown export for selected sessions.
- EN/中文 UI switch and war-room style visual theme.
- Open-source project scaffolding (`LICENSE`, `CONTRIBUTING`, `SECURITY`, CI syntax checks).
