#!/usr/bin/env node
/**
 * verify-wildshape-vocabulary — the names in the code are the names in
 * the packs, and the constant that holds them is actually read.
 *
 * NEW at 3.384.0, and it is the half of that release that does any work.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY A CONSTANT IS NOT A GUARD
 *
 * `WILD_SHAPE_ABILITY = "Wild Shape"` was exported at 3.346.0 and read
 * by nothing. Five call sites across four files wrote the string out by
 * hand — one of them lowercased, which is why the triage that went
 * looking for duplications missed it. 3.384.0 pointed four of them at
 * the constant.
 *
 * THAT ON ITS OWN CHANGES NOTHING ABOUT CORRECTNESS. Rename the ability
 * in the pack and every lookup breaks whether it reads a constant or a
 * literal; sharing one line only means there is a single place to fix
 * once somebody notices. "Somebody notices" is the part that was
 * missing, and it is the part this file supplies.
 *
 * THE BUG THIS IS SHAPED BY, 23 August 2026: Improved Combat Reflexes
 * did nothing for a release because the code matched
 * `"improved combat reflexes"` and the pack held **"Combat Reflexes,
 * Improved"**. Its harness agreed with the code — both used the name I
 * had invented, and neither had ever opened the pack. Green tests, dead
 * feat, no symptom until Graham pressed the button.
 *
 * So section A does the one thing that would have caught it: it opens
 * the packs and asks whether each name is a real item.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION B IS AN ALLOWLIST WITH EXACT COUNTS, on purpose.
 *
 * The usual objection to a source check applies — §5.3, a check written
 * beside the code encodes the same mistake — and it is weaker here than
 * usual, because the thing under guard IS vocabulary. But a "no literals
 * anywhere" rule would be a lie: three literals survive 3.384.0 and each
 * survives for a stated reason. An allowlist naming the file and the
 * count makes those three DECLARED rather than tolerated, and makes a
 * fourth fail on the day it appears rather than on the day it breaks.
 *
 * The three that stay, and why none is a lookup key:
 *
 *   feats-workflow.mjs (2)  a card TITLE, and a FEAT_AUTOMATION registry
 *                           key — the registry is several hundred
 *                           literal keys and one computed key would read
 *                           as a mistake, not a fix.
 *   wildshape-riders.mjs (2) `spell?.name ?? "Wild Shape"`, a display
 *                           fallback for a spell with no name. Nothing
 *                           is looked up with it.
 *   extra-uses.mjs (1)      one row of a three-row table whose other two
 *                           rows name abilities with no constant.
 *                           Section A checks all three instead.
 */

import fs from "node:fs";
import path from "node:path";
import * as walk from "acorn-walk";
import { SYSTEM_ROOT, parseAll, rel, reportParseFailures } from "./lib/sources.mjs";
import { WILD_SHAPE_ABILITY, WILD_SHAPE_FORM_FEATS, WILD_SHAPE_POOL_SPELL }
  from "../module/magic/wildshape-feats.mjs";
import { EXTRA_USES_FEATS } from "../module/extra-uses.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

const normalise = (s) => String(s ?? "").trim().toLowerCase();

/* ================================================================== *
 * A. Every name is a real pack item
 * ================================================================== */

/**
 * Item names in one pack, by type.
 *
 * READ FROM THE COMPILED PACK, which is the only copy that exists —
 * there is no packs-source/ in this project, so the LevelDB IS the
 * source of truth about what a thing is called.
 */
async function packNames(packName) {
  const dir = path.join(SYSTEM_ROOT, "packs", packName);
  if (!fs.existsSync(dir)) return null;
  const { ClassicLevel } = await import("classic-level");
  const db = new ClassicLevel(dir, { valueEncoding: "json" });
  await db.open();
  const byType = new Map();
  try {
    for await (const [key, value] of db.iterator()) {
      if (!key.startsWith("!items!") || !value?.name) continue;
      const type = String(value.type ?? "");
      if (!byType.has(type)) byType.set(type, new Set());
      byType.get(type).add(normalise(value.name));
    }
  } finally {
    await db.close();
  }
  return byType;
}

const abilities = await packNames("abilities");
const spells = await packNames("spells");
const feats = await packNames("feats");

// A MISSING PACK IS A FAILURE, NOT A SKIP — lib/sources.mjs's one rule,
// applied here. A check that could not read the packs has not checked
// them, and reporting green would be the exact silence this harness
// exists to refuse.
ok("A0a the abilities pack could be read", abilities !== null);
ok("A0b the spells pack could be read", spells !== null);
ok("A0c the feats pack could be read", feats !== null);

const hasItem = (byType, type, name) =>
  Boolean(byType?.get(type)?.has(normalise(name)));

ok(`A1 WILD_SHAPE_ABILITY names a real ability (${WILD_SHAPE_ABILITY})`,
  hasItem(abilities, "ability", WILD_SHAPE_ABILITY),
  "four call sites look an ability up by this exact string");

ok(`A2 WILD_SHAPE_POOL_SPELL names a real spell (${WILD_SHAPE_POOL_SPELL})`,
  hasItem(spells, "spell", WILD_SHAPE_POOL_SPELL),
  "usesPoolNameFor redirects the whole daily allowance onto this item");

// THE OTHER TWO ABILITIES IN THE EXTRA-USES TABLE. They have no constant
// and are not getting one; this is what protects them instead, and it
// protects them exactly as well.
for (const [featName, entry] of Object.entries(EXTRA_USES_FEATS)) {
  ok(`A3 the feat "${featName}" is in the pack`,
    hasItem(feats, "feat", featName));
  ok(`A4 the ability it feeds is in the pack (${entry.ability})`,
    hasItem(abilities, "ability", entry.ability),
    "extraUsesBonus matches this against the ability item's own name");
}

