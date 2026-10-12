#!/usr/bin/env node
/**
 * feat-evidence — what mechanism, if any, stands behind each feat.
 *
 * NEW at 3.371.1, after the 436-row feat register was lost with the
 * container it lived in.
 *
 * THIS IS NOT THE REGISTER, AND MUST NOT BE TREATED AS ONE. The register
 * DECLARED each feat automated, manual or todo, with evidence a person
 * wrote and a check that held them to it. This MEASURES something
 * narrower and purely mechanical: is there any machinery attached to this
 * feat at all, and of what kind. It can tell you a feat has nothing
 * behind it. It cannot tell you whether what is behind it is ENOUGH —
 * that was the register's judgement, and this tool does not have it.
 *
 * The distinction matters because of what the numbers do when you put
 * them side by side. The register called 4 feats "manual". This tool
 * finds 34 whose only machinery is a printed note. Those 30 are not a
 * discrepancy to reconcile — they are 30 places where somebody decided a
 * printed reminder was the right amount of automation for that feat, and
 * that decision is exactly what a measurement cannot reconstruct.
 *
 * WHAT IT LOOKS FOR, in order:
 *
 *   code       the feat's name appears in the rules source, with all
 *              COMMENTS STRIPPED FIRST. Without stripping, a feat
 *              discussed in a doc comment and implemented nowhere reads
 *              as wired — eleven of them do, and two turned out to be
 *              genuinely automated while others are only described.
 *   composed   the feat's name is a KEY IN A LOOKUP TABLE THE SYSTEM
 *              BUILDS, so it is never written down as a literal and a
 *              text search cannot find it. See THE FOURTH MISS below.
 *   grants     the feat hands over an ability, spell or feat by name
 *              (`grantedAbilities` / `grantedSpells` / `grantedFeats`,
 *              resolved from the matching compendium by
 *              grants-workflow.mjs). THIS ROUTE WAS MISSED ENTIRELY on
 *              the first version of this tool, and the miss reached a
 *              written report: Monstrous Vision was called broken —
 *              "a character who takes it gets no Darkvision" — when it
 *              carries `grantedAbilities: "Darkvision"` and hands over
 *              the very ability that declares the sense. It was not
 *              merely working, it was already built the way it should
 *              be. Eight feats use this route and all eight read as
 *              having nothing until it was counted.
 *   data       an active effect with real `changes`, OR carrying a
 *              trg-prime flag beyond the featNote/featPassive markers.
 *              THE FLAG CASE IS EASY TO MISS AND WAS: Battle Hardened
 *              and Fast Healer carry no changes at all and automate
 *              entirely through `bleedReduction` and `fastHealing`,
 *              which documents/combat.mjs reads every round. A first
 *              pass that counted only `changes` reported both as
 *              unautomated, which is how a stale todo list gets written.
 *
 *   conditional an authored entry in `flags["trg-prime"].conditionals` —
 *              a bonus that is permanent but SCOPED, offered in the roll
 *              dialog when it could apply. Thirty-four feats use this,
 *              and conditionals.mjs says in its own header that roughly
 *              a third of all racial and heritage abilities are scoped
 *              this way. THE THIRD ROUTE MISSED, and the most costly:
 *              Crimson Covenant and Howling Kinship both carry complete
 *              conditionals, and both were reported to Graham as having
 *              nothing behind them.
 *   note-only  a featNote effect and nothing else — a printed reminder
 *              with no mechanics. Manual, whether or not that was the
 *              intent.
 *   unknown    no mechanism found, AND the feat is discussed in the
 *              source's COMMENTS. The tool cannot tell a rule that is
 *              described-but-unbuilt from one built under a name it
 *              cannot see, so it says so instead of picking. Narrow on
 *              purpose: it is the exact shape the fourth miss wore.
 *   NOTHING    none of the above, and named nowhere at all.
 *
 * ───────────────────────────────────────────────────────────────────
 * THE FOURTH MISS (3.569.0), and it was this tool's own.
 *
 * The block-12 audit reported twelve note-only feats — the whole Minor /
 * Major / Master × Arcane / Divinity / Ethereal / Verdant Caster family.
 * All twelve are fully built, in magic/caster-tier-feats.mjs and
 * magic/feat-casting.mjs, and reach the cast and preparation workflows.
 *
 * THE TOOL COULD NOT SEE THEM BECAUSE THE NAMES ARE NEVER WRITTEN DOWN:
 *
 *     `${tier} ${TRADITIONS[tradition].label.toLowerCase()} caster`
 *
 * built from CASTER_TIERS × TRADITIONS so that a tradition added to
 * config.mjs cannot be silently missing from the table. That is good
 * code, and `code.includes(name)` is blind to it by construction.
 *
 * WHAT THIS COST: every "note-only" figure this project quoted from the
 * day that family was built was inflated by twelve — 17 reported where
 * the truth was 5. The tool that exists to stop false "nothing
 * implements this" claims was making one, twelve times over.
 *
 * THE FIX IS NOT A SPECIAL CASE. Graham's ruling, 18 September 2026:
 * resolve composed names by consulting the tables that build them.
 * COMPOSED_NAME_TABLES below is that registry, and every table is
 * IMPORTED AND READ rather than pattern-matched, so a table whose
 * contents change cannot drift away from what this reports.
 *
 * FOUR ROUTES HAVE NOW BEEN MISSED IN FOUR PASSES, and that is the useful
 * thing this header records. "Nothing implements this feat" is a far
 * harder claim to make truthfully than it looks: automation in this
 * system arrives six different ways — name in code, a name the code
 * BUILDS, effect changes, engine flag, grant, and authored conditional —
 * and a tool that knows about five of them reports the sixth as an
 * absence, confidently, with a number beside it.
 *
 * Each miss produced a false negative that read exactly like a finding.
 * The count went 4 → 3 → 1 as each route was added, and the last one was
 * caught only because apply-data-fixes.mjs REFUSED to overwrite a field
 * whose current value did not match what the fix expected — a guard
 * written for a different purpose entirely. Nothing in this tool caught
 * it. Before putting "NOTHING" in front of anybody, assume the list above
 * is still incomplete and go looking.
 *
 * A "code" result is still only a NAME MATCH. It proves the name reaches
 * live source; it does not prove the code does what the feat says. Use it
 * to narrow 436 down to a shortlist worth reading, not to close a feat.
 *
 * Usage: node tools/feat-evidence.mjs [--tier <name>] [--json]
 */

