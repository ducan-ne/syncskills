#!/usr/bin/env node
import { resolvePaths } from "./paths";
import { sync, status, formatActions } from "./sync";

const VERSION = "0.1.4";

function printHelp(): void {
  console.log(`syncskills v${VERSION}

Sync ~/.agents skills + root AGENTS.md into harness dirs that do not
read ~/.agents natively (Claude Code, Codex, Antigravity, Aside, etc.).

Usage:
  syncskills [sync] [options]
  syncskills status [options]
  syncskills help
  syncskills version

Commands:
  sync      Mirror skills + write AGENTS.md / CLAUDE.md stubs (default)
  status    Show current hubs, skill counts, and link state
  help      Show this help
  version   Print version

Options:
  --dry-run, -n   Plan only; do not write or create symlinks
  --verbose, -v   Show unchanged / skipped actions
  --help, -h      Show help
  --version       Show version

Environment:
  AGENTS_DIR              default: ~/.agents
  CLAUDE_DIR              default: ~/.claude
  CODEX_DIR               default: ~/.codex
  ANTIGRAVITY_DIR         default: ~/.gemini/antigravity
  ANTIGRAVITY_CLI_DIR     default: ~/.gemini/antigravity-cli
  ASIDE_DIR               default: ~/.aside
  ASIDE_USER_SKILLS_DIRS  colon-separated override for Aside user skill hubs
                          default: ~/.aside/u/<id>/agents/main/skills/user
                          (discovered across all numeric profiles)

What it does:
  1. Requires $AGENTS_DIR/AGENTS.md (source of truth)
  2. Writes Claude CLAUDE.md pointing at ~/.agents/AGENTS.md
  3. Writes AGENTS.md stubs for Codex / Antigravity / Antigravity CLI
  4. Writes AGENTS.md stubs for each Aside profile agents/main
  5. Symlinks ~/.claude/skills -> ~/.agents/skills when missing
  6. Symlinks missing skill folders across agents/codex/antigravity hubs
  7. Mirrors skills into each Aside profile skills/user (and back)
`);
}

function parseArgs(argv: string[]) {
  const flags = new Set<string>();
  const positionals: string[] = [];
  for (const arg of argv) {
    if (arg === "--") continue;
    if (arg.startsWith("-")) flags.add(arg);
    else positionals.push(arg);
  }
  return { flags, positionals };
}

async function main() {
  const { flags, positionals } = parseArgs(process.argv.slice(2));
  const dryRun = flags.has("--dry-run") || flags.has("-n");
  const verbose = flags.has("--verbose") || flags.has("-v");

  if (flags.has("--help") || flags.has("-h") || positionals[0] === "help") {
    printHelp();
    return;
  }
  if (flags.has("--version") || positionals[0] === "version") {
    console.log(VERSION);
    return;
  }

  const cmd = positionals[0] ?? "sync";
  const paths = resolvePaths();

  if (cmd === "status") {
    const report = await status({ paths });
    console.log("syncskills status\n");
    console.log(
      `root AGENTS.md: ${report.rootAgentsMd.path} (${report.rootAgentsMd.exists ? "ok" : "MISSING"})`,
    );
    console.log(
      `claude CLAUDE.md: ${report.claudeMd.path} (${report.claudeMd.exists ? "ok" : "missing"})`,
    );
    console.log(`claude skills: ${report.claudeSkills}`);
    console.log("");
    for (const h of report.hubs) {
      console.log(`${h.name}: ${h.dir} (${h.skillCount} skills)`);
      if (verbose && h.skills.length) {
        for (const s of h.skills) console.log(`  - ${s}`);
      }
    }
    if (!verbose) {
      console.log("\n(use --verbose to list skill names)");
    }
    return;
  }

  if (cmd !== "sync") {
    console.error(`unknown command: ${cmd}`);
    printHelp();
    process.exitCode = 1;
    return;
  }

  try {
    const result = await sync({ dryRun, verbose, paths });
    const lines = formatActions(result.actions, verbose);
    if (dryRun) console.log("dry-run: no changes written\n");
    for (const line of lines) console.log(line);
    if (!lines.length) {
      console.log(verbose ? "nothing to do" : "already in sync");
    }
    console.log(
      dryRun
        ? "\nWould sync global .agents <-> Claude/Codex/Antigravity/Aside."
        : "\nGlobal .agents <-> Claude Code/Codex/Antigravity/Aside compatibility synced.",
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`error: ${message}`);
    process.exitCode = 1;
  }
}

main();
