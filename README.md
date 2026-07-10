# agentskillsync

One-way **sync** of `~/.agents` skills (source of truth) into harnesses that do not natively read `~/.agents` (Claude Code, Codex, Antigravity, Aside).

Target-only custom skills (for example Aside user skills) are left untouched and never pulled into `~/.agents`.

## Run

```bash
npx agentskillsync
```

## Install

```bash
npm i -g agentskillsync
agentskillsync
# alias:
syncskills
```

## Usage

```bash
agentskillsync              # push agents skills one-way
agentskillsync --dry-run
agentskillsync status
agentskillsync status -v
```

## Behavior

1. **Source of truth:** `$AGENTS_DIR` (default `~/.agents`)
2. **Bootstrap:** if agents is missing, seed from `~/.claude`
3. Write Claude / Codex / Antigravity / Aside instruction stubs
4. Symlink `~/.claude/skills` → `~/.agents/skills` when missing
5. **One-way** link each agents skill into other hubs when missing
6. Destination-only customs stay on the destination only

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

## License

MIT
