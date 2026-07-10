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
  listSkillNames,
  describeLink,
  pathExists,
  writeTextFile,
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

export async function sync(options: SyncOptions = {}): Promise<SyncResult> {
  const dryRun = options.dryRun ?? false;
  const paths = options.paths ?? resolvePaths();
  const actions: Action[] = [];

  const rootAgentsMd = agentsMdPath(paths.agentsDir);
  if (!(await pathExists(rootAgentsMd))) {
    throw new Error(`missing ${rootAgentsMd}`);
  }

  for (const dir of [
    skillsDir(paths.agentsDir),
    skillsDir(paths.codexDir),
    skillsDir(paths.antigravityDir),
    skillsDir(paths.antigravityCliDir),
  ]) {
    actions.push(await ensureDir(dir, dryRun));
  }

  // Ensure Claude dir exists before writing CLAUDE.md
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

  actions.push(
    await linkIfMissing(
      skillsDir(paths.claudeDir),
      skillsDir(paths.agentsDir),
      dryRun,
    ),
  );

  const agentsSkills = skillsDir(paths.agentsDir);
  const codexSkills = skillsDir(paths.codexDir);
  const antigravitySkills = skillsDir(paths.antigravityDir);
  const antigravityCliSkills = skillsDir(paths.antigravityCliDir);

  // agents <-> codex
  actions.push(...(await linkMissingSkills(codexSkills, agentsSkills, dryRun)));
  actions.push(...(await linkMissingSkills(agentsSkills, codexSkills, dryRun)));
  // agents/codex -> antigravity
  actions.push(
    ...(await linkMissingSkills(agentsSkills, antigravitySkills, dryRun)),
  );
  actions.push(
    ...(await linkMissingSkills(codexSkills, antigravitySkills, dryRun)),
  );
  // agents/codex -> antigravity-cli
  actions.push(
    ...(await linkMissingSkills(agentsSkills, antigravityCliSkills, dryRun)),
  );
  actions.push(
    ...(await linkMissingSkills(codexSkills, antigravityCliSkills, dryRun)),
  );

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

  const hubsSpec = [
    { name: "agents", dir: skillsDir(paths.agentsDir) },
    { name: "claude", dir: skillsDir(paths.claudeDir) },
    { name: "codex", dir: skillsDir(paths.codexDir) },
    { name: "antigravity", dir: skillsDir(paths.antigravityDir) },
    { name: "antigravity-cli", dir: skillsDir(paths.antigravityCliDir) },
  ] as const;

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
      case "skip":
        if (verbose) lines.push(`skip ${a.path} (${a.reason})`);
        break;
    }
  }
  return lines;
}
