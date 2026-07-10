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
import { pathExists, linkIfMissing, listSkillNames } from "./fs";

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
  test("pushes agents skills one-way and leaves target customs untouched", async () => {
    await touchSkill(join(paths.agentsDir, "skills"), "foo");
    await mkdir(join(paths.codexDir, "skills"), { recursive: true });
    await touchSkill(join(paths.codexDir, "skills"), "codex-only");
    await mkdir(paths.asideUserSkillDirs[0]!, { recursive: true });
    await touchSkill(paths.asideUserSkillDirs[0]!, "aside-only");

    await sync({ paths });

    // agents skill linked into destinations
    expect(await readlink(join(paths.codexDir, "skills", "foo"))).toBe(
      join(paths.agentsDir, "skills", "foo"),
    );
    expect(
      await readlink(join(paths.asideUserSkillDirs[0]!, "foo")),
    ).toBe(join(paths.agentsDir, "skills", "foo"));

    // destination-only customs stay put
    expect(
      await pathExists(join(paths.codexDir, "skills", "codex-only")),
    ).toBe(true);
    expect(
      await pathExists(join(paths.asideUserSkillDirs[0]!, "aside-only")),
    ).toBe(true);

    // one-way: not pulled into agents
    expect(
      await pathExists(join(paths.agentsDir, "skills", "codex-only")),
    ).toBe(false);
    expect(
      await pathExists(join(paths.agentsDir, "skills", "aside-only")),
    ).toBe(false);

    const claudeMd = await readFile(join(paths.claudeDir, "CLAUDE.md"), "utf8");
    expect(claudeMd).toContain("@~/.agents/AGENTS.md");
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
    const agentsMd = await readFile(join(paths.agentsDir, "AGENTS.md"), "utf8");
    expect(agentsMd).toContain("from claude");
    expect(
      await pathExists(join(paths.agentsDir, "skills", "seeded", "SKILL.md")),
    ).toBe(true);
    // agents skill then linked into codex
    expect(await readlink(join(paths.codexDir, "skills", "seeded"))).toBe(
      join(paths.agentsDir, "skills", "seeded"),
    );
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
