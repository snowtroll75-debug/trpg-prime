#!/usr/bin/env node
/**
 * verify-rules-have-callers — is every exported rule named anywhere but
 * its own file?
 *
 * REBUILT 23 August 2026 at 3.368.1. The original's recorded ratchet was
 * 532 uncalled exports, down from 566 on its first run. That number is
 * NOT inherited here — see "The baseline is fresh" below.
 *
 * WHY THIS CHECK EXISTS. Lesson 5.1: "A rule with no caller is not
 * automation. It is a well-tested opinion." `craftingFeatGate` had
 * eleven verify checks and six mutations, all passing, and no caller.
 * Neither the feat register (it had evidence) nor the mutation harness
 * (every change was caught — by the harness, its only caller) could see
 * it. Triaging the first run's exported functions found roughly sixteen
 * printed rules that were simply not happening at anybody's table.
 *
 * WHAT IT DOES NOT CATCH, said plainly. This is a NAME check, not an
 * import check. Lesson 5.2 is the counterexample: `shieldedStrideBonus`
 * was called in the attack workflow and never imported, so every weapon
 * attack against a target threw — and this check was no help, because
 * the name *appeared*. That gap is verify-no-undefined-names.mjs's job,
 * and the two are deliberately separate rather than merged, because they
 * fail on different things and a merged check would report one number
 * for two questions.
 *
 * AND IT CAN BE FOOLED THE OTHER WAY TOO — found 23 August 2026, at
 * 3.376.0. Because it matches identifiers appearing outside their own
 * file, an unrelated LOCAL variable elsewhere with the same name counts
 * as a caller. A new `const centreOf = …` inside
 * `forced-movement-workflow.mjs` made `charge-workflow.mjs#centreOf` —
 * a genuinely dead export — report that it had found a caller, which
 * the ratchet then wanted to bank as progress.
 *
 * It is lesson 5.2 running in reverse: there, a name appearing was
 * mistaken for an import; here, a name appearing is mistaken for a call.
 * The consequence is the worse of the two, because it is SILENT and in
 * the reassuring direction — a dead export can be resurrected on paper
 * by any common helper name written anywhere in the tree, and the
 * backlog shrinks without a thing being wired.
 *
 * Not fixed here, and said rather than left implied: resolving it needs
 * real import/scope analysis (eslint-scope is already a dependency of
 * verify-no-undefined-names.mjs, so the parts are to hand), and swapping
 * the measuring instrument midway through a Shove batch is how a
 * measurement stops meaning anything. Generic helper names — `centreOf`,
 * `format`, `toId` — are where this bites, so treat any orphan that
 * spontaneously acquires a caller as suspect until somebody has looked.
 *
 * THREE OUTCOMES, NOT TWO. An export named only inside tools/ is not the
 * same as an export named nowhere, and neither is the same as one the
 * project has decided on purpose to keep uncalled. The deliberate keeps
 * — `familiarBaseAbilities` caught a real Dex bug at 3.234.1,
 * `penetrateBarrierBehaviour` acts on content nobody has written yet —
 * are DECLARED in the ratchet file with a REQUIRED reason each, not
 * inferred from where they happen to be referenced. Declared and
 * checked, never inferred, is this project's rule and it applies to its
 * own tools. A keep with an empty reason fails the check.
 *
 * THE BASELINE IS FRESH, AND IT IS NOT COMPARABLE TO 532.
 * The original ratchet went with the container it lived in. Adopting its
 * number would be recording a figure nobody here measured. This run
 * measures 684 uncalled of 2153 — but the gap from 532 is mostly NOT
 * rot. The original harness was 99 verify files and 91 mutation files
 * that imported and drove most of these rules, and a rule driven by a
 * mutation file counted as called. That corpus is gone, so several
 * hundred exports which had a harness caller now read as having none.
 * At 3.363.0 the original reported 61 uncalled *functions*; this reports
 * 400. The difference is the missing harness, not four hundred rules
 * that rotted overnight. Recorded here so that nobody later reads the
 * jump as a regression — and so that whoever rebuilds the mutation
 * corpus knows this number should fall sharply when they do.
 */

