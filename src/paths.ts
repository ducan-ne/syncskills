import { homedir } from "node:os";
import { join } from "node:path";

export type HarnessId =
  | "agents"
  | "claude"
  | "codex"
  | "antigravity"
  | "antigravity-cli";

export type Paths = {
  agentsDir: string;
  claudeDir: string;
  codexDir: string;
  antigravityDir: string;
  antigravityCliDir: string;
};

export function resolvePaths(env: NodeJS.ProcessEnv = process.env): Paths {
  const home = env.HOME || env.USERPROFILE || homedir();
  return {
    agentsDir: env.AGENTS_DIR || join(home, ".agents"),
    claudeDir: env.CLAUDE_DIR || join(home, ".claude"),
    codexDir: env.CODEX_DIR || join(home, ".codex"),
    antigravityDir: env.ANTIGRAVITY_DIR || join(home, ".gemini", "antigravity"),
    antigravityCliDir:
      env.ANTIGRAVITY_CLI_DIR || join(home, ".gemini", "antigravity-cli"),
  };
}

export function skillsDir(root: string): string {
  return join(root, "skills");
}

export function agentsMdPath(root: string): string {
  return join(root, "AGENTS.md");
}

export function claudeMdPath(root: string): string {
  return join(root, "CLAUDE.md");
}

/** Canonical root AGENTS.md pointer written into harness trees. */
export const AGENTS_MD_STUB = `@~/.agents/AGENTS.md
`;

/** Claude-specific root instruction file. */
export const CLAUDE_MD_TEMPLATE = `@~/.agents/AGENTS.md

## Claude Code

@RTK.md
`;
