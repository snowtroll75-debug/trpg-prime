#!/usr/bin/env node
/**
 * verify-chooser-index-fields — a filter may only read a field the index
 * was asked for. NEW at 3.552.7.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE INCIDENT THIS EXISTS FOR.
 *
 * Graham pressed Use on Arcane Knowledge in a freshly loaded world at
 * 3.552.5 and got, with no dialog at all:
 *
 *     "Arcane Knowledge: no matching spells found in the compendium."
 *
 * The compendium had twenty matching spells. Running the chooser's exact
 * pipeline by hand a minute later found all twenty. Nothing had changed
 * in between except that the pipeline had been RUN once.
 *
 * Foundry's compendium index carries `_id`, `name`, `img`, `type` and
 * nothing else of `system` unless a caller asks for it by name — and the
 * index is CACHED AND MERGED, so whatever any earlier call asked for
 * stays visible to every later one. An undeclared field is therefore
 * `undefined` on a cold world and populated on a warm one. The bug is
 * invisible in testing, because testing warms the index.
 *
 * `isCantripSpell` reads `system.ppCost` AND `system.traits`. Six
 * choosers filter on it — Noldorni, Gul-Fyr, Elven Magic, Ethereal
 * Trick, Verdant Gnome and Arcane Knowledge — and only Menora, which
 * does not use it, had declared `system.traits`. All six matched
 * nothing until something else in the session happened to warm the
 * field. Primal Warrior had the same hole in the other half of its
 * filter: `Boolean(s.system?.defence)` was dead on a cold world, so the
 * "any spell with a defence" half never fired.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT THIS PINS.
 *
 *   A. `system.traits` is in grantChosenSpell's BASE field list, not
 *      opt-in — it is the most-read spell field there is.
 *   B. Every grantChosenSpell caller's filter reads only fields that are
 *      base or declared in that caller's own `indexFields`.
 *   C. isCantripSpell really does depend on both fields, so A is a rule
 *      and not a coincidence.
 *   D. The same rule over every OTHER index filter in the system that
 *      declares fields at all — the ammunition builder among them,
 *      which was reading an undeclared `system.quantity` and pricing
 *      every batch as one.
 *
 * It is a SOURCE check, and it says so: the failure is the ABSENCE of a
 * string in a field list, which no amount of calling the function can
 * show outside Foundry.
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
function eq(label, actual, expected) {
  ok(label, JSON.stringify(actual) === JSON.stringify(expected),
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
const read = (...parts) => fs.readFileSync(path.join(SYSTEM_ROOT, ...parts), "utf8");

/** Comments out, so a field NAMED in prose is not a declaration. */
function stripComments(text) {
  return String(text)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/(^|[^:"'`])\/\/.*$/, "$1"))
    .join("\n");
}

/** The `{ ... }` starting at `open`, brace-matched. */
function braceBlock(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === "{") depth += 1;
    else if (text[i] === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(open, i + 1);
    }
  }
  return text.slice(open);
}

const FEATS = stripComments(read("module", "feats-workflow.mjs"));

/* ================================================================== *
 * A. THE BASE LIST
 *
 * Asserted as the WHOLE statement, not as "traits appears somewhere in
 * the file": a check that only asks whether the string is present is
 * walked past by a field list that mentions it in a comment or in some
 * other call entirely.
 * ================================================================== */
const BASE_FIELDS = ["system.tradition", "system.ppCost", "system.specialist", "system.traits"];
{
  const call = /const index = await pack\.getIndex\(\{\s*fields: \[([^\]]*)\]\s*\}\);/.exec(FEATS);
  ok("A1 grantChosenSpell asks the index for its fields in one place", Boolean(call));
  const declared = call ? Array.from(call[1].matchAll(/"([^"]+)"/g)).map((m) => m[1]) : [];
  eq("A2 and the base list is exactly the four every filter may assume",
    declared, BASE_FIELDS);
  ok("A3 with the per-caller list spread in after them",
    Boolean(call) && /\.\.\.indexFields\s*\]/.test(call[0]),
    "a caller that needs more must still be able to ask");
}

