/**
 * Mutation safety — snapshot, restore, and a pid lock.
 *
 * REBUILT 23 August 2026 at 3.368.1. The original lived only inside a
 * disposable container and went with it. This is a fresh implementation
 * of the same contract, written from the two rules the project recorded
 * about it rather than from the lost source. Where the original's
 * behaviour is unknown to me, this file says so instead of guessing
 * quietly.
 *
 * WHY A SNAPSHOT. A mutation run edits real source files in place and
 * then puts them back. Any exit path that skips the restore leaves the
 * working tree corrupted with a deliberately broken rule still in it —
 * and the next thing to run is a verify sweep, which would then be
 * reporting on sabotaged source. So the restore must survive every way
 * a Node process can end, not just the happy one.
 *
 * WHY A PID LOCK. From the project's own working rhythm: "Never run a
 * mutation file while a sweep is going. The sweep's verify loop includes
 * verify-driven-coverage.mjs, which runs every mutation file; two at
 * once corrupt each other's snapshots." Two processes each holding a
 * snapshot of the same file will restore each other's mutations. The
 * lock makes that a refusal with an explanation rather than a silent
 * mess discovered later.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LOCK_DIR = path.resolve(HERE, "..");
const DEFAULT_LOCK = path.join(LOCK_DIR, ".harness.lock");
/*
 * THE SNAPSHOT THAT SURVIVES A SIGKILL (3.589.0).
 *
 * The header below has always said SIGKILL is the one signal that cannot
 * be caught, "which is why the lock above tolerates a stale entry — a
 * SIGKILLed run leaves both a dirty tree and a dead lock, and the next
 * run needs to be able to SAY SO."
 *
 * ON 25 SEPTEMBER 2026 THAT COST A RELEASE HALF AN HOUR AND NEARLY MORE.
 * `mutate-checks-read-source` was killed by a command timeout while it
 * held the blindfold mutation — `if (false)` in blank-read.mjs's own
 * blanking hook. The tree stayed sabotaged. `verify-checks-read-source`
 * then reported 437 vacuous pairs, which reads exactly like 437 broken
 * checks rather than one broken instrument, and the full sweep repeated
 * it. The lock told the truth and nobody was reading the lock.
 *
 * So the originals now go to disk beside it, and a run that reclaims a
 * stale lock PUTS THEM BACK before doing anything else. Saying so was
 * never enough; the next run is the only thing in a position to fix it.
 */
const DEFAULT_SNAPSHOT = path.join(LOCK_DIR, ".harness.snapshot.json");

/**
 * Whether a process id is still running.
 *
 * `process.kill(pid, 0)` sends no signal and only asks "may I signal
 * this?". EPERM means the process exists but belongs to someone else —
 * which still counts as alive, and treating it as dead is how a lock
 * gets stolen from a run that is very much in progress.
 */
function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}

/**
 * Take the harness lock, or explain who has it.
 *
 * A STALE LOCK IS RECLAIMED, NOT OBEYED. A run killed with SIGKILL
 * cannot clean up after itself, and a lock file naming a dead pid would
 * otherwise block the harness permanently — a failure mode that looks
 * like the tool is broken rather than like the tool is working.
 *
 * @param {string} [lockPath]
 * @returns {{release: () => void}}
 */