import fs from "node:fs";
import path from "node:path";
import * as acorn from "acorn";
import { ClassicLevel } from "classic-level";
import { findSourceFiles, SYSTEM_ROOT } from "./lib/sources.mjs";

/**
 * Tables whose KEYS are feat names the system builds rather than writes.
 *
 * DECLARED AND IMPORTED, never inferred from a filename pattern — the
 * project's standing rule, and it matters more here than usual: a
 * registry assembled by guessing which exports "look like" feat tables
 * would go stale the first time somebody named one differently, and it
 * would go stale SILENTLY, which is the failure this whole file exists
 * to prevent.
 *
 * Literal tables are listed too, not only computed ones. They cost
 * nothing (their names already match in code) and listing them makes
 * this an index of where feat names live rather than a patch for one
 * family. `verify-feat-evidence` holds every entry to being real.
 *
 * An import that FAILS is named in the output, never skipped quietly: a
 * table this tool could not read is a set of feats it is about to
 * misreport.
 */
export const COMPOSED_NAME_TABLES = Object.freeze([
  ["module/magic/caster-tier-feats.mjs", "CASTER_TIER_FEATS"],
  ["module/magic/wildshape-feats.mjs", "WILD_SHAPE_FORM_FEATS"],
  ["module/magic/wildshape-feats.mjs", "SHAPE_RESISTANCE_FEATS"],
  ["module/combat/reaction-feats.mjs", "REACTION_FEATS"],
  ["module/combat/save-advantage.mjs", "SAVE_ADVANTAGE_FEATS"],
  ["module/combat/save-advantage.mjs", "SUPERIOR_FEATS"],
  ["module/combat/action-feats.mjs", "ACTION_FEATS"],
  ["module/extra-uses.mjs", "EXTRA_USES_FEATS"],
  ["module/aligned.mjs", "ALIGNED_CONTROL_FEATS"],
  ["module/proficiencies.mjs", "PROFICIENCY_FEATS"]
]);

/**
 * Every feat name any registered table holds, lower-cased, plus whatever
 * could not be read.
 */
async function composedFeatNames() {
  const names = new Set();
  const unreadable = [];
  for (const [rel, exported] of COMPOSED_NAME_TABLES) {
    try {
      const module = await import(`file://${path.join(SYSTEM_ROOT, rel)}`);
      const table = module[exported];
      if (!table || typeof table !== "object") {
        unreadable.push(`${rel}#${exported} (no such export, or not an object)`);
        continue;
      }
      for (const key of Object.keys(table)) names.add(String(key).trim().toLowerCase());
    } catch (error) {
      unreadable.push(`${rel}#${exported} (${error.message})`);
    }
  }
  return { names, unreadable };
}