/* ================================================================== *
 * B. EVERY CHOOSER
 * ================================================================== */
{
  const blocks = [];
  const marker = "grantChosenSpell(actor, {";
  let at = FEATS.indexOf(marker);
  while (at !== -1) {
    const block = braceBlock(FEATS, FEATS.indexOf("{", at + marker.length - 1));
    const title = /title:\s*"([^"]+)"/.exec(block);
    blocks.push({ title: title ? title[1] : `(untitled at ${at})`, block });
    at = FEATS.indexOf(marker, at + 1);
  }

  // The scan asserting its own reach: if a reformat defeats the marker
  // this fails loudly rather than passing with nothing to check.
  ok("B1 the scan found the choosers to check", blocks.length >= 15,
    `found ${blocks.length}`);

  const offenders = [];
  for (const { title, block } of blocks) {
    const declared = new Set([
      ...BASE_FIELDS,
      ...Array.from(block.matchAll(/indexFields:\s*\[([^\]]*)\]/g))
        .flatMap((m) => Array.from(m[1].matchAll(/"([^"]+)"/g)).map((f) => f[1]))
    ]);
    // The WHOLE chooser block, not just its `filter:` property. A
    // chooser may test an index entry from more than one place — a
    // second predicate, a sort, a label — and every one of them reads
    // the same index, so every one of them is bound by the same rule.
    // Scanning only the filter is how A4 of the mutation file walked
    // straight past this check when it was first written.
    const reads = new Set(
      Array.from(block.matchAll(/\bs\??\.system\?\.([A-Za-z0-9_]+)/g)).map((m) => `system.${m[1]}`)
    );
    // A filter that delegates to isCantripSpell reads what IT reads.
    if (/isCantripSpell\(/.test(block)) {
      reads.add("system.ppCost");
      reads.add("system.traits");
    }
    for (const field of reads) {
      if (!declared.has(field)) offenders.push(`${title}: reads ${field}, never asked for it`);
    }
  }
  eq("B2 no chooser filters on a field the index was not asked for", offenders, []);

  // Named on its own because it is the one Graham found live, and the
  // one whose failure is silent rather than wrong.
  const arcane = blocks.find((b) => b.title === "Arcane Knowledge");
  ok("B3 Arcane Knowledge is still a cantrip chooser", Boolean(arcane) &&
    /isCantripSpell\(s\)/.test(arcane.block),
    "the incident's own case");
}

/* ================================================================== *
 * C. THE DEPENDENCY IS REAL
 *
 * A pins traits into the base list BECAUSE isCantripSpell needs it. If
 * that function stops reading traits the rule should be re-argued, not
 * silently kept.
 * ================================================================== */
{
  const casting = stripComments(read("module", "magic", "casting.mjs"));
  const fn = /export function isCantripSpell\(spell\) \{([\s\S]*?)\n\}/.exec(casting);
  ok("C1 isCantripSpell exists to read", Boolean(fn));
  const body = fn ? fn[1] : "";
  ok("C2 it refuses anything that costs PP",
    /Number\(spell\?\.system\?\.ppCost \?\? 1\) !== 0\) return false;/.test(body),
    "a 1 PP spell is not a cantrip however it is traited");
  ok("C3 and it requires the Cantrip trait — which is why traits is base",
    /return \/\\bcantrip\\b\/i\.test\(String\(spell\?\.system\?\.traits \?\? ""\)\);/.test(body),
    "PP 0 alone catches at-will spells that are not cantrips");
}

