import {
  AGENTS_MD_STUB,
  CLAUDE_MD_TEMPLATE,
  agentsMdPath,
  claudeMdPath,
  resolvePaths,
  skillsDir,
  type Paths,
} from "./paths";
import {
  ensureDir,
  linkIfMissing,
  linkMissingSkills,
  copyMissingSkills,
  listSkillNames,
  describeLink,
  pathExists,
  writeTextFile,
  readTextFile,
  type Action,
} from "./fs";

export type SyncOptions = {
  dryRun?: boolean;
  verbose?: boolean;
  paths?: Paths;
};

export type SyncResult = {
  actions: Action[];
  paths: Paths;
};

/**
 * Bootstrap ~/.agents when missing, using ~/.claude as seed:
 * - copy CLAUDE.md -> AGENTS.md if agents root file is missing
 * - copy missing skills from claude/skills into agents/skills
 *
 * ~/.agents is the source of truth after bootstrap.
 */
async function bootstrapAgentsFromClaude(
  paths: Paths,
  dryRun: boolean,
): Promise<Action[]> {
  const actions: Action[] = [];
  const agentsSkills = skillsDir(paths.agentsDir);
  const claudeSkills = skillsDir(paths.claudeDir);
  const rootAgentsMd = agentsMdPath(paths.agentsDir);
  const claudeMd = claudeMdPath(paths.claudeDir);

  actions.push(await ensureDir(paths.agentsDir, dryRun));
  actions.push(await ensureDir(agentsSkills, dryRun));

  if (!(await pathExists(rootAgentsMd))) {
    if (await pathExists(claudeMd)) {
      const content = (await readTextFile(claudeMd)) ?? "";
      actions.push(await writeTextFile(rootAgentsMd, content, dryRun));
    } else {
      // Minimal seed so sync can proceed
      actions.push(
        await writeTextFile(
          rootAgentsMd,
          "# Agents\n\nGlobal agent instructions.\n",
          dryRun,
        ),
      );
    }
  }

  // Only seed skills when claude has a real skills tree that isn't already agents
  if (await pathExists(claudeSkills)) {
    const claudeDesc = await describeLink(claudeSkills);
    const alreadyPointsAtAgents =
      claudeDesc === `symlink -> ${agentsSkills}` ||
      claudeDesc.startsWith("symlink ->") &&
        (await pathExists(agentsSkills)) &&
        (await listSkillNames(agentsSkills)).length > 0 &&
        claudeDesc.includes(".agents/skills");

    const agentsCount = (await listSkillNames(agentsSkills)).length;
    if (!alreadyPointsAtAgents || agentsCount === 0) {
      // If claude/skills is a symlink to agents, copyMissingSkills is a no-op
      // for empty cases; if it's a real dir with skills, seed agents.
      if (!claudeDesc.startsWith("symlink ->") || agentsCount === 0) {
        // When claude is a symlink into agents already, skip copy.
        if (!claudeDesc.startsWith("symlink ->")) {
          actions.push(
            ...(await copyMissingSkills(claudeSkills, agentsSkills, dryRun)),
          );
        }
      }
    }
  }

  return actions;
}

