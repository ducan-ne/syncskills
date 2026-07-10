import {
  cp,
  mkdir,
  readdir,
  readlink,
  lstat,
  symlink,
  writeFile,
  readFile,
  rm,
} from "node:fs/promises";
import { join } from "node:path";

export type Action =
  | { type: "mkdir"; path: string }
  | { type: "write"; path: string; content: string; changed: boolean }
  | { type: "link"; path: string; target: string; created: boolean }
  | { type: "copy"; path: string; from: string }
  | { type: "remove"; path: string }
  | { type: "skip"; path: string; reason: string };

export async function ensureDir(path: string, dryRun: boolean): Promise<Action> {
  if (!dryRun) {
    await mkdir(path, { recursive: true });
  }
  return { type: "mkdir", path };
}

/** True if a path exists at the final name, including dangling symlinks. */
export async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
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
 * Create a symlink at `linkPath` pointing to `target` if nothing exists there
 * (including dangling symlinks). Does not replace existing entries.
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
    try {
      await symlink(target, linkPath);
    } catch (err) {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code?: unknown }).code)
          : "";
      if (code === "EEXIST") {
        return { type: "skip", path: linkPath, reason: "already exists" };
      }
      throw err;
    }
  }
  return { type: "link", path: linkPath, target, created: true };
}

/**
 * One-way: for each skill in srcDir, symlink into dstDir when missing.
 * Existing destination entries (custom skills, etc.) are left untouched.
 * Skips names starting with "." (e.g. .system).
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

/**
 * Copy skill entries from srcDir into dstDir when missing.
 * Used only to bootstrap ~/.agents from ~/.claude.
 * Existing destination entries are left untouched.
 */
export async function copyMissingSkills(
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
    const src = join(srcDir, name);
    const dst = join(dstDir, name);
    let st;
    try {
      st = await lstat(src);
    } catch {
      continue;
    }
    if (!st.isDirectory() && !st.isSymbolicLink()) continue;
    if (await pathExists(dst)) {
      actions.push({ type: "skip", path: dst, reason: "already exists" });
      continue;
    }
    if (!dryRun) {
      // Follow symlinks so agents owns real skill content when bootstrapping
      await cp(src, dst, { recursive: true, dereference: true });
    }
    actions.push({ type: "copy", path: dst, from: src });
  }
  return actions;
}

export async function removePath(
  path: string,
  dryRun: boolean,
): Promise<Action | null> {
  if (!(await pathExists(path))) return null;
  if (!dryRun) {
    await rm(path, { recursive: true, force: true });
  }
  return { type: "remove", path };
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
