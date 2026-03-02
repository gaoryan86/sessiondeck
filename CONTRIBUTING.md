# Contributing to SessionDeck

Thanks for contributing.

## Branch Strategy

- `main`: production-ready history.
- `develop`: integration branch for upcoming release.
- `feature/<name>`: new features.
- `fix/<name>`: bug fixes.
- `docs/<name>`: documentation-only changes.
- `release/vX.Y.Z`: release preparation.
- `hotfix/<name>`: urgent fixes off `main`.

## Development Setup

1. Use Node.js 18+.
2. Start locally:

```bash
./run.sh
```

3. Open <http://127.0.0.1:47831>.

## Pull Request Rules

1. Keep changes scoped and explain user impact.
2. Ensure local checks pass:

```bash
node --check server.mjs
bash -n run.sh
bash -n "Session Deck.command"
bash -n "Stop Session Deck.command"
```

3. Update `CHANGELOG.md` for user-facing changes.
4. Do not introduce source-session mutation outside existing safe boundaries.

## Commit Convention

Recommended format:

- `feat: ...`
- `fix: ...`
- `docs: ...`
- `chore: ...`
