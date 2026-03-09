#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const timestamp = new Date().toISOString();

function runGit(args, options = {}) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
}

function captureGit(args) {
  return runGit(args, { capture: true }).trim();
}

function gitSucceeds(args) {
  try {
    execFileSync("git", args, {
      cwd: repoRoot,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

const remote = process.env.GIT_SYNC_REMOTE || "origin";
const branch = process.env.GIT_SYNC_BRANCH || captureGit(["branch", "--show-current"]);
const message = process.argv.slice(2).join(" ").trim() || `chore: sync ai-kp ${timestamp}`;

if (!branch) {
  console.error("Unable to determine current branch.");
  process.exit(1);
}

const trackedDirty = !gitSucceeds(["diff", "--quiet"]) || !gitSucceeds(["diff", "--cached", "--quiet"]);

const untracked = captureGit(["ls-files", "--others", "--exclude-standard"]);
const hasChanges = trackedDirty || Boolean(untracked);

if (hasChanges) {
  runGit(["add", "-A"]);
  runGit(["commit", "-m", message]);
} else {
  console.log("No local changes to commit.");
}

runGit(["pull", "--rebase", remote, branch]);
runGit(["push", remote, `HEAD:${branch}`]);

console.log(`Synced ${repoRoot} to ${remote}/${branch}`);