export async function sync(options: SyncOptions = {}): Promise<SyncResult> {
  const dryRun = options.dryRun ?? false;
  const paths = options.paths ?? resolvePaths();
  const actions: Action[] = [];

  // Bootstrap ~/.agents from ~/.claude when needed
  actions.push(...(await bootstrapAgentsFromClaude(paths, dryRun)));

  const rootAgentsMd = agentsMdPath(paths.agentsDir);
  if (!(await pathExists(rootAgentsMd))) {
    throw new Error(
      `missing ${rootAgentsMd} (could not bootstrap from ${paths.claudeDir})`,
    );
  }

  const agentsSkills = skillsDir(paths.agentsDir);
  const codexSkills = skillsDir(paths.codexDir);
  const antigravitySkills = skillsDir(paths.antigravityDir);
  const antigravityCliSkills = skillsDir(paths.antigravityCliDir);
  const asideUserSkills = paths.asideUserSkillDirs;

  // Ensure destination skill roots exist
  for (const dir of [
    agentsSkills,
    codexSkills,
    antigravitySkills,
    antigravityCliSkills,
    ...asideUserSkills,
  ]) {
    actions.push(await ensureDir(dir, dryRun));
  }

  // Claude instruction file + whole skills dir link to agents
  actions.push(await ensureDir(paths.claudeDir, dryRun));
  actions.push(
    await writeTextFile(
      claudeMdPath(paths.claudeDir),
      CLAUDE_MD_TEMPLATE,
      dryRun,
    ),
  );

  // AGENTS.md stubs for non-agents harness roots
  for (const root of [
    paths.codexDir,
    paths.antigravityDir,
    paths.antigravityCliDir,
  ]) {
    actions.push(await ensureDir(root, dryRun));
    actions.push(
      await writeTextFile(agentsMdPath(root), AGENTS_MD_STUB, dryRun),
    );
  }

  for (const userSkills of asideUserSkills) {
    const mainDir = userSkills.replace(/\/skills\/user\/?$/, "");
    if (mainDir !== userSkills) {
      actions.push(await ensureDir(mainDir, dryRun));
      actions.push(
        await writeTextFile(agentsMdPath(mainDir), AGENTS_MD_STUB, dryRun),
      );
    }
  }

  // Prefer single Claude skills hub -> agents
  actions.push(
    await linkIfMissing(
      skillsDir(paths.claudeDir),
      agentsSkills,
      dryRun,
    ),
  );

  // ONE-WAY: agents is source of truth -> push into destinations only.
  // Custom skills already present on a target are left untouched.
  const destinations = [
    codexSkills,
    antigravitySkills,
    antigravityCliSkills,
    ...asideUserSkills,
  ];

  for (const dst of destinations) {
    actions.push(...(await linkMissingSkills(agentsSkills, dst, dryRun)));
  }

  return { actions, paths };
}

export type StatusReport = {
  paths: Paths;
  rootAgentsMd: { path: string; exists: boolean };
  claudeMd: { path: string; exists: boolean };
  claudeSkills: string;
  hubs: Array<{
    name: string;
    dir: string;
    skillCount: number;
    skills: string[];
  }>;
};

export async function status(options: SyncOptions = {}): Promise<StatusReport> {
  const paths = options.paths ?? resolvePaths();
  const rootAgentsMd = agentsMdPath(paths.agentsDir);
  const claudeMd = claudeMdPath(paths.claudeDir);

  const hubsSpec: Array<{ name: string; dir: string }> = [
    { name: "agents (source)", dir: skillsDir(paths.agentsDir) },
    { name: "claude", dir: skillsDir(paths.claudeDir) },
    { name: "codex", dir: skillsDir(paths.codexDir) },
    { name: "antigravity", dir: skillsDir(paths.antigravityDir) },
    { name: "antigravity-cli", dir: skillsDir(paths.antigravityCliDir) },
  ];

  for (const dir of paths.asideUserSkillDirs) {
    const m = dir.match(/\/u\/(\d+)\/agents\/main\/skills\/user\/?$/);
    const name = m ? `aside-u${m[1]}-user` : `aside-user:${dir}`;
    hubsSpec.push({ name, dir });
  }

  const hubs = [];
  for (const h of hubsSpec) {
    const skills = await listSkillNames(h.dir);
    hubs.push({
      name: h.name,
      dir: h.dir,
      skillCount: skills.length,
      skills,
    });
  }

  return {
    paths,
    rootAgentsMd: {
      path: rootAgentsMd,
      exists: await pathExists(rootAgentsMd),
    },
    claudeMd: {
      path: claudeMd,
      exists: await pathExists(claudeMd),
    },
    claudeSkills: await describeLink(skillsDir(paths.claudeDir)),
    hubs,
  };
}

export function formatActions(actions: Action[], verbose = false): string[] {
  const lines: string[] = [];
  for (const a of actions) {
    switch (a.type) {
      case "mkdir":
        if (verbose) lines.push(`mkdir ${a.path}`);
        break;
      case "write":
        if (a.changed) lines.push(`write ${a.path}`);
        else if (verbose) lines.push(`unchanged ${a.path}`);
        break;
      case "link":
        if (a.created) lines.push(`linked ${a.path} -> ${a.target}`);
        break;
      case "copy":
        lines.push(`copy ${a.from} -> ${a.path}`);
        break;
      case "remove":
        lines.push(`remove ${a.path}`);
        break;
      case "skip":
        if (verbose) lines.push(`skip ${a.path} (${a.reason})`);
        break;
    }
  }
  return lines;
}
