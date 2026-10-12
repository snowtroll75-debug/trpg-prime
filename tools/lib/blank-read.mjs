/**
 * Make ONE file read as empty, without changing it on disk.
 *
 * NEW at 3.427.0. Loaded with `node --import` ahead of a check, so that
 * `fs.readFileSync` answers "" for the path named in TRG_BLANK_READ and
 * normally for everything else.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY INTERCEPT THE READ RATHER THAN BLANK THE FILE.
 *
 * `verify-checks-read-source` asks one question of every check that
 * scans source text: does it actually depend on that text? The obvious
 * way to ask is to empty the file and see whether the check notices.
 *
 * That would be the wrong instrument. Most checks IMPORT functions from
 * the same modules they scan, so an emptied file breaks the import and
 * the check fails for a reason that has nothing to do with its
 * assertions — a pass for the wrong reason, which is the exact species
 * of error this whole exercise exists to catch.
 *
 * Intercepting the read separates the two. The module still resolves,
 * its functions still work, and only the TEXT the check regexes over
 * goes blank. What fails is then precisely the source-scanning claims,
 * which is what is being measured.
 *
 * AND NOTHING IS WRITTEN. Every mutation file in this project sabotages
 * the tree and restores it, guarded against a crash mid-run. This one
 * cannot leave damage behind because it never edits anything — the
 * safest shape available, and worth preferring wherever it fits.
 */

import fs from "node:fs";
import path from "node:path";

const target = process.env.TRG_BLANK_READ ? path.resolve(process.env.TRG_BLANK_READ) : null;

if (target) {
  const realSync = fs.readFileSync.bind(fs);

  // BOTH SHAPES OF THE SAME CALL. A checker may ask for a string or for
  // a Buffer, and answering the wrong type would crash the check rather
  // than blanking it — a failure that would read as "noticed".
  const blankFor = (options) => {
    const encoding = typeof options === "string" ? options : options?.encoding;
    return encoding ? "" : Buffer.alloc(0);
  };

  fs.readFileSync = function readFileSync(file, options) {
    try {
      // A file descriptor or URL is not a path this is asked about.
      if (typeof file === "string" && path.resolve(file) === target) {
        return blankFor(options);
      }
    } catch {
      // Fall through to the real read rather than failing the check for
      // a reason of our own making.
    }
    return realSync(file, options);
  };
}