/* ================================================================== *
 * D. THE SAME RULE EVERYWHERE ELSE
 *
 * Scoped to index calls that declare fields AT ALL: a bare getIndex()
 * is the "fetch the documents" idiom, where reads come off a full
 * document and are none of this check's business.
 * ================================================================== */
{
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".mjs")) files.push(full);
    }
  };
  walk(path.join(SYSTEM_ROOT, "module"));

  let scanned = 0;
  const offenders = [];
  for (const file of files) {
    const source = stripComments(fs.readFileSync(file, "utf8"));
    const lines = source.split("\n");
    for (let i = 0; i < lines.length; i += 1) {
      if (!/getIndex\(\{/.test(lines[i])) continue;
      const window = lines.slice(i, i + 12).join("\n");
      const fields = /fields:\s*\[([^\]]*)\]/.exec(window);
      if (!fields) continue;
      // grantChosenSpell's own call is section A and B's subject.
      if (/\.\.\.indexFields/.test(fields[1])) continue;
      scanned += 1;
      const declared = new Set(Array.from(fields[1].matchAll(/"([^"]+)"/g)).map((m) => m[1]));
      // Only names bound as the parameter of a callback over the index
      // count: `entry.system?.x` where `entry` is that parameter.
      const params = new Set(Array.from(window.matchAll(/\(\s*([A-Za-z_$][\w$]*)\s*\)\s*=>/g)).map((m) => m[1]));
      for (const param of params) {
        const reads = window.matchAll(new RegExp(`\\b${param}\\.system\\?\\.([A-Za-z0-9_]+)`, "g"));
        for (const match of reads) {
          const field = `system.${match[1]}`;
          if (!declared.has(field)) {
            offenders.push(`${path.relative(SYSTEM_ROOT, file)}:${i + 1} reads ${field}, asked for [${[...declared].join(", ")}]`);
          }
        }
      }
    }
  }
  ok("D1 the sweep found the field-declaring index calls", scanned >= 5, `found ${scanned}`);
  eq("D2 none of them filters or renders on a field it never asked for", offenders, []);

  // The one this sweep caught on the day it was written.
  const builder = stripComments(read("module", "magic-item-builder-workflow.mjs"));
  ok("D3 the ammunition builder asks for the quantity it prices by",
    /fields: \[[^\]]*"system\.quantity"[^\]]*\] \}\) : \[\];/.test(builder),
    "every batch read as one, so a bundle of 20 arrows was priced and weighed as a single arrow");

  // THE INDEX AND ITS CONSUMER CAN BE IN DIFFERENT FILES.
  //
  // grants-workflow's packIndex hands its entries to matchGrants, which
  // lives in the pure rules module and reads `system.sourceClass` off
  // them. Neither file can see the other's half of the bargain, and a
  // 12-line window around the getIndex call never will — so the rule is
  // stated across the pair: whatever the matcher reads, the supplier
  // must have asked for. Without it the Rogue is handed the Ranger's
  // Trap Finder, which is the bug that put the field there in 3.180.0.
  const grantsWorkflow = stripComments(read("module", "grants-workflow.mjs"));
  const grantsRules = stripComments(read("module", "grants.mjs"));
  const matcher = /export function matchGrants\(([\s\S]*?)\n\}/.exec(grantsRules);
  ok("D4 matchGrants exists to read", Boolean(matcher));
  const matcherReads = matcher
    ? [...new Set(Array.from(matcher[1].matchAll(/\b[A-Za-z_$][\w$]*\.system\?\.([A-Za-z0-9_]+)/g))
      .map((m) => `system.${m[1]}`))]
    : [];
  const supplied = /const index = await pack\.getIndex\(\{ fields: \[([^\]]*)\] \}\);\s*\n\s*return Array\.from\(index\.values\(\)\);/
    .exec(grantsWorkflow);
  ok("D5 the grants pack index is fetched in one place with a declared field list", Boolean(supplied));
  const suppliedFields = supplied
    ? Array.from(supplied[1].matchAll(/"([^"]+)"/g)).map((m) => m[1])
    : [];
  ok("D6 the matcher reads at least one index field, so the rule has a subject",
    matcherReads.length > 0, `found ${JSON.stringify(matcherReads)}`);
  eq("D7 and every field it reads is one the index was asked for",
    matcherReads.filter((f) => !suppliedFields.includes(f)), []);
}