import fs from "node:fs";
import path from "node:path";
import * as walk from "acorn-walk";
import { findSourceFiles, parseAll, reportParseFailures, rel, SYSTEM_ROOT } from "./lib/sources.mjs";

const RATCHET_FILE = path.join(SYSTEM_ROOT, "tools", "uncalled-exports.json");

/** Files under tools/ are the harness; everything else is shipped. */
function isHarness(relPath) {
  return relPath.startsWith("tools/");
}

/**
 * The names a file exports.
 *
 * `export { local as public }` records `public` — the name a caller
 * would have to write. `export default` is skipped: it has no name to
 * search for, so this check can say nothing about it either way, and
 * pretending otherwise would be a silent gap.
 */
function exportedNames(ast) {
  const names = [];
  for (const node of ast.body) {
    if (node.type === "ExportNamedDeclaration") {
      if (node.declaration) {
        const d = node.declaration;
        if (d.type === "FunctionDeclaration" || d.type === "ClassDeclaration") {
          if (d.id) names.push({ name: d.id.name, kind: d.type === "ClassDeclaration" ? "class" : "function" });
        } else if (d.type === "VariableDeclaration") {
          for (const decl of d.declarations) {
            if (decl.id.type === "Identifier") {
              const isFn =
                decl.init &&
                (decl.init.type === "ArrowFunctionExpression" || decl.init.type === "FunctionExpression");
              names.push({ name: decl.id.name, kind: isFn ? "function" : "const" });
            }
          }
        }
      }
      for (const spec of node.specifiers ?? []) {
        const exported = spec.exported;
        const name = exported.type === "Identifier" ? exported.name : exported.value;
        if (name && name !== "default") names.push({ name, kind: "reexport" });
      }
    }
  }
  // Same name exported twice in one file is not interesting; dedupe.
  const seen = new Set();
  return names.filter((n) => (seen.has(n.name) ? false : seen.add(n.name)));
}

/**
 * Every identifier a file *uses* as a name — deliberately excluding
 * positions where the text is a property key rather than a reference.
 *
 * WITHOUT THIS EXCLUSION the check is worthless in the direction that
 * matters: `something.craftingFeatGate` or `{ craftingFeatGate: 1 }`
 * would count as a caller, so an orphan with a same-named property
 * anywhere in the codebase would look wired. Property keys are matched
 * as text elsewhere in this project's history and it went badly (§5.3).
 */
function usedNames(ast) {
  const used = new Set();
  walk.recursive(ast, null, {
    Identifier(node) {
      used.add(node.name);
    },
    MemberExpression(node, st, c) {
      c(node.object, st);
      // `a.b` — `b` is a property, not a reference to anything named b.
      // `a[b]` — `b` IS a reference, so a computed key is still walked.
      if (node.computed) c(node.property, st);
    },
    Property(node, st, c) {
      if (node.computed) c(node.key, st);
      c(node.value, st);
    },
    PropertyDefinition(node, st, c) {
      if (node.computed) c(node.key, st);
      if (node.value) c(node.value, st);
    },
    MethodDefinition(node, st, c) {
      if (node.computed) c(node.key, st);
      c(node.value, st);
    },
    // An import binding is a use of the exported name by any reasonable
    // reading — it is how a caller names it. Default walk already visits
    // these as Identifiers; listed here so the intent is on the record.
    ImportSpecifier(node) {
      used.add(node.imported.type === "Identifier" ? node.imported.name : node.imported.value);
      used.add(node.local.name);
    },
    ExportSpecifier(node) {
      used.add(node.local.name);
    }
  });
  return used;
}

