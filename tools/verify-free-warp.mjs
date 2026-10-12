#!/usr/bin/env node
/**
 * verify-free-warp — warping that costs nothing, and who it says waived it.
 *
 * NEW at 3.447.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * TWO SOURCES, ONE CHANNEL.
 *
 * Powerful Illusion (Wizard, 3.332.0): "any Shadow spell that you cast
 * may have a 1 PP warping option applied to it for free."
 * Healer's Grace (PP 1, 3.447.0): "whenever you cast a spell that
 * possesses the Healing Trait, it is considered to be warped 2 PP higher
 * at no extra PP cost."
 *
 * NOTHING NEW WAS BUILT FOR THE SPELL. `warpFreeSchool` already carried
 * this rule, and its test is `spellTraits.includes(...)` — scoped by
 * TRAIT despite the name — so the spell grants the flag the feat does.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION C IS THE DEFECT THE SPELL SURFACED. The channel's card note
 * read "Powerful Illusion" for EVERY source, hard-coded, so a Cleric
 * under Healer's Grace would have been told a Wizard feat waived their
 * PP. The same class as the card that said "cone" over a line: a
 * sentence asserting something it does not know.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { applyFreeWarp, warpedBonusValue } from "../module/magic/spell-warp.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const cast = read("module", "magic", "cast-workflow.mjs");
const effects = read("module", "magic", "spell-effects.mjs");
const feats = read("module", "feats-workflow.mjs");
const strip = (s) => String(s)
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

/* ================================================================== *
 * A. FREE IS FREE — the distinction from a discount
 * ================================================================== */

ok("A1 a free warp waives what it covers",
  applyFreeWarp(3, 0, 2).total === 1 && applyFreeWarp(3, 0, 2).waived === 2);
// THE WHOLE POINT, and what separates this from a heritage discount:
// "a discount makes warping cheaper but never free."
ok("A2 it can reach zero, unlike a discount",
  applyFreeWarp(2, 0, 2).total === 0 && applyFreeWarp(1, 0, 2).total === 0);
ok("A3 it never waives more than was spent",
  applyFreeWarp(1, 0, 5).waived === 1);
// THE METAMAGIC BOX IS NOT WARPING. `rawPP` is spent on feats, not on any
// warping option, so a free-warp credit must not reach it.
ok("A4 the raw Metamagic PP is held out of it",
  applyFreeWarp(5, 3, 2).waived === 2 && applyFreeWarp(3, 3, 2).waived === 0,
  "a cast that warped nothing but paid 3 Metamagic PP must keep paying it");
ok("A5 no credit waives nothing", applyFreeWarp(3, 0, 0).waived === 0);
ok("A6 rubbish does not throw", applyFreeWarp().total === 0);

/* ================================================================== *
 * B. THE SPELL RIDES THE FEAT'S CHANNEL
 * ================================================================== */

const castClean = strip(cast);
const fxClean = strip(effects);
// SLICED TO THE CASE, not searched across the file. Three of this pair's
// first mutations SURVIVED because the strings they broke also appear in
// the neighbouring `bonus` case and the warp-DISCOUNT block above — the
// same trap that hid a mutation behind a duplicate `filter((e) =>
// !e.disabled)` two releases ago. A claim about one block has to be
// matched inside that block.
const freeWarpCase = (() => {
  const from = fxClean.indexOf('case "freeWarp":');
  const to = fxClean.indexOf('case "ward":', from);
  return from === -1 ? "" : fxClean.slice(from, to === -1 ? undefined : to);
})();
ok("B0 the freeWarp case was found", freeWarpCase.length > 0);
// And the cast's own FREE block, distinct from the DISCOUNT block above it.
const freeBlock = (() => {
  const from = castClean.indexOf("const freeWarpSources =");
  const to = castClean.indexOf("const warpDiscount =", from);
  return from === -1 ? "" : castClean.slice(from, to === -1 ? undefined : to);
})();
ok("B0b the cast's free-warp block was found", freeBlock.length > 0);
ok("B1 the channel matches on the SPELL'S OWN TRAITS",
  freeBlock.includes("spellTraits.includes(String(scoped.school).trim().toLowerCase())"),
  "scoped by trait despite the field's name — which is why the spell needed no new axis");
ok("B2 a zero-value grant is not a source",
  freeBlock.includes("(Number(scoped.value) || 0) > 0"),
  "otherwise an empty grant would be named on the card as having waived nothing");
ok("B3 disabled effects grant nothing",
  /\.filter\(\(e\) => !e\.disabled\)/.test(freeBlock),
  "the discount block above has its own identical filter — this must match THIS one");
ok("B4 the credit is the sum of every live source",
  freeBlock.includes("freeWarpSources.reduce((sum, { scoped }) => sum + (Number(scoped.value) || 0), 0)"),
  "a Wizard-Cleric under both should get both");

