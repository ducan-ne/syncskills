import {
  cp,
  mkdir,
  readdir,
  readlink,
  lstat,
  realpath,
  symlink,
  writeFile,
  readFile,
  rm,
} from "node:fs/promises";
import { join, resolve, dirname, isAbsolute } from "node:path";

export type Action =
  | { type: "mkdir"; path: string }
  | { type: "write"; path: string; content: string; changed: boolean }
  | { type: "link"; path: string; target: string; created: boolean }
  | { type: "copy"; path: string; from: string }
  | { type: "materialize"; path: string; from: string }
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
 * Resolve a skill path to a real directory, following symlinks.
 * Returns null on missing targets or cycles.
 */
export async function resolveRealSkillDir(
  path: string,
): Promise<string | null> {
  const seen = new Set<string>();
  let current = path;

  for (let i = 0; i < 32; i++) {
    let st;
    try {
      st = await lstat(current);
    } catch {
      return null;
    }

    if (st.isSymbolicLink()) {
      if (seen.has(current)) return null;
      seen.add(current);
      let target: string;
      try {
        target = await readlink(current);
      } catch {
        return null;
      }
      current = isAbsolute(target)
        ? target
        : resolve(dirname(current), target);
      continue;
    }

    if (st.isDirectory()) {
      try {
        return await realpath(current);
      } catch {
        return current;
      }
    }

    return null;
  }

  return null;
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

/**
 * Ensure agents skill entry is a real directory (source of truth).
 * - real dir: keep
 * - symlink to real dir: replace with a copy of the target
 * - broken/cycle: remove
 */
export async function materializeSkillEntry(
  skillPath: string,
  dryRun: boolean,
): Promise<Action[]> {
  const actions: Action[] = [];
  let st;
  try {
    st = await lstat(skillPath);
  } catch {
    return actions;
  }

  if (st.isDirectory() && !st.isSymbolicLink()) {
    return actions;
  }

  if (!st.isSymbolicLink()) {
    return actions;
  }

  const real = await resolveRealSkillDir(skillPath);
  if (!real) {
    const removed = await removePath(skillPath, dryRun);
    if (removed) actions.push(removed);
    return actions;
  }

  // Already the same real path via ... no, skillPath is symlink; replace with copy
  if (!dryRun) {
    const tmp = `${skillPath}.__agentskillsync_tmp__`;
    await rm(tmp, { recursive: true, force: true });
    await cp(real, tmp, { recursive: true, dereference: true });
    await rm(skillPath, { recursive: true, force: true });
    // rename tmp -> skillPath
    const { rename } = await import("node:fs/promises");
    await rename(tmp, skillPath);
  }
  actions.push({ type: "materialize", path: skillPath, from: real });
  return actions;
}

export async function materializeSkillsHub(
  hubDir: string,
  dryRun: boolean,
): Promise<Action[]> {
  const actions: Action[] = [];
  let entries: string[];
  try {
    entries = await readdir(hubDir);
  } catch {
    return actions;
  }
  for (const name of entries) {
    if (name.startsWith(".")) continue;
    actions.push(
      ...(await materializeSkillEntry(join(hubDir, name), dryRun)),
    );
  }
  return actions;
}

/**
 * Create a symlink at linkPath -> target if missing.
 * If linkPath exists as a broken symlink or wrong target, leave it (unless replaceBroken).
 */
export async function linkIfMissing(
  linkPath: string,
  target: string,
  dryRun: boolean,
  opts: { replaceBroken?: boolean; replaceSymlink?: boolean } = {},
): Promise<Action[]> {
  const actions: Action[] = [];
  if (await pathExists(linkPath)) {
    let st;
    try {
      st = await lstat(linkPath);
    } catch {
      return [{ type: "skip", path: linkPath, reason: "already exists" }];
    }

    if (st.isSymbolicLink()) {
      const real = await resolveRealSkillDir(linkPath);
      if (!real && opts.replaceBroken) {
        const removed = await removePath(linkPath, dryRun);
        if (removed) actions.push(removed);
      } else if (real && opts.replaceSymlink) {
        // will replace below only if we want to retarget - for now skip healthy
        return [
          ...actions,
          { type: "skip", path: linkPath, reason: "already exists" },
        ];
      } else {
        return [
          ...actions,
          { type: "skip", path: linkPath, reason: "already exists" },
        ];
      }
    } else {
      return [
        ...actions,
        { type: "skip", path: linkPath, reason: "already exists" },
      ];
    }
  }

  // may have been removed above
  if (await pathExists(linkPath)) {
    return [
      ...actions,
      { type: "skip", path: linkPath, reason: "already exists" },
    ];
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
        actions.push({
          type: "skip",
          path: linkPath,
          reason: "already exists",
        });
        return actions;
      }
      throw err;
    }
  }
  actions.push({ type: "link", path: linkPath, target, created: true });
  return actions;
}

/**
 * One-way: for each skill in srcDir, symlink into dstDir when missing.
 * Links point at the resolved real skill directory when possible.
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
    const real = await resolveRealSkillDir(skill);
    if (!real) {
      actions.push({
        type: "skip",
        path: skill,
        reason: "broken or non-dir skill in source",
      });
      continue;
    }
    // Prefer linking to the source hub path when it is already a real dir;
    // otherwise link to the resolved real path so destinations don't inherit chains.
    let st;
    try {
      st = await lstat(skill);
    } catch {
      continue;
    }
    const target = st.isSymbolicLink() ? real : skill;
    actions.push(
      ...(await linkIfMissing(join(dstDir, name), target, dryRun, {
        replaceBroken: true,
      })),
    );
  }
  return actions;
}

/**
 * One-way copy skills into a destination hub (for harnesses that don't follow symlinks).
 * - missing name: copy
 * - existing symlink (managed/broken): replace with copy of source
 * - existing real dir: leave untouched (custom skill)
 */
export async function copyMissingSkills(
  srcDir: string,
  dstDir: string,
  dryRun: boolean,
  opts: { replaceSymlinks?: boolean } = {},
): Promise<Action[]> {
  const actions: Action[] = [];
  const replaceSymlinks = opts.replaceSymlinks ?? true;
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
    const real = await resolveRealSkillDir(src);
    if (!real) {
      actions.push({
        type: "skip",
        path: src,
        reason: "broken or non-dir skill in source",
      });
      continue;
    }

    if (await pathExists(dst)) {
      let st;
      try {
        st = await lstat(dst);
      } catch {
        continue;
      }
      if (st.isSymbolicLink() && replaceSymlinks) {
        const removed = await removePath(dst, dryRun);
        if (removed) actions.push(removed);
      } else {
        actions.push({ type: "skip", path: dst, reason: "already exists" });
        continue;
      }
    }

    if (!dryRun) {
      await cp(real, dst, { recursive: true, dereference: true });
    }
    actions.push({ type: "copy", path: dst, from: real });
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
      const real = await resolveRealSkillDir(path);
      return real
        ? `symlink -> ${t} (ok)`
        : `symlink -> ${t} (BROKEN)`;
    }
    if (st.isDirectory()) return "directory";
    return "file";
  } catch {
    return "missing";
  }
}
