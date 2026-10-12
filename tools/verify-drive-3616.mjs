#!/usr/bin/env node
/**
 * verify-drive-3616 — the 3.616.0 drive (3.616.1).
 *
 * NEW at 3.616.1. The drive is claude/live-testing-report-3.616.0.md;
 * Graham ruled its three questions on 3 October 2026.
 *
 *   A  F1  Extend's "×2" lengthens the effect, not only the card
 *   B  R1  an item that explodes is destroyed
 *   C  R2  a charged item's weapon form is its base weapon for proficiency —
 *          "Wizards are proficient with the staff and dagger"
 *   D  R3  a rod's share of a spell's cost is named on the headline
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { parseSpellDuration } from "../module/magic/effect-duration.mjs";
import { warpedDurationText } from "../module/magic/active-spells.mjs";
import { proficiencyOf, proficiencyProfile } from "../module/proficiency-rules.mjs";
import { weaponFormBaseOf, WEAPON_FORM_FLAG } from "../module/charged-weapon-forms.mjs";
import { castResultHeadline } from "../module/magic/cast-result-line.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const CAST = strip(read("module", "magic", "cast-workflow.mjs"));
const DEPLETE = strip(read("module", "magic-items-workflow.mjs"));
const ATTACK = strip(read("module", "combat", "attack-workflow.mjs"));
const FORMSF = strip(read("module", "charged-weapon-forms-workflow.mjs"));

/* A — F1 */
{
  const plain = parseSpellDuration("1 minute");
  const extended = parseSpellDuration("1 minute ×2 (Extended)");
  ok("A1 F1 — an Extended minute lasts two", extended?.seconds === 120 && extended?.rounds === 20 && plain?.seconds === 60,
    JSON.stringify(extended));
  ok("A1b and so does a dismissible one, with its (D) carried",
    parseSpellDuration(warpedDurationText("1 hour (D)", { durationText: "1 hour ×2 (Extended)" }))?.seconds === 7200);
  ok("A1c a printed duration without the sign is untouched", parseSpellDuration("10 minutes")?.seconds === 600
    && parseSpellDuration("8 hours")?.rounds === 4800);
  ok("A1d Extend still writes the sign the parser reads", CAST.includes("warpMods.durationText = `${spellData.duration} ×2 (Extended)`;"));
}

/* B — R1 */
{
  ok("B1 R1 — an item that explodes is destroyed, as one that crumbles",
    DEPLETE.includes("if (crumbles || explosion) await item.delete();")
    && DEPLETE.indexOf("if (explosion) await explodeItem(actor, item, explosion);") < DEPLETE.indexOf("if (crumbles || explosion) await item.delete();"));
  ok("B1b and the card says so", DEPLETE.includes("is destroyed in the blast."));
}

/* C — R2 */
{
  const wizard = proficiencyProfile({ items: [{ type: "class", name: "Wizard", system: {} }] });
  const form = (base, signature) => ({
    type: "weapon", name: `Staff of Fire (${base})`,
    system: { category: "Simple", group: "Club" },
    flags: { "trg-prime": { [WEAPON_FORM_FLAG]: signature ? { itemId: "sf", signature } : { itemId: "sf", base, signature: `sf|${base.toLowerCase()}|expert||potency i` } } }
  });
  ok("C1 R2 — a Wizard is proficient with a staff's weapon form", proficiencyOf(wizard, form("Staff")).proficient === true,
    proficiencyOf(wizard, form("Staff")).why);
  ok("C1b a form made at 3.616.0 (base only in its signature) too",
    proficiencyOf(wizard, form("Staff", "sf|staff|expert||potency i")).proficient === true && weaponFormBaseOf(form("Staff", "sf|staff|expert||")) === "staff");
  ok("C1c but not with a light mace's", proficiencyOf(wizard, form("Light Mace")).proficient === false);
  ok("C1d the plain Staff and Dagger are as they were",
    proficiencyOf(wizard, { type: "weapon", name: "Staff", system: { category: "Simple", group: "Club" } }).proficient
    && proficiencyOf(wizard, { type: "weapon", name: "Dagger", system: { category: "Simple", group: "Knife" } }).proficient);
  ok("C2 the attack asks with the weapon's flags",
    ATTACK.includes('{ type: "weapon", name: weapon.name, system: weaponData, flags: weapon.flags }')
    && /name: weapon\.name,\s*flags: weapon\.flags,/.test(ATTACK));
  ok("C3 new forms carry their base", FORMSF.includes("itemId: grant.itemId, base: grant.base, signature: weaponFormSignature(grant)"));
}

/* D — R3 */
{
  ok("D1 R3 — the rod's share is named",
    /4 PP spent \(3 from Rod of the Magi\)/.test(castResultHeadline({ cast: true, ppSpent: 4, degree: "success", rodPaid: 3, rodName: "Rod of the Magi" })));
  ok("D1b and nothing is added when the caster paid it all",
    !/from/.test(castResultHeadline({ cast: true, ppSpent: 4, degree: "success" })));
  ok("D2 the cast hands the headline the rod's share",
    CAST.includes('const headlineFacts = { cast: outcome.cast, isInnate, ppSpent, degree, rodPaid, rodName: rodSource?.name ?? "" };'));
}

if (failures.length) {
  console.log(`verify-drive-3616: ${checks} checks\n\n${failures.length} FAILED:`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
console.log(`verify-drive-3616: OK — ${checks} checks. Extend's doubling, the exploded item, the Wizard's staff and the rod's share.`);