// THE FOUR FORM FEATS AND THE SPELLS THEY UNLOCK. Both halves are
// lookup keys: the feat name against the actor's feats, the spell name
// against the pack.
for (const [featName, spellName] of Object.entries(WILD_SHAPE_FORM_FEATS)) {
  ok(`A5 the form feat "${featName}" is in the pack`,
    hasItem(feats, "feat", featName));
  ok(`A6 the form spell it unlocks is in the pack (${spellName})`,
    hasItem(spells, "spell", spellName));
}

/* ================================================================== *
 * B. The constant is read, and the survivors are declared
 * ================================================================== */

/** file → how many `"wild shape"` string literals may appear in it. */
const LITERAL_ALLOWANCE = Object.freeze({
  "module/magic/wildshape-feats.mjs": 1,   // the constant itself
  "module/feats-workflow.mjs": 2,          // registry key + card title
  "module/magic/wildshape-riders.mjs": 2,  // display fallbacks
  "module/extra-uses.mjs": 1               // the table row, covered by A4
});

const { parsed, failed } = parseAll();
if (reportParseFailures(failed, "verify-wildshape-vocabulary")) process.exit(1);

// THE WALKER HAS A BLIND SPOT AND IT IS THE ONE THAT MATTERS HERE.
// `walk.simple` does not descend into a non-computed property key, so
// `{ "wild shape": ... }` — which is exactly how FEAT_AUTOMATION looks a
// feat up by name — is invisible to a plain `Literal` visitor. Measured,
// not assumed: parsing `{ "wild shape": 1 }` yields no string literal at
// all.
//
// That blind spot was hiding a real literal on the first run of this
// file, and the count came back one short. Left alone it would have made
// the whole check silently exempt every registry keyed on an item name —
// a check that cannot see a construct has not checked it. The explicit
// `Property` visitor below closes it; `!node.computed` stops a computed
// key being counted twice, since the base walk reaches that one already.
const counted = new Map();
for (const file of parsed) {
  let n = 0;
  const count = (value) => {
    if (typeof value === "string" && normalise(value) === "wild shape") n += 1;
  };
  walk.simple(file.ast, {
    Literal(node) { count(node.value); },
    Property(node) {
      if (!node.computed && node.key?.type === "Literal") count(node.key.value);
    }
  });
  if (n > 0) counted.set(rel(file.file), n);
}

for (const [where, n] of counted) {
  const allowed = LITERAL_ALLOWANCE[where] ?? 0;
  ok(`B1 ${where} holds no undeclared "Wild Shape" literal`,
    n <= allowed,
    `${n} found, ${allowed} declared — if this one is not a lookup key, `
      + "add it to LITERAL_ALLOWANCE with the reason; if it is, read WILD_SHAPE_ABILITY");
}

// AND THE ALLOWANCE MAY NOT ROT. A declared literal that has since been
// removed should shrink the allowance, or the next one to appear slips
// in under a slot somebody else vacated.
for (const [where, allowed] of Object.entries(LITERAL_ALLOWANCE)) {
  ok(`B2 ${where} still holds the ${allowed} literal(s) it declares`,
    (counted.get(where) ?? 0) === allowed,
    `${counted.get(where) ?? 0} found — lower the allowance rather than leaving a free slot`);
}

/* ================================================================== *
 * C. The four fixed call sites actually reach the constant
 * ================================================================== */

// B ALONE WOULD PASS ON A DELETED CALL. Removing the lookup entirely
// removes the literal too, so the absence of a literal is not evidence
// that the rule is still there — §5.2's shape, where "named somewhere"
// was mistaken for "imported". These four ask that the constant is
// IMPORTED and USED, which is what a mutation removing either can fail.
const READERS = Object.freeze([
  "module/druid.mjs",
  "module/uses-workflow.mjs",
  "module/rune-actions-workflow.mjs"
]);

for (const where of READERS) {
  const file = parsed.find((f) => rel(f.file) === where);
  ok(`C0 ${where} was parsed`, Boolean(file));
  if (!file) continue;

  let imported = false;
  let used = 0;
  walk.simple(file.ast, {
    ImportDeclaration(node) {
      if (!String(node.source.value).includes("wildshape-feats")) return;
      if (node.specifiers.some((s) => s.imported?.name === "WILD_SHAPE_ABILITY")) imported = true;
    },
    Identifier(node) {
      if (node.name === "WILD_SHAPE_ABILITY") used += 1;
    }
  });

  ok(`C1 ${where} imports WILD_SHAPE_ABILITY from wildshape-feats`, imported);
  // ONE OR MORE, and the threshold was wrong on the first run. It was
  // written as `>= 2` on the assumption that the import specifier counts
  // as an occurrence, which would make one occurrence mean "imported and
  // never read". `walk.simple` does not visit import specifiers, so the
  // count is uses alone — measured on a two-line fixture rather than
  // reasoned about, after two files failed a check that was itself
  // wrong. §5.3 in miniature: the check encoded my belief about the
  // walker, and the belief was the error.
  ok(`C2 ${where} reads it, not just imports it`, used >= 1,
    `${used} occurrence(s) — an import nothing reads is the defect, not the fix`);
}

/* ================================================================== */

process.stdout.write(`verify-wildshape-vocabulary: ${checks} checks\n`);
if (failures.length) {
  process.stderr.write(`\n${failures.length} FAILED:\n`);
  for (const f of failures) process.stderr.write(`  ${f}\n`);
  process.exit(1);
}
process.stdout.write("  all pass\n");
