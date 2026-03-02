# Publish Commands (SessionDeck)

## 0) Go to project root

```bash
cd "/Users/Ryansmac/Vibe code projects/CC-Session-Deck"
```

## 1) Optional but recommended: set your git identity (avoid exposing local hostname email)

```bash
git config --global user.name "YOUR_GITHUB_NAME"
git config --global user.email "YOUR_GITHUB_EMAIL"
```

If you want to fix the already-created commit author:

```bash
git commit --amend --reset-author --no-edit
```

## 2) Check local state

```bash
git status
git log --oneline --decorate -n 3
git tag --list
```

## 3) Authenticate GitHub CLI (one-time)

```bash
gh auth login
```

## 4) Create GitHub repo and set remote (public)

```bash
gh repo create sessiondeck --public --source=. --remote=origin --description "Local web console for browsing and governing Claude Code sessions safely without mutating source session data"
```

## 5) Push main / develop / tags

```bash
git push -u origin main
git push -u origin develop
git push origin v0.1.0
```

## 6) Set repository topics

```bash
gh repo edit --add-topic claude-code --add-topic session-manager --add-topic local-first --add-topic privacy --add-topic nodejs --add-topic web-ui --add-topic markdown-export --add-topic recovery
```

## 7) Create first GitHub release

```bash
gh release create v0.1.0 \
  --title "SessionDeck v0.1.0" \
  --notes-file docs/releases/v0.1.0.md
```

## 8) Verify

```bash
gh repo view --web
```
