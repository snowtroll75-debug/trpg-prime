#!/usr/bin/env node
/**
 * mutate-chapter10-281-290 — can the pages 281-290 checks fail?
 *
 * NEW at 3.590.0. SURVIVED and an unmatched anchor are both failures.
 *
 * ─────────────────────────────────────────────────────────────────────
 * FIVE OF THIS BLOCK'S SIX DEFECTS WERE MINE, WRITTEN AND CAUGHT THE
 * SAME AFTERNOON. So the mutations that matter most simply put my own
 * first drafts back:
 *
 *   A1  Keen Edge as `{kind:"trait", traits:"keen"}` — applies cleanly,
 *       prints correctly, changes no roll.
 *   C1  the numeric duration matcher reading the FOUR out of "1d4".
 *   G7  the defence case falling through in silence.
 *   J1  Goodberry described rather than copied.
 *   J4  the berry with no clock.
 *
 * And F3 reverses the one that was not mine: the start-of-turn recurring
 * ladder that was accepted, recorded, announced on the card, and never
 * rolled. Its mutation is the call itself — because the vocabulary entry
 * SURVIVING is exactly what the defect looked like.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION P MUTATES THE PACK, NOT THE CODE, for the checks whose subject
 * is an authored row. A check that reads a pack field must be shown to
 * fail when that field is wrong, or it is asserting that the file loaded.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...parts) => path.join(SYSTEM_ROOT, "module", ...parts);
const EFFECTS = at("magic", "spell-effects.mjs");
const TRAIT = at("magic", "weapon-trait.mjs");
const ATTACK = at("combat", "attack-workflow.mjs");
const DURATION = at("magic", "effect-duration.mjs");
const TIMING = at("magic", "condition-timing-rules.mjs");
const CONJURED = at("magic", "conjured-item.mjs");
const CONJUREDWF = at("magic", "conjured-item-workflow.mjs");
const LADDER = at("magic", "save-ladder.mjs");
const LADDERWF = at("magic", "recurring-ladder-workflow.mjs");
const COMBAT = at("documents", "combat.mjs");
const LIGHT = at("magic", "light-shift.mjs");
const KINDS = at("magic", "effect-kinds.mjs");
const SELFEND = path.join(SYSTEM_ROOT, "tools", "lib", "self-ending-conditions.mjs");
const VERIFY = path.join(SYSTEM_ROOT, "tools", "verify-chapter10-281-290.mjs");

const MUTATIONS = [
  /* ── A: the weapon trait ───────────────────────────────────────── */
  { file: KINDS, name: "A: weaponTrait is authored but never declared handled",
    from: `  "weaponTrait",`, to: ``, breaks: "A1" },
  { file: ATTACK, name: "A THE ORIGINAL DEFECT: the attack stops asking the weapon",
    from: `    weaponHasSpellTrait(actor.appliedEffects ?? actor.effects ?? [], weapon?.id ?? "", "keen") ||`,
    to: ``, breaks: "A3" },
  { file: ATTACK, name: "A: keen gets a SECOND answer, to be kept in step by hand",
    from: `  const keen = /\\bkeen\\b/i.test(String(weaponData.traits ?? "")) ||`,
    to: `  const spellKeen = weaponHasSpellTrait(actor.appliedEffects ?? actor.effects ?? [], weapon?.id ?? "", "keen");
  const keen = spellKeen || /\\bkeen\\b/i.test(String(weaponData.traits ?? "")) ||`,
    breaks: "A3b" },
  { file: EFFECTS, name: "A: the chosen weapon ids are never stamped onto the spec",
    from: `          traitSpec.weaponIds = traitWeapons;`, to: `          ;`, breaks: "A4" },
  { file: EFFECTS, name: "A: the spell asks \"which weapon\" its own way",
    from: `          const { promptRiderWeapon: promptTraitWeapon } = await import("./strike-riders-workflow.mjs");`,
    to: `          const promptTraitWeapon = async (t) => t.items?.find?.((i) => i.type === "weapon")?.id ?? null;`,
    breaks: "A5" },
  { file: EFFECTS, name: "A: a trait nothing reads is applied in silence",
    from: `          const strayTraits = unreadableWeaponTraits(traitSpec);`,
    to: `          const strayTraits = [];`, breaks: "A6" },
  { file: TRAIT, name: "A: a comma string is no longer split",
    from: `  const wanted = (Array.isArray(raw.traits) ? raw.traits : text(raw.traits).split(","))`,
    to: `  const wanted = (Array.isArray(raw.traits) ? raw.traits : [raw.traits])`, breaks: "A8" },
  { file: TRAIT, name: "A: the polymorph kind is accepted here too",
    from: `  if (text(raw.kind) !== "weaponTrait") return null;`, to: `  ;`, breaks: "A9" },
  { file: TRAIT, name: "A: a row with no traits is accepted",
    from: `  if (!wanted.length) return null;`, to: `  ;`, breaks: "A10" },
  { file: TRAIT, name: "A: weapons stops floring at one",
    from: `    weapons: Math.max(1, Math.trunc(Number(raw.weapons) || 1))`,
    to: `    weapons: Math.trunc(Number(raw.weapons) || 1)`, breaks: "A11" },
  { file: TRAIT, name: "A: razor becomes grantable, and grants nothing",
    from: `export const GRANTABLE_WEAPON_TRAITS = Object.freeze(["keen"]);`,
    to: `export const GRANTABLE_WEAPON_TRAITS = Object.freeze(["keen", "razor"]);`, breaks: "A12" },
  { file: TRAIT, name: "A THE WILDCARD: any weapon carries any spell's trait",
    from: `    if (!ids.includes(id)) continue;`, to: `    ;`, breaks: "A15" },
  { file: TRAIT, name: "A: a suppressed enchantment is still keen",
    from: `    if (effect?.disabled) continue;`, to: `    ;`, breaks: "A16" },
  { file: TRAIT, name: "A THE EMPTY ID: \"\" matches every weapon",
    from: `  if (!id || !wanted) return false;`, to: `  ;`, breaks: "A17" },
  { file: TRAIT, name: "A: a spec with no weaponIds arms the whole armoury",
    from: `    const ids = Array.isArray(spec.weaponIds) ? spec.weaponIds.map(text) : [];`,
    to: `    const ids = Array.isArray(spec.weaponIds) ? spec.weaponIds.map(text) : [id];`,
    breaks: "A18" },
  { file: TRAIT, name: "A: the trait asked about stops being checked",
    from: `    if (traits.includes(wanted)) return true;`, to: `    return true;`, breaks: "A19" },

  /* ── C: a rolled duration is not a number ──────────────────────── */
  { file: DURATION, name: "C THE ORIGINAL DEFECT: \"1d4 minutes\" reads the FOUR again",
    from: `  if (/\\d+\\s*d\\s*\\d+/i.test(t)) return null;`, to: `  ;`, breaks: "C1" },
  { file: DURATION, name: "C: only a tight spelling of dice is refused",
    from: `  if (/\\d+\\s*d\\s*\\d+/i.test(t)) return null;`,
    to: `  if (/\\d+d\\d+/.test(t)) return null;`, breaks: "C4" },
  { file: DURATION, name: "C THE OVERCORRECTION: every numeric duration is refused",
    from: `  const m = t.match(/(\\d+)\\s*(rounds?|minutes?|mins?|hours?|hrs?|days?)/);`,
    to: `  const m = null;`, breaks: "C5" },

  /* ── D: the margin-scaled length ───────────────────────────────── */
  { file: TIMING, name: "D THE SIGN: the margin is read as if a failure were positive",
    from: `  const failedBy = Math.max(0, -Math.round(m));`, to: `  const failedBy = Math.max(0, Math.round(m));`,
    breaks: "D1" },
  { file: TIMING, name: "D: a failure by one buys nothing",
    from: `  return Math.max(1, Math.floor(failedBy / step));`, to: `  return Math.floor(failedBy / step);`,
    breaks: "D3" },
  { file: TIMING, name: "D THE Number(null): an unmeasured margin becomes a margin of zero",
    from: `  if (margin === null || margin === undefined || !Number.isFinite(m)) return null;`,
    to: `  if (!Number.isFinite(m)) return null;`, breaks: "D4" },
  // RE-ANCHORED AT 3.591.0: see mutate-condition-clocks — `valueFromMargin`
  // opens with the same two lines.
  { file: TIMING, name: "D: a step of zero divides by nothing",
    from: `export function roundsFromMargin(margin, per) {
  const step = Math.trunc(Number(per) || 0);
  if (step < 1) return null;`,
    to: `export function roundsFromMargin(margin, per) {
  const step = Math.trunc(Number(per) || 0);`, breaks: "D5" },
  { file: TIMING, name: "D: a rolled length of zero is a length of zero",
    from: `  const n = Math.max(1, Math.trunc(Number(rolled) || 0));`,
    to: `  const n = Math.trunc(Number(rolled) || 0);`, breaks: "D9" },

  /* ── F: the ladder whose save is not at the cast ───────────────── */
  { file: COMBAT, name: "F THE MISSING DRIVER: the start of a turn stops rolling its ladders",
    from: `    for (const burn of await applyRecurringLadders(
      actor, combatant.token?.object ?? null, "startOfTurn")) {
      lines.push(TRGCombat.#chatLine(burn));
    }`, to: `    ;`, breaks: "F3" },
  { file: COMBAT, name: "F: the start of a turn rolls the END-of-turn ladders",
    from: `      actor, combatant.token?.object ?? null, "startOfTurn")) {`,
    to: `      actor, combatant.token?.object ?? null, "endOfTurn")) {`, breaks: "F3" },
  { file: at("magic", "area-region-life.mjs"),
    name: "F THE DELETED REGION: a recurring ladder stops claiming the Region it is written on",
    from: `    || rowClaimsForRecurringLadder(row));`, to: `  );`, breaks: "F3e" },
  { file: at("magic", "area-region-life.mjs"),
    name: "F: EVERY saveLadder claims, so six plain ones litter a Region per cast",
    from: `  return String(row?.kind ?? "").toLowerCase() === "saveladder" && Boolean(row?.recurring);`,
    to: `  return String(row?.kind ?? "").toLowerCase() === "saveladder";`, breaks: "F3f" },
  { file: at("magic", "area-region-life.mjs"),
    name: "F: a refunded cast keeps the Region it never earned",
    from: `  if (refunded) return true;`, to: `  ;`, breaks: "F3h" },
  { file: LADDERWF, name: "F: one sweep fires both boundaries at once",
    from: `      if (spec.on !== moment) continue;`, to: `      ;`, breaks: "F3c" },
  { file: LADDER, name: "F: a recurring ladder's moment is ignored",
    from: `  const when = text(raw.on) || "endOfTurn";`, to: `  const when = "endOfTurn";`, breaks: "F2d" },

  /* ── G: the silent defence row ─────────────────────────────────── */
  { file: EFFECTS, name: "G THE SILENT NOTHING: a malformed defence row says nothing again",
    from: `          lines.push(line(
            \`<em>\${spell.name} declares a defence of "\${effect.field ?? "(none)"}", \`
            + \`which is not one of immunity, resistance or weakness &mdash; nothing applied.</em>\`));
          break;`,
    to: `          break;`, breaks: "G7" },
  { file: EFFECTS, name: "G: the refusal is printed even when the row worked",
    from: `            lines.push(line(\`\${target.name}: <strong>\${described}</strong>\${durationText}.\`));
            break;
          }`,
    to: `            lines.push(line(\`\${target.name}: <strong>\${described}</strong>\${durationText}.\`));
          }`,
    breaks: "G7" },

  /* ── J: the berry and its clock ────────────────────────────────── */
  { file: CONJURED, name: "J: the row's quantity is ignored and one is assumed",
    from: `    quantity: Math.max(1, Math.trunc(Number(raw.quantity) || 1)),`, to: `    quantity: 1,`,
    breaks: "J1d" },
  { file: EFFECTS, name: "J THE PERMANENT BERRY: a conjured item goes back to having no clock",
    // RE-ANCHORED AT 3.594.0: the call gained a `stamp` argument for the
    // Power Crystal's points, and wrapped over three lines.
    from: `          const made = await conjureItemOnto(target, spec, {
            castId, expires: conjureExpires, stamp: crystalStamp
          });`,
    to: `          const made = await conjureItemOnto(target, spec);`, breaks: "J4" },
  { file: EFFECTS, name: "J: every conjured item expires, and Bless Water's flask vanishes",
    from: `          const conjureExpires = parsedDuration !== null && !parsedDuration.permanent;`,
    to: `          const conjureExpires = true;`, breaks: "J4b" },
  { file: EFFECTS, name: "J: the companion effect that carries the time is never made",
    from: `            await createEffectsOn(target, [ciData]);`, to: `            ;`, breaks: "J4c" },
  { file: CONJUREDWF, name: "J: the item is never stamped, so no sweep will take it",
    from: `      data.flags[SYSTEM_ID].endsWithSpell = true;`, to: `      ;`, breaks: "J4d" },

  /* ── K: the remaining rails ────────────────────────────────────── */
  { file: LIGHT, name: "K: every circle follows its target",
    from: `    follows: raw.follows !== false,`, to: `    follows: true,`, breaks: "K3d" },
  { file: EFFECTS, name: "K: dr stops being a bonus slot and lands nowhere",
    from: `  "attack", "defence", "initiative", "dr",`,
    to: `  "attack", "defence", "initiative",`, breaks: "G5b" },
  { file: EFFECTS, name: "K THE OLD HOLE: an unknown slot gets a path-shaped string again",
    from: `  return COMBAT_BONUS_SLOTS.has(slot) ? \`system.combat.\${slot}\` : null;`,
    to: `  return \`system.combat.\${slot}\`;`, breaks: "K2c" },
  { file: EFFECTS, name: "K: spellcraft goes back to being pooled where it is not",
    from: `  if (slot === "spellcraft") return "system.magic.spellcraft";`, to: `  ;`, breaks: "K2d" },

  /* ── L: the shared self-ending map ─────────────────────────────── */
  { file: SELFEND, name: "L: stunned stops ending itself, and the per-block census notices",
    from: `  ["stunned", "spent as AP and reduced at the start of its owner's turn (TRGCombat._onStartTurn)"],`,
    to: ``, breaks: "L5" }
];