function loadRatchet() {
  if (!fs.existsSync(RATCHET_FILE)) return null;
  return JSON.parse(fs.readFileSync(RATCHET_FILE, "utf8"));
}

export function analyse(declaredKeeps = new Set()) {
  const files = findSourceFiles(["module", "scripts", "tools"]);
  const { parsed, failed } = parseAll(files);

  const perFile = new Map();
  for (const p of parsed) perFile.set(p.rel, { exports: exportedNames(p.ast), used: usedNames(p.ast) });

  const orphans = [];
  const harnessOnly = [];
  const keeps = [];
  const graduatedKeeps = [];
  let totalExports = 0;

  for (const [relPath, info] of perFile) {
    if (isHarness(relPath)) continue; // the harness's own exports are not rules
    for (const exp of info.exports) {
      totalExports++;
      const shipped = [];
      const harness = [];
      for (const [otherPath, other] of perFile) {
        if (otherPath === relPath) continue;
        if (!other.used.has(exp.name)) continue;
        (isHarness(otherPath) ? harness : shipped).push(otherPath);
      }
      const key = `${relPath}#${exp.name}`;
      const declared = declaredKeeps.has(key);

      if (shipped.length) {
        // A declared keep that has acquired a real caller is news: the
        // reason it was held back no longer applies. Reported rather
        // than silently dropped, so the reason gets revisited.
        if (declared) graduatedKeeps.push({ key, kind: exp.kind, calledBy: shipped.sort() });
        continue;
      }
      if (declared) keeps.push({ key, kind: exp.kind, seenIn: harness.sort() });
      else if (harness.length) harnessOnly.push({ key, kind: exp.kind, seenIn: harness.sort() });
      else orphans.push({ key, kind: exp.kind });
    }
  }

  const byKey = (a, b) => a.key.localeCompare(b.key);
  orphans.sort(byKey);
  harnessOnly.sort(byKey);
  keeps.sort(byKey);
  graduatedKeeps.sort(byKey);
  return { orphans, harnessOnly, keeps, graduatedKeeps, totalExports, parsed, failed };
}

function write(result, keeps, note) {
  const payload = {
    _what:
      "The known backlog of exported rules with no caller in shipped code. THIS FILE MAY ONLY SHRINK. A new orphan fails the check immediately; the existing list can be reduced by wiring a rule or deleting it, never extended to make a failure go away.",
    _keep:
      "Exports deliberately left uncalled, each with a REQUIRED reason. An entry with an empty reason fails the check, per the anti-silence rule: anything held back is named with its reason. These are DECLARED, not inferred from where a name happens to appear. If one acquires a real caller the check says so, because the reason it was held back has stopped being true.",
    _harnessOnly:
      "Informational, not enforced: exports named only inside tools/. Nothing lives here at 3.368.1 because the mutation corpus was lost. It will repopulate if that corpus is rebuilt, and entries that belong in _keep should be moved there explicitly rather than left to be inferred.",
    _baseline: note,
    generatedAt: new Date().toISOString().slice(0, 10),
    systemVersion: JSON.parse(fs.readFileSync(path.join(SYSTEM_ROOT, "system.json"), "utf8")).version,
    totalExportsChecked: result.totalExports,
    orphanCount: result.orphans.length,
    keep: keeps,
    orphans: result.orphans.map((o) => o.key),
    harnessOnly: result.harnessOnly.map((h) => h.key)
  };
  fs.writeFileSync(RATCHET_FILE, `${JSON.stringify(payload, null, 2)}\n`);
  return payload;
}