/* ================================================================== *
 * E. THE FIELD A FILTER READS MUST ALSO BE THE RIGHT ONE
 *
 * Declaring the field is half the rule; reading the field that holds
 * the answer is the other half. Primal Warrior failed both at once —
 * `/attack|save/.test(traits)` matched 0 of 586 non-specialist spells,
 * because attack and save are the spell's CATEGORY — so the chooser was
 * left leaning on an undeclared `system.defence`, and offered nothing
 * at all in every world until 3.552.7. Measured live in Graham's world,
 * 15 September 2026.
 * ================================================================== */
{
  const primal = FEATS.slice(FEATS.indexOf('title: "Primal Warrior"'));
  ok("E1 Primal Warrior filters on the spell's category",
    /filter: \(s\) => \/\^\(attack\|save\)\$\/i\.test\(String\(s\.system\?\.category \?\? ""\)\.trim\(\)\),/
      .test(primal),
    "attack and save are a category, not a trait — the traits test matched nothing");

  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), {
    keyEncoding: "utf8", valueEncoding: "json"
  });
  await db.open();
  const spells = [];
  try {
    for await (const [key, value] of db.iterator()) {
      if (key.startsWith("!items!") && value?.type === "spell") spells.push(value);
    }
  } finally { await db.close(); }

  const categories = new Set(spells.map((s) => String(s.system?.category ?? "").trim().toLowerCase()));
  ok("E2 the pack was read", spells.length > 500, `found ${spells.length}`);
  eq("E3 and a spell's category is one of the three the system knows",
    [...categories].filter((c) => !["attack", "save", "utility", ""].includes(c)), []);
  const offerable = spells.filter((s) => !s.system?.specialist)
    .filter((s) => /^(attack|save)$/i.test(String(s.system?.category ?? "").trim()));
  const attacks = offerable.filter((s) => /^attack$/i.test(String(s.system?.category ?? "").trim()));
  ok("E4 the filter has something to offer", offerable.length > 150, `found ${offerable.length}`);
  // THE HALF THE OLD FILTER LOST. Attack spells carry no defence, so a
  // defence-only test could never reach one — 30 spells, silently.
  ok("E5 including the attack spells, which carry no defence at all",
    attacks.length > 20 && attacks.every((s) => !String(s.system?.defence ?? "").trim()),
    `${attacks.length} attack spells, ${attacks.filter((s) => String(s.system?.defence ?? "").trim()).length} with a defence`);

  /*
   * THE EIGHT THAT SAT BETWEEN THE TWO (3.552.9).
   *
   * All eight were `category: utility` while carrying a defence, so they
   * resolved as save spells at the table — cast-workflow decides that
   * from the DEFENCE, not the category — while being labelled utility
   * for spell-scoped conditionals and left off every attack/save list.
   *
   * Graham's ruling of 15 September 2026 split them by whose save it is:
   * where an unwilling creature resists the spell aimed at it, it is a
   * save spell and the data was wrong; where the save belongs to
   * somebody interacting with an area the spell created, utility stands.
   * Declared in tools/data-fixes.json as <name>-category-save, and
   * pinned here so neither half drifts back.
   */
  const categoryOf = (name) => {
    const row = spells.find((s) => s.name === name);
    return row ? String(row.system?.category ?? "").trim().toLowerCase() : "(not in pack)";
  };
  const defenceOf = (name) => {
    const row = spells.find((s) => s.name === name);
    return row ? String(row.system?.defence ?? "").trim() : "";
  };
  const NOW_SAVE = ["Scrying", "Spirit Mark", "Temporal Stasis", "Tame"];
  const STILL_UTILITY = ["Unremarkable Aura", "Solitude", "Rainbow Cloak", "Verdant Retribution"];
  eq("E6 the four whose target resists the spell are save spells",
    NOW_SAVE.filter((n) => categoryOf(n) !== "save"), []);
  eq("E7 and the four whose save belongs to a bystander stay utility",
    STILL_UTILITY.filter((n) => categoryOf(n) !== "utility"), []);
  // The reason all eight were ambiguous in the first place: they have a
  // defence. If one loses it, the ruling that sorted them no longer
  // applies to it and should be re-argued rather than silently kept.
  eq("E8 all eight still carry the defence that made them ambiguous",
    [...NOW_SAVE, ...STILL_UTILITY].filter((n) => !defenceOf(n)), []);
}

console.log(`verify-chooser-index-fields: ${checks} checks`);
if (failures.length) {
  console.log(`\nverify-chooser-index-fields: ${failures.length} FAILED`);
  for (const failure of failures) console.log(`  ${failure}`);
  process.exit(1);
}
console.log("verify-chooser-index-fields: all pass");
