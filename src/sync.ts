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
  materializeSkillsHub,
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
 * Bootstrap ~/.agents when missing, using ~/.claude as seed.
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
      actions.push(
        await writeTextFile(
          rootAgentsMd,
          "# Agents\n\nGlobal agent instructions.\n",
          dryRun,
        ),
      );
    }
  }

  if (await pathExists(claudeSkills)) {
    const claudeDesc = await describeLink(claudeSkills);
    // Only copy when claude has a real skills tree (not a symlink into agents)
    if (!claudeDesc.startsWith("symlink ->")) {
      actions.push(
        ...(await copyMissingSkills(claudeSkills, agentsSkills, dryRun, {
          replaceSymlinks: false,
        })),
      );
    }
  }

  return actions;
}

export async function sync(options: SyncOptions = {}): Promise<SyncResult> {
  const dryRun = options.dryRun ?? false;
  const paths = options.paths ?? resolvePaths();
  const actions: Action[] = [];

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

  actions.push(await ensureDir(agentsSkills, dryRun));

  // Heal source hub: agents must own real skill directories (no chains/cycles)
  actions.push(...(await materializeSkillsHub(agentsSkills, dryRun)));

  for (const dir of [
    codexSkills,
    antigravitySkills,
    antigravityCliSkills,
    ...asideUserSkills,
  ]) {
    actions.push(await ensureDir(dir, dryRun));
  }

  actions.push(await ensureDir(paths.claudeDir, dryRun));
  actions.push(
    await writeTextFile(
      claudeMdPath(paths.claudeDir),
      CLAUDE_MD_TEMPLATE,
      dryRun,
    ),
  );

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

  actions.push(
    ...(await linkIfMissing(
      skillsDir(paths.claudeDir),
      agentsSkills,
      dryRun,
    )),
  );

  // Symlink-friendly harnesses
  for (const dst of [codexSkills, antigravitySkills, antigravityCliSkills]) {
    actions.push(...(await linkMissingSkills(agentsSkills, dst, dryRun)));
  }

  // Aside: copy real skill trees (many Electron apps don't load skill symlinks)
  // Existing real custom dirs are left untouched; prior symlinks from us are replaced.
  for (const dst of asideUserSkills) {
    actions.push(
      ...(await copyMissingSkills(agentsSkills, dst, dryRun, {
        replaceSymlinks: true,
      })),
    );
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
      case "materialize":
        lines.push(`materialize ${a.path} <- ${a.from}`);
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