export function run({ update = false, init = false } = {}) {
  const existing = loadRatchet();
  const keeps = existing?.keep ?? {};
  const result = analyse(new Set(Object.keys(keeps)));
  const hadParseFailures = reportParseFailures(result.failed, "verify-rules-have-callers");

  if (init || !existing) {
    const payload = write(
      result,
      keeps,
      "Fresh baseline taken at 3.368.1 after the original ratchet was lost with its container. NOT inherited from the previous 532: that figure counted a rule as called when a mutation file drove it, and the 190-file mutation corpus is gone, so several hundred exports that had a harness caller now read as having none. Expect this number to fall sharply if that corpus is rebuilt."
    );
    process.stdout.write(
      `verify-rules-have-callers: baseline written — ${payload.orphanCount} uncalled of ` +
        `${payload.totalExportsChecked} exports, ${Object.keys(keeps).length} declared keeps.\n`
    );
    return { ok: !hadParseFailures, ...result };
  }

  const known = new Set(existing.orphans ?? []);
  const current = new Set(result.orphans.map((o) => o.key));

  const appeared = [...current].filter((k) => !known.has(k)).sort();
  const fixed = [...known].filter((k) => !current.has(k)).sort();
  const unexplained = Object.entries(keeps)
    .filter(([, reason]) => !String(reason ?? "").trim())
    .map(([k]) => k)
    .sort();
  const missingKeeps = Object.keys(keeps).filter(
    (k) => !result.keeps.some((x) => x.key === k) && !result.graduatedKeeps.some((x) => x.key === k)
  );

  let ok = !hadParseFailures;

  if (appeared.length) {
    ok = false;
    process.stderr.write(
      `\nverify-rules-have-callers: ${appeared.length} NEW uncalled export(s).\n` +
        `An exported rule nobody calls is not automation — it is a well-tested opinion (lesson 5.1).\n` +
        `Wire it, delete it, or if it is deliberate add it to "keep" with a reason.\n`
    );
    for (const k of appeared) process.stderr.write(`  ${k}\n`);
  }

  if (unexplained.length) {
    ok = false;
    process.stderr.write(
      `\nverify-rules-have-callers: ${unexplained.length} keep(s) with no reason recorded.\n` +
        `Anything held back must be named with its reason. Fill these in in tools/uncalled-exports.json:\n`
    );
    for (const k of unexplained) process.stderr.write(`  ${k}\n`);
  }

  if (missingKeeps.length) {
    ok = false;
    process.stderr.write(
      `\nverify-rules-have-callers: ${missingKeeps.length} keep(s) name an export that no longer exists.\n` +
        `A keep pointing at nothing protects nothing while reporting success. Remove or correct:\n`
    );
    for (const k of missingKeeps) process.stderr.write(`  ${k}\n`);
  }

  if (result.graduatedKeeps.length) {
    process.stdout.write(
      `\nverify-rules-have-callers: ${result.graduatedKeeps.length} declared keep(s) now have a real caller —\n` +
        `the reason each was held back has stopped being true. Revisit and remove from "keep":\n` +
        result.graduatedKeeps.map((g) => `  ${g.key}  (called by ${g.calledBy.join(", ")})`).join("\n") +
        `\n`
    );
  }

  if (fixed.length) {
    process.stdout.write(
      `\nverify-rules-have-callers: ${fixed.length} export(s) in the backlog now have callers:\n` +
        fixed.map((k) => `  ${k}`).join("\n") +
        `\nThe ratchet may only shrink — run with --update to record the smaller backlog.\n`
    );
    if (update) {
      write(result, keeps, existing._baseline);
      process.stdout.write(`Recorded: backlog is now ${result.orphans.length}.\n`);
    } else {
      ok = false;
    }
  }

  if (ok) {
    process.stdout.write(
      `verify-rules-have-callers: OK — ${result.orphans.length} uncalled of ${result.totalExports} exports ` +
        `(backlog unchanged), ${result.keeps.length} declared keeps, all with reasons.\n`
    );
  }
  return { ok, ...result };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const update = process.argv.includes("--update");
  const init = process.argv.includes("--init");
  let r;
  try {
    r = run({ update, init });
  } catch (err) {
    process.stderr.write(`verify-rules-have-callers: ${err.message}\n`);
    process.exit(2);
  }
  process.exit(r.ok ? 0 : 1);
}
