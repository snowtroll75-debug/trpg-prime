#!/usr/bin/env node
/**
 * verify-checks-can-fail — does each check actually fail when it should?
 *
 * NEW at 3.368.1, written alongside the rebuilt checks.
 *
 * WHY THIS EXISTS. §5.3 of the 23 August handover is a list of four
 * checks that passed on every input they were ever given, and were
 * therefore worthless:
 *
 *   - a regex that pinned a call site as written, object and all,
 *     confirming a bug rather than catching it;
 *   - a regex that matched `context.itemSizeEffect =` and passed when
 *     the value became `true` — and, rewritten to match the output
 *     strings, STILL passed, because mutating the condition leaves both
 *     literals in the source;
 *   - a check that asserted the absence of a doc comment through a
 *     helper that strips comments, so it could never see its target;
 *   - checks that only ever used a Medium wielder, where two different
 *     fallback rules give identical answers.
 *
 * Every one of those was green. Green is not evidence. The only thing
 * that distinguishes a working check from a decorative one is watching
 * it go red on an input it is supposed to reject, so that is what this
 * file does: it breaks the source on purpose, asserts the check
 * notices, and puts the source back.
 *
 * It is also the live exercise of tools/lib/mutation-safety.mjs. Every
 * case below runs inside guardFiles, so a crash mid-case restores the
 * tree rather than leaving a sabotaged rule behind for the next sweep
 * to report on.
 *
 * ONE CASE IS NOT ABOUT FAILING — case 4. It asserts that the caller
 * check does NOT count `something.zzzProbe` as a caller of an export
 * named `zzzProbe`. A plain text search over the source would pass that
 * case wrongly, which is exactly the shape §5.3 warns about, so it is
 * checked from the direction that can catch it.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const VICTIM = path.join(SYSTEM_ROOT, "module", "items.mjs");
const SECOND = path.join(SYSTEM_ROOT, "module", "held-items.mjs");

/** Run a check as a child process; return {code, out}. */
function runCheck(script) {
  try {
    const out = execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", script)], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      // The child must not take the harness lock — this process holds it.
      env: { ...process.env }
    });
    return { code: 0, out };
  } catch (err) {
    return { code: err.status ?? 1, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

const cases = [
  {
    name: "no-undef catches a called-but-never-imported name (lesson 5.2)",
    check: "verify-no-undefined-names.mjs",
    breaks: () =>
      fs.appendFileSync(
        VICTIM,
        "\nexport function probeUsesUndefinedName(x) {\n  return zzzNeverImportedProbe(x);\n}\n"
      ),
    expect: (r) => r.code !== 0 && /zzzNeverImportedProbe/.test(r.out)
  },
  {
    name: "no-undef FAILS on an unparseable file rather than skipping it (lesson 5.4)",
    check: "verify-no-undefined-names.mjs",
    breaks: () => fs.appendFileSync(VICTIM, "\nexport function broken( {\n"),
    expect: (r) => r.code !== 0 && /could not be parsed/.test(r.out) && /items\.mjs/.test(r.out)
  },
  {
    name: "caller check catches a NEW export that nothing calls (lesson 5.1)",
    check: "verify-rules-have-callers.mjs",
    breaks: () =>
      fs.appendFileSync(VICTIM, "\nexport function zzzUncalledProbeRule(n) {\n  return n + 1;\n}\n"),
    expect: (r) => r.code !== 0 && /NEW uncalled/.test(r.out) && /zzzUncalledProbeRule/.test(r.out)
  },
  {
    name: "caller check does NOT accept a property key as a caller (§5.3 shape)",
    check: "verify-rules-have-callers.mjs",
    breaks: () => {
      fs.appendFileSync(VICTIM, "\nexport function zzzProbeRule(n) {\n  return n + 1;\n}\n");
      // A same-named PROPERTY elsewhere. A text search would call this a
      // caller. It is not one, and the check must still report the orphan.
      fs.appendFileSync(
        SECOND,
        "\nconst zzzProbeCarrier = { zzzProbeRule: 1 };\nexport function zzzProbeReader(o) {\n  return o.zzzProbeRule ?? zzzProbeCarrier.zzzProbeRule;\n}\n"
      );
    },
    expect: (r) => r.code !== 0 && /items\.mjs#zzzProbeRule/.test(r.out)
  }
];

function main() {
  const guard = guardFiles([VICTIM, SECOND]);
  const results = [];
  try {
    // Confirm the tree is green BEFORE breaking anything. Without this,
    // a check that was already failing would make every case below look
    // like a pass for the wrong reason.
    for (const script of ["verify-no-undefined-names.mjs", "verify-rules-have-callers.mjs"]) {
      const r = runCheck(script);
      if (r.code !== 0) {
        process.stderr.write(
          `verify-checks-can-fail: ${script} is already failing on an unmodified tree, ` +
            `so nothing below would prove anything. Fix that first.\n${r.out}\n`
        );
        return 2;
      }
    }

    for (const c of cases) {
      c.breaks();
      const r = runCheck(c.check);
      const passed = c.expect(r);
      results.push({ name: c.name, passed, code: r.code });
      if (!passed) {
        process.stderr.write(`\n--- ${c.name}\nexit ${r.code}\n${r.out}\n`);
      }
      guard.restore();
      // restore() is one-shot by design (it must be safe to call from
      // several exit handlers), so re-arm for the next case.
      guard.release();
      Object.assign(guard, guardFiles([VICTIM, SECOND], { lockPath: null }));
    }
  } finally {
    guard.restore();
    guard.release();
  }

  const failed = results.filter((r) => !r.passed);
  for (const r of results) {
    process.stdout.write(`  ${r.passed ? "caught" : "MISSED"}  ${r.name}\n`);
  }
  process.stdout.write(
    failed.length
      ? `verify-checks-can-fail: FAILED — ${failed.length} of ${results.length} check(s) did not notice a defect they exist to catch.\n`
      : `verify-checks-can-fail: OK — all ${results.length} checks went red on the defect they exist to catch, and the tree was restored.\n`
  );
  return failed.length ? 1 : 0;
}

process.exit(main());
