# syncagents

One-way sync: **`~/.agents` is the source of truth**. Push skills into harnesses that do not natively read `~/.agents` (Claude Code, Codex, Antigravity, Aside).

Target-only custom skills (for example Aside user skills) are left untouched and never pulled into `~/.agents`.

## Run

```bash
npx syncagents
```

## Install

```bash
npm i -g syncagents
syncagents
# alias also available:
syncskills
```

## Usage

```bash
syncagents              # push agents skills one-way
syncagents --dry-run    # plan only
syncagents status
syncagents status -v
```

## Behavior

1. **Source of truth:** `$AGENTS_DIR` (default `~/.agents`)
2. **Bootstrap:** if agents is missing, seed `AGENTS.md` + skills from `~/.claude`
3. Write `~/.claude/CLAUDE.md` pointing at `~/.agents/AGENTS.md`
4. Write `AGENTS.md` stubs for Codex / Antigravity / Aside profiles
5. Symlink `~/.claude/skills` → `~/.agents/skills` when missing
6. **One-way** link each agents skill into other hubs when that name is missing
7. Destination-only customs stay on the destination only

## Environment

| Variable | Default |
| --- | --- |
| `AGENTS_DIR` | `~/.agents` (source) |
| `CLAUDE_DIR` | `~/.claude` (bootstrap seed) |
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
```

## License

MIT
