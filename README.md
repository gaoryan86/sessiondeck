# SessionDeck

SessionDeck is a local web app for managing Claude Code sessions with visual browsing, safe governance, and no mutation of source session data.

SessionDeck 是一个本地 Web 工具，用来管理 Claude Code 本地会话，强调可视化浏览 + 安全治理 + 不改源数据。

## Features

### Session Manager

- List sessions with `project`, `summary`, `first prompt`, `last prompt`, `message count`, `modified time`
- Keyword filtering and batch selection
- Safe delete via system Trash (no hard delete)

### Recovery (Read-only)

- Load main session + subagents by `sessionId`
- View pre-compact context only
- Locate compact points
- Export current view to Markdown

### Advanced

- Rebuild official `sessions-index.json` without mutating session content
- Full-text search across sessions (optional subagents included)
- Session naming/tagging via sidecar metadata (no source rewrite)
- Batch export selected sessions to Markdown

### UI

- Default English UI, with EN/中文 toggle
- War-room inspired visual theme

## Data Safety Boundary

- Recovery is read-only.
- Naming and tags are stored in sidecar metadata, not in source session files.
- Only deletion touches session files, and deletion goes through system Trash.

## Architecture

- Frontend: single-page `index.html`
- Backend: Node.js `server.mjs`
- Start/stop scripts: `Start Web Manager.command`, `Stop Web Manager.command`, `run.sh`

## Requirements

- Node.js 18+
- Claude Code local sessions directory (default `~/.claude/projects`)

## Quick Start

### Option A: Double-click scripts (macOS)

- `Start Web Manager.command`: start and open browser
- `Stop Web Manager.command`: stop service

### Option B: Terminal

```bash
cd "/path/to/SessionDeck"
./run.sh
```

Server default URL: <http://127.0.0.1:47831>

## Configuration

- `PORT` (default `47831`)
- `CLAUDE_PROJECTS` (default `~/.claude/projects`)

```bash
PORT=47840 CLAUDE_PROJECTS="$HOME/.claude/projects" ./run.sh
```

## Project Status

- Current release target: `v0.1.0`
- See [`CHANGELOG.md`](./CHANGELOG.md) for release history.

## Contributing

Please read [`CONTRIBUTING.md`](./CONTRIBUTING.md) before opening PRs.

## Security

Please report vulnerabilities via [`SECURITY.md`](./SECURITY.md).

## License

MIT License. See [`LICENSE`](./LICENSE).
