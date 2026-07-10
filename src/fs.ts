import {
  mkdir,
  readdir,
  readlink,
  lstat,
  symlink,
  writeFile,
  readFile,
  access,
} from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";

export type Action =
  | { type: "mkdir"; path: string }
  | { type: "write"; path: string; content: string; changed: boolean }
  | { type: "link"; path: string; target: string; created: boolean }
  | { type: "skip"; path: string; reason: string };

export async function ensureDir(path: string, dryRun: boolean): Promise<Action> {
  if (!dryRun) {
    await mkdir(path, { recursive: true });
  }
  return { type: "mkdir", path };
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function readTextFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

export async function writeTextFile(
  path: string,
  content: string,
  dryRun: boolean,
): Promise<Action> {
  const existing = await readTextFile(path);
  const changed = existing !== content;
  if (!dryRun && changed) {
    await writeFile(path, content, "utf8");
  }
  return { type: "write", path, content, changed };
}

/**
 * Create a symlink at `linkPath` pointing to `target` if nothing exists there.
 * Does not replace existing files/dirs/symlinks.
 */
export async function linkIfMissing(
  linkPath: string,
  target: string,
  dryRun: boolean,
): Promise<Action> {
  if (await pathExists(linkPath)) {
    return { type: "skip", path: linkPath, reason: "already exists" };
  }
  if (!dryRun) {
    await symlink(target, linkPath);
  }
  return { type: "link", path: linkPath, target, created: true };
}

/**
 * For each skill directory in srcDir, symlink into dstDir when missing.
 * Skips names starting with "." (e.g. .system).
 * Allows skill entries that are directories or symlinks (common shared pattern).
 */
export async function linkMissingSkills(
  srcDir: string,
  dstDir: string,
  dryRun: boolean,
): Promise<Action[]> {
  const actions: Action[] = [];
  let entries: string[];
  try {
    entries = await readdir(srcDir);
  } catch {
    return actions;
  }

  for (const name of entries) {
    if (name.startsWith(".")) continue;
    const skill = join(srcDir, name);
    let st;
    try {
      st = await lstat(skill);
    } catch {
      continue;
    }
    if (!st.isDirectory() && !st.isSymbolicLink()) continue;

    const target = join(dstDir, name);
    actions.push(await linkIfMissing(target, skill, dryRun));
  }
  return actions;
}

export async function listSkillNames(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir);
    const names: string[] = [];
    for (const name of entries) {
      if (name.startsWith(".")) continue;
      const full = join(dir, name);
      try {
        const st = await lstat(full);
        if (st.isDirectory() || st.isSymbolicLink()) names.push(name);
      } catch {
        // ignore
      }
    }
    return names.sort();
  } catch {
    return [];
  }
}

export async function describeLink(path: string): Promise<string> {
  try {
    const st = await lstat(path);
    if (st.isSymbolicLink()) {
      const t = await readlink(path);
      return `symlink -> ${t}`;
    }
    if (st.isDirectory()) return "directory";
    return "file";
  } catch {
    return "missing";
  }
}
