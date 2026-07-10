import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sync, status } from "./sync";
import type { Paths } from "./paths";
import { pathExists, linkIfMissing } from "./fs";

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
  test("writes stubs and links skills across hubs", async () => {
    await touchSkill(join(paths.agentsDir, "skills"), "foo");
    await mkdir(join(paths.codexDir, "skills"), { recursive: true });
    await touchSkill(join(paths.codexDir, "skills"), "bar");
    await mkdir(paths.asideUserSkillDirs[0]!, { recursive: true });
    await touchSkill(paths.asideUserSkillDirs[0]!, "aside-only");

    const result = await sync({ paths });
    expect(result.actions.some((a) => a.type === "write")).toBe(true);

    const claudeMd = await readFile(join(paths.claudeDir, "CLAUDE.md"), "utf8");
    expect(claudeMd).toContain("@~/.agents/AGENTS.md");
    expect(claudeMd).toContain("@RTK.md");

    const codexAgents = await readFile(
      join(paths.codexDir, "AGENTS.md"),
      "utf8",
    );
    expect(codexAgents.trim()).toBe("@~/.agents/AGENTS.md");

    const claudeSkills = await readlink(join(paths.claudeDir, "skills"));
    expect(claudeSkills).toBe(join(paths.agentsDir, "skills"));

    const barLink = await readlink(join(paths.agentsDir, "skills", "bar"));
    expect(barLink).toBe(join(paths.codexDir, "skills", "bar"));

    const fooInCodex = await readlink(join(paths.codexDir, "skills", "foo"));
    expect(fooInCodex).toBe(join(paths.agentsDir, "skills", "foo"));

    const fooInAg = await readlink(
      join(paths.antigravityDir, "skills", "foo"),
    );
    expect(fooInAg).toBe(join(paths.agentsDir, "skills", "foo"));

    for (const aside of paths.asideUserSkillDirs) {
      const fooAside = await readlink(join(aside, "foo"));
      expect(fooAside).toBe(join(paths.agentsDir, "skills", "foo"));
    }

    const asideOnly = await readlink(
      join(paths.agentsDir, "skills", "aside-only"),
    );
    expect(asideOnly).toBe(join(paths.asideUserSkillDirs[0]!, "aside-only"));

    const asideAgents = await readFile(
      join(root, "aside", "u", "0", "agents", "main", "AGENTS.md"),
      "utf8",
    );
    expect(asideAgents.trim()).toBe("@~/.agents/AGENTS.md");
  });

  test("skips dangling symlinks instead of throwing EEXIST", async () => {
    const hub = join(paths.agentsDir, "skills");
    await symlink(join(hub, "missing-target"), join(hub, "dangling"));
    expect(await pathExists(join(hub, "dangling"))).toBe(true);
    const action = await linkIfMissing(
      join(hub, "dangling"),
      join(hub, "other"),
      false,
    );
    expect(action.type).toBe("skip");
  });

  test("dry-run does not write files", async () => {
    await touchSkill(join(paths.agentsDir, "skills"), "foo");
    await sync({ paths, dryRun: true });
    expect(await pathExists(join(paths.claudeDir, "CLAUDE.md"))).toBe(false);
  });

  test("errors when root AGENTS.md is missing", async () => {
    await rm(join(paths.agentsDir, "AGENTS.md"));
    await expect(sync({ paths })).rejects.toThrow(/missing/);
  });

  test("status reports hubs including aside profiles", async () => {
    await touchSkill(join(paths.agentsDir, "skills"), "foo");
    await sync({ paths });
    const report = await status({ paths });
    expect(report.rootAgentsMd.exists).toBe(true);
    expect(report.hubs.find((h) => h.name === "agents")?.skillCount).toBe(1);
    expect(report.hubs.some((h) => h.name === "aside-u0-user")).toBe(true);
    expect(report.hubs.some((h) => h.name === "aside-u1-user")).toBe(true);
  });
});