export function acquireLock(lockPath = DEFAULT_LOCK) {
  const mine = JSON.stringify({
    pid: process.pid,
    argv: process.argv.slice(1).map((a) => path.basename(a)),
    host: os.hostname(),
    started: new Date().toISOString()
  });

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      fs.writeFileSync(lockPath, mine, { flag: "wx" });
      let released = false;
      return {
        release() {
          if (released) return;
          released = true;
          // Only remove a lock that is still ours. If a stale-lock
          // reclaim handed it to someone else mid-run, deleting theirs
          // would be the exact corruption this file exists to prevent.
          try {
            const held = JSON.parse(fs.readFileSync(lockPath, "utf8"));
            if (held.pid === process.pid) fs.rmSync(lockPath, { force: true });
          } catch {
            /* already gone, or unreadable — nothing safe left to do */
          }
        }
      };
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
      let held = null;
      try {
        held = JSON.parse(fs.readFileSync(lockPath, "utf8"));
      } catch {
        held = null;
      }
      if (held && pidAlive(held.pid)) {
        throw new Error(
          `The harness lock is held by pid ${held.pid} (${(held.argv ?? []).join(" ") || "unknown command"}), ` +
            `started ${held.started ?? "at an unknown time"}.\n` +
            `Two mutation runs at once corrupt each other's snapshots, so this run is refusing to start.\n` +
            `Wait for that run to finish, or remove ${lockPath} if you are certain it is dead.`
        );
      }
      // Unreadable or dead-pid lock: say so, then reclaim. Silence here
      // would hide a crashed run from whoever needs to know it crashed.
      process.stderr.write(
        `harness: reclaiming a stale lock at ${lockPath}` +
          (held ? ` (pid ${held.pid} is gone)` : " (unreadable)") +
          "\n"
      );
      // AND PUT BACK WHATEVER IT WAS HOLDING. See DEFAULT_SNAPSHOT.
      restoreFromSnapshot();
      fs.rmSync(lockPath, { force: true });
    }
  }
  throw new Error(`Could not take the harness lock at ${lockPath} after reclaiming it.`);
}

/**
 * Put back whatever a killed run left mutated.
 *
 * SILENT WHEN THERE IS NOTHING TO DO, and loud when there is: a tree
 * that needed repairing is news, and the file that needed it is the
 * single most useful thing to print.
 *
 * NEVER THROWS. This runs on the recovery path of a run that is trying
 * to start; failing here would turn a repairable tree into a harness
 * that cannot run at all.
 *
 * @param {string} [snapshotPath]
 * @returns {string[]} the files it restored
 */
export function restoreFromSnapshot(snapshotPath = DEFAULT_SNAPSHOT) {
  let manifest = null;
  try {
    /*
     * NO `existsSync` GUARD, DELIBERATELY. One was written here and a
     * mutation removing it survived — because an absent file makes
     * `readFileSync` throw ENOENT, which the catch below already handles
     * identically. That made it the TENTH dead guard this project has
     * deleted, and the ninth was found the same way one release ago:
     * "a guard whose only witness is a grep for its own error message
     * cannot be caught being neutered."
     */
    manifest = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
  } catch {
    // An unreadable snapshot is worse than none: remove it so it cannot
    // be mistaken for a good one next time.
    try { fs.rmSync(snapshotPath, { force: true }); } catch { /* nothing left to try */ }
    return [];
  }
  const put = [];
  for (const [file, base64] of Object.entries(manifest?.files ?? {})) {
    try {
      const want = Buffer.from(base64, "base64");
      // ONLY WHAT ACTUALLY DIFFERS. A run that finished cleanly and
      // failed to delete its snapshot must not have its work reverted.
      if (fs.existsSync(file) && fs.readFileSync(file).equals(want)) continue;
      fs.writeFileSync(file, want);
      put.push(file);
    } catch (err) {
      process.stderr.write(`harness: FAILED to restore ${file} from the snapshot: ${err.message}\n`);
    }
  }
  if (put.length) {
    process.stderr.write(
      `harness: a killed run had left ${put.length} file(s) mutated; restored from the snapshot:\n`
      + put.map((f) => `  ${path.basename(f)}\n`).join("")
    );
  }
  try { fs.rmSync(snapshotPath, { force: true }); } catch { /* nothing left to try */ }
  return put;
}

/**
 * Snapshot a set of files and guarantee they are put back.
 *
 * The returned handle restores on demand; the process-level handlers
 * restore on every exit path that Node will let us observe. SIGKILL is
 * the one that cannot be caught, which is why the lock above tolerates
 * a stale entry — a SIGKILLed run leaves both a dirty tree and a dead
 * lock, and the next run needs to be able to say so.
 *
 * @param {string[]} filePaths Absolute paths. Every one must exist —
 *   a typo'd path that silently guards nothing is the quietest possible
 *   failure, and this throws instead.
 * @param {object} [options]
 * @param {string} [options.lockPath] Pass null to skip locking (only
 *   for a caller that already holds it).
 * @returns {{restore: () => void, release: () => void, files: string[]}}
 */
