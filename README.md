# syncskills

CLI to sync `~/.agents` skills and root `AGENTS.md` into harness directories that do not natively read `~/.agents` (Claude Code, Codex, Antigravity, Antigravity CLI).

## Install

```bash
npm i -g syncskills
# or
bun add -g syncskills
```

## Usage

```bash
# mirror skills + write AGENTS.md / CLAUDE.md stubs
syncskills

# same as above
syncskills sync

# plan only
syncskills --dry-run

# inspect hubs
syncskills status
syncskills status --verbose
```

## What it does

1. Requires `$AGENTS_DIR/AGENTS.md` (default `~/.agents/AGENTS.md`) as source of truth
2. Writes `~/.claude/CLAUDE.md` pointing at `~/.agents/AGENTS.md` (+ Claude RTK include)
3. Writes `AGENTS.md` stubs for Codex / Antigravity / Antigravity CLI
4. Symlinks `~/.claude/skills` → `~/.agents/skills` when missing
5. Symlinks missing skill folders bidirectionally across agents / codex / antigravity hubs

Skill folders whose names start with `.` (for example Codex `.system`) are skipped.

## Environment overrides

| Variable | Default |
| --- | --- |
| `AGENTS_DIR` | `~/.agents` |
| `CLAUDE_DIR` | `~/.claude` |
| `CODEX_DIR` | `~/.codex` |
| `ANTIGRAVITY_DIR` | `~/.gemini/antigravity` |
| `ANTIGRAVITY_CLI_DIR` | `~/.gemini/antigravity-cli` |

## Development

```bash
bun install
bun test
bun run build
bun run src/cli.ts status
```

## License

MIT
