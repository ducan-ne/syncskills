import { readdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type Paths = {
  agentsDir: string;
  claudeDir: string;
  codexDir: string;
  antigravityDir: string;
  antigravityCliDir: string;
  /** Aside root: ~/.aside */
  asideDir: string;
  /**
   * Per-profile Aside user skill hubs:
   * ~/.aside/u/<id>/agents/main/skills/user
   */
  asideUserSkillDirs: string[];
};

export function resolvePaths(env: NodeJS.ProcessEnv = process.env): Paths {
  const home = env.HOME || env.USERPROFILE || homedir();
  const asideDir = env.ASIDE_DIR || join(home, ".aside");
  return {
    agentsDir: env.AGENTS_DIR || join(home, ".agents"),
    claudeDir: env.CLAUDE_DIR || join(home, ".claude"),
    codexDir: env.CODEX_DIR || join(home, ".codex"),
    antigravityDir: env.ANTIGRAVITY_DIR || join(home, ".gemini", "antigravity"),
    antigravityCliDir:
      env.ANTIGRAVITY_CLI_DIR || join(home, ".gemini", "antigravity-cli"),
    asideDir,
    asideUserSkillDirs: discoverAsideUserSkillDirs(asideDir, env),
  };
}

/**
 * Discover Aside profile user-skill directories.
 * Default layout: $ASIDE_DIR/u/<profileId>/agents/main/skills/user
 *
 * Override with ASIDE_USER_SKILLS_DIRS as a colon-separated list of absolute paths.
 */
export function discoverAsideUserSkillDirs(
  asideDir: string,
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const override = env.ASIDE_USER_SKILLS_DIRS?.trim();
  if (override) {
    return override
      .split(":")
      .map((p) => p.trim())
      .filter(Boolean);
  }

  const usersRoot = join(asideDir, "u");
  if (!existsSync(usersRoot)) return [];

  let profileIds: string[];
  try {
    profileIds = readdirSync(usersRoot).filter((name) => /^\d+$/.test(name));
  } catch {
    return [];
  }

  return profileIds
    .sort((a, b) => Number(a) - Number(b))
    .map((id) => join(usersRoot, id, "agents", "main", "skills", "user"));
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
