# syncskills

CLI to sync `~/.agents` skills and root `AGENTS.md` into harness directories that do not natively read `~/.agents` (Claude Code, Codex, Antigravity, Antigravity CLI, Aside).

## Install

```bash
npm i -g @solim/syncskills
# or from a local checkout
npm link
# or
bun add -g @solim/syncskills
```

The binary name is `syncskills`.

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
4. Writes `AGENTS.md` stubs for each Aside profile `agents/main`
5. Symlinks `~/.claude/skills` → `~/.agents/skills` when missing
6. Symlinks missing skill folders bidirectionally across agents / codex / antigravity hubs
7. Mirrors skills into each Aside profile `skills/user` (and mirrors Aside user skills back)

Skill folders whose names start with `.` (for example Codex `.system`) are skipped.

## Environment overrides

| Variable | Default |
| --- | --- |
| `AGENTS_DIR` | `~/.agents` |
| `CLAUDE_DIR` | `~/.claude` |
| `CODEX_DIR` | `~/.codex` |
| `ANTIGRAVITY_DIR` | `~/.gemini/antigravity` |
| `ANTIGRAVITY_CLI_DIR` | `~/.gemini/antigravity-cli` |
| `ASIDE_DIR` | `~/.aside` |
| `ASIDE_USER_SKILLS_DIRS` | all `~/.aside/u/<id>/agents/main/skills/user` |

## Development

```bash
bun install
bun test
bun run build
bun run src/cli.ts status
npm link   # expose syncskills on your PATH from this checkout
```

## License

MIT