/** Flags that mark a note or a passive but carry no mechanism of their own. */
const MARKER_FLAGS = new Set(["featNote", "featPassive"]);

/**
 * Rules source with every comment blanked, and the comments separately.
 *
 * Blanked rather than deleted so nothing outside a comment can be joined
 * to its neighbour and produce a match that exists in neither.
 */
function splitCodeAndComments() {
  let code = "";
  let prose = "";
  const unparsed = [];
  for (const file of findSourceFiles(["module", "scripts"])) {
    const source = fs.readFileSync(file, "utf8");
    const comments = [];
    try {
      acorn.parse(source, { ecmaVersion: "latest", sourceType: "module", ranges: true, onComment: comments });
    } catch {
      // An unparseable file is NAMED, not silently treated as all-code.
      unparsed.push(file);
      code += `${source}\n`;
      continue;
    }
    let stripped = source;
    for (const c of comments.sort((a, b) => b.start - a.start)) {
      prose += `${source.slice(c.start, c.end)}\n`;
      stripped = stripped.slice(0, c.start) + " ".repeat(c.end - c.start) + stripped.slice(c.end);
    }
    code += `${stripped}\n`;
  }
  return { code: code.toLowerCase(), prose: prose.toLowerCase(), unparsed };
}

async function readFeats() {
  const dir = path.join(SYSTEM_ROOT, "packs", "feats");
  const db = new ClassicLevel(dir, { valueEncoding: "json" });
  await db.open();
  const items = new Map();
  const effects = new Map();
  try {
    for await (const [key, value] of db.iterator()) {
      if (key.startsWith("!items!") && !key.slice(7).includes("!")) {
        if (value?.system?.category) items.set(key.slice(7), value);
      } else if (key.startsWith("!items.effects!")) {
        const id = key.slice("!items.effects!".length).split(".")[0];
        if (!effects.has(id)) effects.set(id, []);
        effects.get(id).push(value);
      }
    }
  } finally {
    await db.close();
  }
  return { items, effects };
}