/*
 * PACK MUTATIONS — the ones that can only bite an AUTHORED ROW.
 *
 * SEVEN MUTATIONS STARTED LIFE IN THE LIST ABOVE AND SURVIVED, every one
 * for the same reason: they loosened a NORMALISER while the pack row was
 * still correct, so nothing downstream changed. `normaliseConjuredItem`
 * accepting `name` as well as `itemName` cannot be observed by a row that
 * carries `itemName`; `normaliseLightShift` defaulting a missing radius
 * cannot be observed by a row that prints 20.
 *
 * THAT IS THE DIFFERENCE BETWEEN A CHECK ABOUT CODE AND A CHECK ABOUT
 * DATA, and this block's checks are mostly the second kind — five of its
 * six defects were authored rows, not broken functions. So the row is
 * what gets mutated: one field, one spell, restored afterwards whatever
 * happens.
 *
 * `mutate` receives the spell's `system` and changes it in place.
 */
const PACK_MUTATIONS = [
  { spell: "Goodberry", name: "P: the berry is described instead of named, as it was authored first",
    mutate: (sy) => {
      const row = sy.effects.find((e) => e.kind === "conjureItem");
      delete row.itemName;
      row.name = "Goodberry";
    }, breaks: "J1" },
  { spell: "Goodberry", name: "P: the berry is conjured from a pack no spell may reach",
    mutate: (sy) => { sy.effects.find((e) => e.kind === "conjureItem").pack = "bestiary"; },
    breaks: "J1c" },
  { pack: "consumables", item: "Goodberry",
    name: "P: the berry's id goes back to seventeen characters",
    mutate: (doc) => { doc._id = "trgGoodberry00001"; }, breaks: "J2c" },
  { spell: "Goodberry", name: "P: the row names a berry that is not in the pack",
    mutate: (sy) => { sy.effects.find((e) => e.kind === "conjureItem").itemName = "Goodberrie"; },
    breaks: "J2" },
  { spell: "Goodberry", name: "P: the spell becomes instantaneous, and the berries permanent",
    mutate: (sy) => { sy.duration = ""; }, breaks: "J4f" },
  { spell: "Bless Water", name: "P: Holy Water gains a duration, and the flask starts expiring",
    mutate: (sy) => { sy.duration = "10 minutes"; }, breaks: "J4e" },
  { spell: "Incendiary Cloud", name: "P THE MOMENT: the cloud burns at the END of a turn instead",
    mutate: (sy) => { sy.effects.find((e) => e.kind === "saveLadder").recurring.on = "endOfTurn"; },
    breaks: "F2d" },
  { spell: "Incendiary Cloud", name: "P: the recurring ladder forgets to name its damage",
    mutate: (sy) => { delete sy.effects.find((e) => e.kind === "saveLadder").recurring.damageType; },
    breaks: "F2c" },
  { spell: "Incendiary Cloud", name: "P: its Critical rung becomes harmless, as most spells' are",
    mutate: (sy) => { sy.effects.find((e) => e.kind === "saveLadder").recurring.ladder.critical = ""; },
    breaks: "F2g" },
  { spell: "Incendiary Cloud", name: "P: a rung's dice stop parsing",
    mutate: (sy) => { sy.effects.find((e) => e.kind === "saveLadder").recurring.ladder.failure = "some d6"; },
    breaks: "F2c" },
  { spell: "Incendiary Cloud", name: "P THE DOUBLE SAVE: it gains a cast-time ladder as well",
    mutate: (sy) => {
      const row = sy.effects.find((e) => e.kind === "saveLadder");
      row.damageType = "fire";
      row.ladder = { ...row.recurring.ladder };
    }, breaks: "F2b" },
  { spell: "Inner Sanctum", name: "P: the light circle loses the radius it needs to exist",
    mutate: (sy) => { delete sy.effects.find((e) => e.kind === "lightShift").radiusFeet; },
    breaks: "K3" },
  { spell: "Inner Sanctum", name: "P: the sanctum's glow starts trailing the caster",
    mutate: (sy) => { sy.effects.find((e) => e.kind === "lightShift").follows = true; },
    breaks: "K3d" },
  { spell: "Inner Sanctum", name: "P: the ward becomes untyped rather than status",
    mutate: (sy) => { sy.effects.find((e) => e.kind === "conditional").grants[0].value = 3; },
    breaks: "K4" },
  { spell: "Keen Edge", name: "P THE ORIGINAL DEFECT: keen goes back onto the CREATURE",
    mutate: (sy) => {
      const i = sy.effects.findIndex((e) => e.kind === "weaponTrait");
      sy.effects[i] = { kind: "trait", target: "targets", traits: "keen" };
    }, breaks: "B1" },
  { spell: "Keen Edge", name: "P: the weapon gains razor, which nothing on a weapon reads",
    mutate: (sy) => { sy.effects.find((e) => e.kind === "weaponTrait").traits = ["razor"]; },
    breaks: "B1b" },
  { spell: "Jolts", name: "P: the header loses the word \"basic\", and a success takes full damage",
    mutate: (sy) => { sy.defence = "Will"; }, breaks: "E2" },
  { spell: "Jolts", name: "P THE FLAT ROW: its stun applies on every failing degree",
    mutate: (sy) => { delete sy.effects.find((e) => e.kind === "condition").onSave; }, breaks: "E2d" },
  { spell: "Holy Shout", name: "P: the failure rung stops scaling with the margin",
    mutate: (sy) => {
      delete sy.effects.filter((e) => e.kind === "condition")
        .find((e) => (e.onSave ?? []).includes("failure")).roundsPerMargin;
    }, breaks: "E4d" },
  { spell: "Holy Shout", name: "P: a margin-scaled rung is gated onto a SUCCESS, where it floors at one",
    mutate: (sy) => {
      sy.effects.filter((e) => e.kind === "condition")
        .find((e) => (e.onSave ?? []).includes("failure")).onSave = ["success", "failure"];
    }, breaks: "E4g" },
  { spell: "Holy Shout", name: "P: the fumble rung is stunned again rather than unconscious",
    mutate: (sy) => {
      sy.effects.filter((e) => e.kind === "condition")
        .find((e) => (e.onSave ?? []).includes("fumble")).condition = "stunned";
    }, breaks: "E4f" },
  { spell: "Gust", name: "P: the save-gated terrain row comes back",
    mutate: (sy) => {
      sy.effects.push({ kind: "difficultTerrain", label: "Gust", target: "area", onSave: ["partial"] });
    }, breaks: "E5c" },
  { spell: "Gust", name: "P: a critical success is knocked prone too",
    mutate: (sy) => {
      sy.effects.find((e) => e.kind === "condition").onSave = ["critical", "failure", "fumble"];
    }, breaks: "E5" },
  { spell: "Iron Body", name: "P THE SILENT ROW: the DR goes back to being a defence field",
    mutate: (sy) => {
      const i = sy.effects.findIndex((e) => e.kind === "bonus" && e.slot === "dr");
      sy.effects[i] = { kind: "defence", target: "self", field: "dr", value: "8" };
    }, breaks: "G5" },
  { spell: "Gaseous Form", name: "P: it stops being immune to bleed",
    mutate: (sy) => {
      sy.effects.find((e) => e.kind === "defence" && e.field === "immunity").value = "precision";
    }, breaks: "G2" },
  { spell: "Indomitable", name: "P: the base is built as a standing suppression after all",
    mutate: (sy) => {
      sy.effects.push({ kind: "suppress", target: "self", label: "Indomitable",
        choices: [{ condition: "dazed", amount: 2 }] });
    }, breaks: "H2" },
  { spell: "Freedom", name: "P: the invented +4 comes back",
    mutate: (sy) => { sy.effects.push(note("A +4 status bonus to Escape attempts.")); },
    breaks: "H3" },
  { spell: "Hand Of The Reaper", name: "P: a fumble stops carrying its Deadly critical",
    mutate: (sy) => { delete sy.effects.find((e) => e.kind === "saveLadder").criticalOn.fumble; },
    breaks: "F1h" },
  { spell: "Heal", name: "P: the extra ten HP is wired, selling the soul-drain half",
    mutate: (sy) => { sy.warps.find((w) => /additional 10 HP/i.test(w.text)).mods = { healBonus: 10 }; },
    breaks: "K5" },
  { spell: "Heal", name: "P: the warp's text loses the half it cannot deliver",
    mutate: (sy) => {
      const w = sy.warps.find((x) => /additional 10 HP/i.test(x.text));
      w.text = w.text.replace(/\s*or 5 soul drain/i, "");
    }, breaks: "K5b" },
  { spell: "Hypercognition", name: "P: its +5 lands on a slot no bonus can reach",
    mutate: (sy) => { sy.effects.find((e) => e.kind === "bonus").slot = "multitasking"; },
    breaks: "K2b" },
  { spell: "Forget", name: "P: it applies a condition it has no clock for",
    mutate: (sy) => {
      sy.effects.push({ kind: "condition", target: "targets", condition: "confused", onSave: ["fumble"] });
    }, breaks: "L3" }
];

