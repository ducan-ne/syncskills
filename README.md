# syncskills

One-way CLI sync: **`~/.agents` is the source of truth**. Skills are pushed into harness directories that do not natively read `~/.agents` (Claude Code, Codex, Antigravity, Aside).

Custom skills that already exist on a target (for example Aside user skills) are **left untouched** and are **never pulled into** `~/.agents`.

## Install

```bash
npm i -g @solim/syncskills
# or from a local checkout
npm link
```

Binary name: `syncskills`.

## Usage

```bash
syncskills              # push agents skills one-way
syncskills --dry-run    # plan only
syncskills status
syncskills status -v
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