export function guardFiles(filePaths, { lockPath = DEFAULT_LOCK } = {}) {
  const files = [...new Set(filePaths.map((p) => path.resolve(p)))];

  const missing = files.filter((p) => !fs.existsSync(p));
  if (missing.length) {
    throw new Error(
      `guardFiles was asked to protect ${missing.length} file(s) that do not exist:\n` +
        missing.map((p) => `  ${p}`).join("\n") +
        `\nA guard over a nonexistent path protects nothing while reporting success.`
    );
  }

  const lock = lockPath ? acquireLock(lockPath) : { release() {} };
  const snapshot = new Map(files.map((p) => [p, fs.readFileSync(p)]));

  /*
   * THE SAME SNAPSHOT, ON DISK, BEFORE A SINGLE BYTE IS MUTATED.
   *
   * In memory it is lost with the process; SIGKILL is precisely the case
   * the in-memory copy cannot serve. Written once here rather than per
   * mutation, because the originals do not change during a run and a
   * write per mutation would be hundreds of megabytes over a sweep.
   */
  if (lockPath) {
    try {
      fs.writeFileSync(DEFAULT_SNAPSHOT, JSON.stringify({
        pid: process.pid,
        argv: process.argv.slice(1).map((a) => path.basename(a)),
        started: new Date().toISOString(),
        files: Object.fromEntries([...snapshot].map(([p, buf]) => [p, buf.toString("base64")]))
      }));
    } catch (err) {
      // A run that cannot write its snapshot still runs — the in-memory
      // restore covers every exit path but one. Said out loud so the
      // missing safety net is not a surprise later.
      process.stderr.write(`harness: could not write the crash snapshot: ${err.message}\n`);
    }
  }

  let restored = false;
  let finished = false;

  function restore() {
    if (restored) return;
    restored = true;
    for (const [p, buf] of snapshot) {
      try {
        if (!fs.readFileSync(p).equals(buf)) fs.writeFileSync(p, buf);
      } catch {
        // The file may have been deleted by the thing under test.
        try {
          fs.writeFileSync(p, buf);
        } catch (err) {
          process.stderr.write(`harness: FAILED to restore ${p}: ${err.message}\n`);
        }
      }
    }
  }

  function finish() {
    if (finished) return;
    finished = true;
    restore();
    // THE SNAPSHOT GOES WITH THE LOCK. Leaving it would mean the next
    // run reclaiming a stale lock could revert work that finished
    // properly — which `restoreFromSnapshot` guards against by comparing
    // contents, but a file that should not exist is still a trap.
    if (lockPath) {
      try { fs.rmSync(DEFAULT_SNAPSHOT, { force: true }); } catch { /* nothing left to try */ }
    }
    lock.release();
  }

  // `exit` handlers must be synchronous, which is why every write above
  // is sync. The signal handlers re-raise after cleaning up so the exit
  // status still tells the truth about how the run ended.
  const onExit = () => finish();
  const onSignal = (sig) => {
    finish();
    process.removeListener(sig, onSignal);
    process.kill(process.pid, sig);
  };
  const onFatal = (err) => {
    finish();
    process.stderr.write(`harness: aborting after an uncaught error\n${err?.stack ?? err}\n`);
    process.exit(1);
  };

  process.on("exit", onExit);
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  process.on("SIGHUP", onSignal);
  process.on("uncaughtException", onFatal);
  process.on("unhandledRejection", onFatal);

  return {
    files,
    restore,
    release() {
      finish();
      process.removeListener("exit", onExit);
      process.removeListener("SIGINT", onSignal);
      process.removeListener("SIGTERM", onSignal);
      process.removeListener("SIGHUP", onSignal);
      process.removeListener("uncaughtException", onFatal);
      process.removeListener("unhandledRejection", onFatal);
    }
  };
}