/** Rows in the pack are plain objects; the author script's helper, inlined. */
const note = (text) => ({ kind: "note", text });

const files = [...new Set(MUTATIONS.map((m) => m.file))];
guardFiles(files);
const originals = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));

const run = () => {
  try {
    execFileSync(process.execPath, [VERIFY], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
};

if (!run()) {
  console.error("verify-chapter10-281-290 does not pass on the unmutated tree — nothing to measure.");
  process.exit(1);
}

let survived = 0;
let unmatched = 0;
for (const mutation of MUTATIONS) {
  const original = originals.get(mutation.file);
  if (!original.includes(mutation.from)) {
    console.error(`  ANCHOR MISSING  ${mutation.name}`);
    unmatched++;
    continue;
  }
  if (original.split(mutation.from).length - 1 > 1) {
    console.error(`  ANCHOR AMBIGUOUS  ${mutation.name}`);
    unmatched++;
    continue;
  }
  fs.writeFileSync(mutation.file, original.replace(mutation.from, mutation.to));
  const stillPasses = run();
  fs.writeFileSync(mutation.file, original);
  if (stillPasses) {
    console.error(`  SURVIVED  ${mutation.name} (expected ${mutation.breaks} to fail)`);
    survived++;
  } else {
    console.log(`  caught    ${mutation.name}`);
  }
}

/*
 * THE PACK PASS. One spell's `system` at a time, restored from the
 * ORIGINAL VALUE READ BEFORE THE MUTATION rather than from a
 * re-serialisation, and restored in a finally so a crash between the
 * write and the restore cannot leave Graham's Grimoire mutated.
 */
const { ClassicLevel } = await import("classic-level");
const SPELLS = path.join(SYSTEM_ROOT, "packs", "spells");

async function withSpell(name, fn) {
  const db = new ClassicLevel(SPELLS, { valueEncoding: "json" });
  await db.open();
  try {
    let key = null;
    let value = null;
    for await (const [k, v] of db.iterator()) {
      if (!k.startsWith("!items!") || v?.type !== "spell") continue;
      if (String(v.name).trim().toLowerCase() !== name.toLowerCase()) continue;
      key = k; value = v; break;
    }
    if (!key) return "ANCHOR MISSING";
    const pristine = JSON.parse(JSON.stringify(value));
    try {
      await db.put(key, fn(value));
      await db.close();
      const stillPasses = run();
      const db2 = new ClassicLevel(SPELLS, { valueEncoding: "json" });
      await db2.open();
      await db2.put(key, pristine);
      await db2.close();
      return stillPasses ? "SURVIVED" : "caught";
    } catch (err) {
      const db3 = new ClassicLevel(SPELLS, { valueEncoding: "json" });
      await db3.open();
      await db3.put(key, pristine);
      await db3.close();
      throw err;
    }
  } finally {
    if (db.status === "open") await db.close();
  }
}

/** One item in a named pack, mutated whole and restored from the original. */
async function withPackItem(packName, itemName, fn) {
  const dir = path.join(SYSTEM_ROOT, "packs", packName);
  const open = async () => {
    const db = new ClassicLevel(dir, { valueEncoding: "json" });
    await db.open();
    return db;
  };
  let key = null;
  let pristine = null;
  const db = await open();
  try {
    for await (const [k, v] of db.iterator()) {
      if (!k.startsWith("!items!")) continue;
      if (String(v?.name).trim().toLowerCase() !== itemName.toLowerCase()) continue;
      key = k; pristine = JSON.parse(JSON.stringify(v));
      const next = fn(v);
      // A CHANGED _id MOVES THE KEY, so the old row is removed too.
      if (next._id && `!items!${next._id}` !== k) { await db.del(k); await db.put(`!items!${next._id}`, next); }
      else await db.put(k, next);
      break;
    }
  } finally { await db.close(); }
  if (!key) return "ANCHOR MISSING";
  try {
    return run() ? "SURVIVED" : "caught";
  } finally {
    const db2 = await open();
    try {
      for await (const [k] of db2.iterator()) {
        if (k.startsWith("!items!") && k !== key) continue;
      }
      // remove whatever key the mutation may have moved it to, then restore
      const moved = `!items!${pristine._id}`;
      for (const stale of new Set([key, moved, "!items!trgGoodberry00001", "!items!trgGoodberry0001"])) {
        await db2.del(stale).catch(() => {});
      }
      await db2.put(key, pristine);
    } finally { await db2.close(); }
  }
}

for (const m of PACK_MUTATIONS) {
  let state;
  try {
    state = m.pack
      ? await withPackItem(m.pack, m.item, (doc) => { m.mutate(doc); return doc; })
      : await withSpell(m.spell, (doc) => { m.mutate(doc.system); return doc; });
  } catch (err) {
    state = `ERROR ${err.message}`;
  }
  if (state === "caught") {
    console.log(`  caught    ${m.name}`);
  } else if (state === "ANCHOR MISSING") {
    console.error(`  ANCHOR MISSING  ${m.name} (${m.spell ?? m.item})`);
    unmatched++;
  } else if (state === "SURVIVED") {
    console.error(`  SURVIVED  ${m.name} (expected ${m.breaks} to fail)`);
    survived++;
  } else {
    console.error(`  ${state}  ${m.name}`);
    unmatched++;
  }
}

for (const [file, original] of originals) fs.writeFileSync(file, original);

const TOTAL = MUTATIONS.length + PACK_MUTATIONS.length;
process.stdout.write(survived + unmatched
  ? `\nmutate-chapter10-281-290: FAILED — ${survived} survived, ${unmatched} unmatched.\n`
  : `\nmutate-chapter10-281-290: OK — all ${TOTAL} mutations caught `
    + `(${MUTATIONS.length} in the code, ${PACK_MUTATIONS.length} in the pack), tree restored.\n`);
process.exit(survived + unmatched ? 1 : 0);