ok("B5 the spell grants the same flag the feat does",
  freeWarpCase.includes("warpFreeSchool: { school: trait, value: free, label: spell.name }"));
ok("B6 and places no sheet change for it",
  /changes: \[\],\s*flags\s*$/m.test(fxClean) || fxClean.includes("changes: [],"),
  "there is no sheet field for \"your next warp is cheaper\"");
// LOUD, not silent — the position `ward` and `marker` already take.
ok("B7 a grant naming no trait or no value is refused out loud",
  freeWarpCase.includes("if (!trait || !free) {") && freeWarpCase.includes("declares a free warp with no trait or no value — nothing applied"),
  "applying it would either cover everything or nothing, and both are worse than saying so");
// WARPABLE, through the one shared rule.
ok("B8 the granted amount is warpable",
  freeWarpCase.includes("warpedBonusValue(Number(effect.value) || 0, warpBonus, warpBonusMax)"));
ok("B8b and its cap is the total, matching Bless",
  warpedBonusValue(2, 1, 4) === 3 && warpedBonusValue(2, 9, 4) === 4,
  "\"+1 (max +4)\" on a base of 2 tops out at 4, not at 6");

/* ================================================================== *
 * C. WHO THE CARD SAYS WAIVED IT
 *
 * THE DEFECT. This note named Powerful Illusion for every source.
 * ================================================================== */

ok("C1 the note names the grant rather than a fixed feat",
  castClean.includes("`-${free.waived} PP: ${who} (free, no minimum)`"));
ok("C2 and no longer hard-codes Powerful Illusion",
  !castClean.includes("PP: Powerful Illusion (free, no minimum)"),
  "a Cleric under Healer's Grace was told a Wizard feat waived their PP");
ok("C3 the name comes from the grant, falling back to the effect",
  castClean.includes("String(scoped.label ?? effect.name ?? \"\").trim()"));
ok("C4 and to a neutral phrase rather than a wrong one",
  castClean.includes('"a free-warp effect"'));
ok("C5 Powerful Illusion labels its own grant",
  strip(feats).includes('warpFreeSchool: { ...POWERFUL_ILLUSION, label: "Powerful Illusion" }'),
  "the feat must name itself now that the channel no longer names it for everyone");

/* ================================================================== *
 * D. THE PACK
 * ================================================================== */

const { ClassicLevel } = await import("classic-level");
const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
await db.open();
const spells = [];
try {
  for await (const [k, v] of db.iterator()) {
    if (k.startsWith("!items!") && v?.type === "spell") spells.push(v);
  }
} finally { await db.close(); }

ok("D0 the spells pack was read", spells.length > 600, `only ${spells.length} found`);

const grace = spells.find((s) => /^healer.s grace$/i.test(s.name));
const row = (grace?.system?.effects ?? []).find((e) => e.kind === "freeWarp");
ok("D1 Healer's Grace grants a free warp", Boolean(row));
ok("D1b of 2 PP, on the Healing trait", row?.value === 2 && row?.trait === "healing");
ok("D1c to the caster", row?.target === "self",
  "the spell has no Targets line and its text is about the caster's own words");
ok("D2 its warp rides the shared keys",
  grace?.system?.warps?.[0]?.mods?.bonusValue === 1
  && grace?.system?.warps?.[0]?.mods?.bonusMax === 4);

// THE GRANT HAS SOMETHING TO REACH. A trait nothing carries would be a
// spell that does nothing, authored as though it did.
const healing = spells.filter((s) => /\bhealing\b/i.test(String(s.system?.traits ?? "")));
ok("D3 the Healing trait is carried by real spells", healing.length >= 20,
  `${healing.length} found`);

// EVERY freeWarp ROW IN THE PACK NAMES A TRAIT SOMETHING CARRIES — the
// cross-check that stops a typo becoming a silent no-op.
const stray = [];
for (const s of spells) {
  for (const e of (s.system?.effects ?? [])) {
    if (e?.kind !== "freeWarp") continue;
    const t = String(e.trait ?? "").trim().toLowerCase();
    if (!t) { stray.push(`${s.name}: no trait`); continue; }
    const carried = spells.some((x) => new RegExp(`\\b${t}\\b`, "i").test(String(x.system?.traits ?? "")));
    if (!carried) stray.push(`${s.name}: nothing carries "${t}"`);
  }
}
ok("D4 no free-warp row names a trait nothing carries", stray.length === 0, stray.join("; "));

/* ================================================================== */

if (failures.length) {
  process.stderr.write(`verify-free-warp: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  - ${f}\n`);
  process.exit(1);
}
process.stdout.write(
  `verify-free-warp: OK — ${checks} checks. Two sources, one channel, `
  + `and the card names the one that paid.\n`);