export async function analyseFeats() {
  const { code, prose, unparsed } = splitCodeAndComments();
  const { items, effects } = await readFeats();
  const { names: composed, unreadable } = await composedFeatNames();

  const rows = [];
  for (const [id, item] of items) {
    let changes = 0;
    let notes = 0;
    const mechFlags = new Set();
    for (const effect of effects.get(id) ?? []) {
      changes += (effect?.changes ?? []).length;
      const flags = effect?.flags?.["trg-prime"] ?? {};
      for (const key of Object.keys(flags)) if (!MARKER_FLAGS.has(key)) mechFlags.add(key);
      if (flags.featNote) notes++;
    }
    // AND ON THE ITEM (3.570.0). `conditionals` below was already read
    // from the item because effect flags were not enough to see it; the
    // same is true of every other mechanical flag a feat can carry.
    // Wild Stride and the Silvarni heritage hold
    // `ignoresDifficultTerrain` on the ITEM, and this function could not
    // see it — Wild Stride only escaped "note-only" because its name
    // happens to appear in code as well. Feather Step, carrying the same
    // kind of flag under a name nothing spells out, would have been
    // reported as unimplemented for ever.
    //
    // THE SAME SHAPE AS THE COMPOSED-NAMES MISS: a real automation route
    // this tool did not look down, reported for three releases as an
    // absence. `conditionals` stays excluded here because it is counted
    // on its own below and earns its own tier.
    const itemFlags = item?.flags?.["trg-prime"] ?? {};
    for (const key of Object.keys(itemFlags)) {
      if (key === "conditionals" || MARKER_FLAGS.has(key)) continue;
      mechFlags.add(key);
    }
    const name = item.name.toLowerCase();
    const inCode = code.includes(name);
    const inProse = prose.includes(name);
    const dataDriven = changes > 0 || mechFlags.size > 0;
    // Resolved from the matching compendium by grants-workflow.mjs. A
    // feat that hands over an ability is automated BY that ability, and
    // is the route Graham confirmed as the right one on 23 August.
    const grants = ["grantedAbilities", "grantedSpells", "grantedFeats"]
      .map((field) => String(item.system?.[field] ?? "").trim())
      .filter(Boolean);

    // Authored on the ITEM, not on an effect — which is why counting
    // effect flags was not enough to see them.
    const conditionals = Array.isArray(item?.flags?.["trg-prime"]?.conditionals)
      ? item.flags["trg-prime"].conditionals.length
      : 0;

    const inComposed = composed.has(name);

    let tier;
    if (grants.length) tier = "grants";
    else if (conditionals > 0) tier = "conditional";
    else if (inCode) tier = "code";
    // AFTER `code` and BEFORE `data`, deliberately. A feat whose name is
    // both written and built is simply wired, and saying so is more
    // useful than naming the rarer route; but a composed name is stronger
    // evidence than an effect's changes, because it means a lookup keyed
    // on that exact string is what the system consults.
    else if (inComposed) tier = "composed";
    else if (dataDriven) tier = "data";
    // NOTE-ONLY NOW MEANS ONE THING. Before 3.569.0 it meant both "a
    // deliberate printed reminder" and "built under a name I cannot
    // see", and twelve feats of the second kind were reported as the
    // first. Anything still discussed in comments is `unknown` instead.
    else if (notes > 0 && !inProse) tier = "note-only";
    else if (inProse) tier = "unknown";
    else tier = "NOTHING";

    rows.push({
      name: item.name,
      category: item.system.category,
      tier,
      inCode,
      inComposed,
      // Named in prose but absent from code: the shortlist that is worth
      // a human reading, because it is where a described-but-unbuilt rule
      // and a genuinely-flag-driven one look identical from here.
      proseOnly: !inCode && inProse,
      changes,
      mechFlags: [...mechFlags],
      grants,
      conditionals,
      notes
    });
  }
  rows.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  return { rows, unparsed, unreadable, composedCount: composed.size };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { rows, unparsed, unreadable, composedCount } = await analyseFeats();
  const wantTier = process.argv.includes("--tier") ? process.argv[process.argv.indexOf("--tier") + 1] : null;

  if (process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
  } else {
    // A TABLE THIS TOOL COULD NOT READ is a set of feats it is about to
    // misreport, so it is named before any number is printed.
    if (unreadable.length) {
      process.stderr.write(
        `feat-evidence: ${unreadable.length} registered name table(s) could not be read, so any\n` +
          `feat they hold will be reported as unimplemented:\n` +
          unreadable.map((f) => `  ${f}`).join("\n") + "\n\n"
      );
    }
    if (unparsed.length) {
      process.stderr.write(
        `feat-evidence: ${unparsed.length} source file(s) could not be parsed and were treated as\n` +
          `all-code, so a feat named only in their comments will read as wired:\n` +
          unparsed.map((f) => `  ${f}`).join("\n") + "\n\n"
      );
    }
    const shown = wantTier ? rows.filter((r) => r.tier === wantTier) : rows;
    if (wantTier) {
      for (const r of shown) {
        const extra = r.conditionals ? `  conditionals:${r.conditionals}` : r.grants.length ? `  grants:[${r.grants.join("; ")}]` : r.mechFlags.length ? `  flags:[${r.mechFlags.join(", ")}]` : r.proseOnly ? "  (named in comments only)" : "";
        process.stdout.write(`  ${r.category.padEnd(9)} ${r.name}${extra}\n`);
      }
    }
    const byCategory = {};
    for (const r of rows) {
      byCategory[r.category] ??= {};
      byCategory[r.category][r.tier] = (byCategory[r.category][r.tier] ?? 0) + 1;
    }
    const totals = {};
    for (const r of rows) totals[r.tier] = (totals[r.tier] ?? 0) + 1;
    process.stdout.write(`\nfeat-evidence: ${rows.length} feats\n`);
    for (const [cat, tiers] of Object.entries(byCategory)) {
      process.stdout.write(`  ${cat.padEnd(10)} ${Object.entries(tiers).map(([t, n]) => `${t}:${n}`).join("  ")}\n`);
    }
    process.stdout.write(`  ${"TOTAL".padEnd(10)} ${Object.entries(totals).map(([t, n]) => `${t}:${n}`).join("  ")}\n`);
    process.stdout.write(
      `\nThis measures MECHANISM, not sufficiency. A "code" result is a name match, not proof\n` +
        `the code does what the feat says. See this file's header before quoting any of it.\n` +
        `${composedCount} feat names were read from ${COMPOSED_NAME_TABLES.length} registered lookup tables. A feat built\n` +
        `under a name composed OUTSIDE those tables would still read as unimplemented here —\n` +
        `that is this tool's remaining blind spot, and it is why "unknown" exists.\n`
    );
  }
}
