import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  rm,
  symlink,
  writeFile,
  lstat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sync, status } from "./sync";
import type { Paths } from "./paths";
import { pathExists, linkIfMissing, resolveRealSkillDir } from "./fs";

let root: string;
let paths: Paths;

async function touchSkill(hub: string, name: string) {
  const dir = join(hub, name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "SKILL.md"), `# ${name}\n`, "utf8");
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "syncskills-"));
  const aside0 = join(root, "aside", "u", "0", "agents", "main", "skills", "user");
  const aside1 = join(root, "aside", "u", "1", "agents", "main", "skills", "user");
  paths = {
    agentsDir: join(root, "agents"),
    claudeDir: join(root, "claude"),
    codexDir: join(root, "codex"),
    antigravityDir: join(root, "antigravity"),
    antigravityCliDir: join(root, "antigravity-cli"),
    asideDir: join(root, "aside"),
    asideUserSkillDirs: [aside0, aside1],
  };
  await mkdir(join(paths.agentsDir, "skills"), { recursive: true });
  await writeFile(
    join(paths.agentsDir, "AGENTS.md"),
    "# root agents\n",
    "utf8",
  );
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("sync", () => {
  test("pushes agents skills; copies into Aside; leaves customs", async () => {
    await touchSkill(join(paths.agentsDir, "skills"), "foo");
    await mkdir(join(paths.codexDir, "skills"), { recursive: true });
    await touchSkill(join(paths.codexDir, "skills"), "codex-only");
    await mkdir(paths.asideUserSkillDirs[0]!, { recursive: true });
    await touchSkill(paths.asideUserSkillDirs[0]!, "aside-only");

    await sync({ paths });

    // codex gets symlink
    expect(await readlink(join(paths.codexDir, "skills", "foo"))).toBe(
      join(paths.agentsDir, "skills", "foo"),
    );

    // Aside gets a real copy (not a symlink)
    const asideFoo = join(paths.asideUserSkillDirs[0]!, "foo");
    const st = await lstat(asideFoo);
    expect(st.isSymbolicLink()).toBe(false);
    expect(st.isDirectory()).toBe(true);
    expect(await pathExists(join(asideFoo, "SKILL.md"))).toBe(true);

    // customs untouched / not pulled into agents
    expect(
      await pathExists(join(paths.codexDir, "skills", "codex-only")),
    ).toBe(true);
    expect(
      await pathExists(join(paths.asideUserSkillDirs[0]!, "aside-only")),
    ).toBe(true);
    expect(
      await pathExists(join(paths.agentsDir, "skills", "codex-only")),
    ).toBe(false);
    expect(
      await pathExists(join(paths.agentsDir, "skills", "aside-only")),
    ).toBe(false);
  });

  test("materializes agents symlink skills into real dirs", async () => {
    const real = join(root, "real-skill");
    await mkdir(real, { recursive: true });
    await writeFile(join(real, "SKILL.md"), "# real\n", "utf8");
    await symlink(real, join(paths.agentsDir, "skills", "linked"));

    await sync({ paths });

    const agentsSkill = join(paths.agentsDir, "skills", "linked");
    const st = await lstat(agentsSkill);
    expect(st.isSymbolicLink()).toBe(false);
    expect(await pathExists(join(agentsSkill, "SKILL.md"))).toBe(true);
    // Aside copy exists as real dir too
    const asideSkill = join(paths.asideUserSkillDirs[0]!, "linked");
    expect((await lstat(asideSkill)).isSymbolicLink()).toBe(false);
  });

  test("removes cyclic broken agents skill links", async () => {
    const a = join(paths.agentsDir, "skills", "loop");
    const b = join(paths.codexDir, "skills", "loop");
    await mkdir(join(paths.codexDir, "skills"), { recursive: true });
    await symlink(b, a);
    await symlink(a, b);
    expect(await resolveRealSkillDir(a)).toBe(null);

    await sync({ paths });
    expect(await pathExists(a)).toBe(false);
  });

  test("bootstraps agents from claude when agents is missing", async () => {
    await rm(paths.agentsDir, { recursive: true, force: true });
    await mkdir(join(paths.claudeDir, "skills"), { recursive: true });
    await writeFile(
      join(paths.claudeDir, "CLAUDE.md"),
      "# from claude\n",
      "utf8",
    );
    await touchSkill(join(paths.claudeDir, "skills"), "seeded");

    await sync({ paths });

    expect(await pathExists(join(paths.agentsDir, "AGENTS.md"))).toBe(true);
    expect(
      await pathExists(join(paths.agentsDir, "skills", "seeded", "SKILL.md")),
    ).toBe(true);
    expect(await readlink(join(paths.codexDir, "skills", "seeded"))).toBe(
      join(paths.agentsDir, "skills", "seeded"),
    );
  });

  test("skips dangling symlinks instead of throwing EEXIST", async () => {
    const hub = join(paths.agentsDir, "skills");
    await symlink(join(hub, "missing-target"), join(hub, "dangling"));
    expect(await pathExists(join(hub, "dangling"))).toBe(true);
    const actions = await linkIfMissing(
      join(hub, "dangling"),
      join(hub, "other"),
      false,
    );
    expect(actions.some((a) => a.type === "skip")).toBe(true);
  });

  test("dry-run does not write files", async () => {
    await touchSkill(join(paths.agentsDir, "skills"), "foo");
    await sync({ paths, dryRun: true });
    expect(await pathExists(join(paths.claudeDir, "CLAUDE.md"))).toBe(false);
  });

  test("status reports hubs including aside profiles", async () => {
    await touchSkill(join(paths.agentsDir, "skills"), "foo");
    await sync({ paths });
    const report = await status({ paths });
    expect(report.rootAgentsMd.exists).toBe(true);
    expect(
      report.hubs.find((h) => h.name === "agents (source)")?.skillCount,
    ).toBe(1);
    expect(report.hubs.some((h) => h.name === "aside-u0-user")).toBe(true);
  });
});
