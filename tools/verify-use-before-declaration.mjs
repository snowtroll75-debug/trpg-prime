#!/usr/bin/env node
/**
 * verify-use-before-declaration — nothing reads a `let`/`const` above the
 * line that declares it.
 *
 * NEW at 3.393.1, written the hour after making the mistake for the
 * second time in one function.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE TEMPORAL DEAD ZONE IS A RUNTIME ERROR THAT LOOKS LIKE NOTHING
 *
 * `let` and `const` exist from the top of their block but cannot be READ
 * until the line that declares them. Reading one earlier throws "Cannot
 * access 'x' before initialization" — at run time, on that code path
 * only, with a clean parse and a green test suite.
 *
 * cast-workflow.mjs has now done it twice:
 *
 *   3.196.0  `tradition` was declared below buildMetamagicOptions, which
 *            reads it. Its own comment records the result: "every
 *            non-cantrip cast threw 'Cannot access tradition before
 *            initialization' before it reached the warp chooser. Found
 *            in review; the bug shipped earlier."
 *
 *   3.393.0  a line pushed onto `lines` from 160 lines above where
 *            `lines` is declared. Every cantrip threw. Found by casting
 *            one, because nothing else could — `castSpell` needs Foundry,
 *            so no harness reaches it.
 *
 * Both were in the same 1,750-line function, and that is the point: it
 * is long enough that where a thing is declared is not where you
 * remember it being. A check does not have to remember.
 *
 * ─────────────────────────────────────────────────────────────────────
 * DELIBERATELY CONSERVATIVE
 *
 * A reference inside a nested FUNCTION is not reported, even when it sits
 * above the declaration: a callback defined early and called late is
 * legal and extremely common. Only a reference on the straight-line path
 * — same function scope, earlier in the source — is a certain error, and
 * a check that cried wolf on closures would be turned off within a week.
 *
 * Both real bugs are of exactly that shape.
 */

import { analyze } from "eslint-scope";
import { findSourceFiles, parseAll, reportParseFailures } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

/** The nearest enclosing function (or module) scope for any scope. */
function functionScopeOf(scope) {
  let s = scope;
  while (s && !["function", "module", "global"].includes(s.type)) s = s.upper;
  return s;
}

/**
 * Every read of a block-scoped binding that happens, on the straight-line
 * path, above its own declaration.
 */
export function useBeforeDeclaration(parsed) {
  const manager = analyze(parsed.ast, { ecmaVersion: 2024, sourceType: "module", ignoreEval: true });
  const out = [];
  const seen = new Set();

  for (const scope of manager.scopes) {
    for (const variable of scope.variables) {
      const def = variable.defs[0];
      if (!def) continue;
      // `var` and function declarations hoist and initialise; only
      // let/const/class have a dead zone.
      const kind = def.kind ?? (def.type === "ClassName" ? "class" : null);
      if (!["let", "const", "class"].includes(kind)) continue;
      const declaredAt = def.name?.range?.[0];
      if (declaredAt == null) continue;

      const declScope = functionScopeOf(variable.scope);
      for (const ref of variable.references) {
        const at = ref.identifier?.range?.[0];
        if (at == null || at >= declaredAt) continue;
        // NO `if (ref.init) continue` GUARD. One was written and no
        // mutation could kill it: the initialising write's identifier IS
        // the declaration's, so `at >= declaredAt` above has already
        // filtered it. Removed rather than kept, for the reason this
        // project keeps re-learning — a guard nothing can reach is a
        // guard no mutation can prove.
        // A closure defined above and called below is legal.
        if (functionScopeOf(ref.from) !== declScope) continue;
        const key = `${parsed.rel}:${ref.identifier.loc?.start.line}:${variable.name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          name: variable.name,
          usedLine: ref.identifier.loc?.start.line ?? null,
          declaredLine: def.name.loc?.start.line ?? null
        });
      }
    }
  }
  return out;
}

/* ================================================================== *
 * A. The check can see the shape it exists for
 * ================================================================== */

import * as acorn from "acorn";
const probe = (src) => useBeforeDeclaration({
  rel: "probe",
  ast: acorn.parse(src, { ecmaVersion: "latest", sourceType: "module", ranges: true, locations: true })
});

// THE TWO REAL BUGS, in miniature.
ok("A1 a read above its own const is caught", probe("lines.push(1);\nconst lines = [];").length === 1);
ok("A2 a read above its own let is caught", probe("f(t);\nlet t = 1;").length === 1);
ok("A3 a read below is fine", probe("const lines = [];\nlines.push(1);").length === 0);

// CONSERVATIVE ON PURPOSE — these must NOT be reported.
ok("A4 a closure defined above and called below is fine",
  probe("const f = () => lines;\nconst lines = [];\nf();").length === 0,
  "a callback that runs later is legal and common");
ok("A5 a hoisted function declaration is fine",
  probe("function f() { return lines; }\nconst lines = [];").length === 0);
ok("A6 `var` has no dead zone", probe("x = 1;\nvar x;").length === 0);
ok("A7 a different variable of the same name in another scope is fine",
  probe("{ const a = 1; a; }\n{ const a = 2; a; }").length === 0);
ok("A8 a class used above its declaration is caught",
  probe("new Thing();\nclass Thing {}").length === 1);

/* ================================================================== *
 * B. The shipped tree is clean
 * ================================================================== */

const files = findSourceFiles();
const { parsed, failed } = parseAll(files);
if (reportParseFailures(failed, "verify-use-before-declaration")) process.exit(1);

const findings = [];
for (const p of parsed) {
  for (const f of useBeforeDeclaration(p)) findings.push({ file: p.rel, ...f });
}
ok(`B1 no source file reads a binding above its declaration (${parsed.length} files)`,
  findings.length === 0,
  findings.map((f) => `${f.file}:${f.usedLine} reads '${f.name}', declared at line ${f.declaredLine}`).join("; "));

/* ================================================================== */

process.stdout.write(`verify-use-before-declaration: ${checks} checks over ${parsed.length} files\n`);
if (failures.length) {
  process.stderr.write(`\n${failures.length} FAILED:\n`);
  for (const f of failures) process.stderr.write(`  ${f}\n`);
  process.exit(1);
}
process.stdout.write("  all pass\n");
