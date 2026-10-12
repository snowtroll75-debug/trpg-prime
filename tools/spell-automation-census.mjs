#!/usr/bin/env node
/**
 * spell-automation-census — what does each spell ACTUALLY do?
 *
 * NEW at 3.408.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS: I OVERCLAIMED, AND NOTHING COULD CONTRADICT ME.
 *
 * On 25 August 2026 I told Graham "PP 0 is finished — all 30 spells now
 * do something." I had wired seven mechanisms across that tier and the
 * sentence felt earned. It was false: **seven PP 0 cantrips have no
 * automation of any kind**, and an eighth (Daze) records a damage die
 * that nothing rolls.
 *
 * The claim came from remembering the work I had done rather than from
 * measuring the pack. Every other number in this project is measured —
 * the flattened-ladder ratchet, the uncalled-export ratchet, the feat
 * register — and this one was not, so nothing could contradict it.
 *
 * THEN MY FIRST MEASUREMENT WAS ALSO WRONG, in the other direction: I
 * counted `effects.length === 0` as unwired and got EIGHTEEN, which would
 * have been a worse claim than the one it corrected. Ten of those spells
 * deal damage through `system.damage.formula`, and Natural Defence is a
 * card-button reaction that correctly carries no effects at all.
 *
 * A measurement is only as good as its pattern, and a bad one is worse
 * than none because it arrives wearing a number.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE DEFINITION, WRITTEN DOWN SO IT CAN BE ARGUED WITH.
 *
 * A spell DOES SOMETHING if any of these is true:
 *
 *   effects    a non-`note` entry in `system.effects` — condition,
 *              bonus, heal, ward, marker, sense, manoeuvre, light…
 *   damage     a non-empty `system.damage.formula`, which is the field
 *              the cast workflow actually rolls
 *   reaction   the spell is driven by a named mechanism outside the
 *              effect list; Natural Defence is offered as a button on
 *              the save card and is listed here by name
 *
 * A spell carrying ONLY `note` entries is counted separately: a note is
 * a reminder printed on the card, which is exactly the "automation that
 * is really a reminder" this project keeps removing.
 *
 * ─────────────────────────────────────────────────────────────────────
 * `baseDamage` IS NOT DAMAGE, and this is the trap that started it.
 *
 * The item sheet documents `system.baseDamage` as *"used for warping and
 * criticals"*. The cast workflow rolls `system.damage.formula` and never
 * reads it. **Twelve spells carry a die in `baseDamage` with an empty
 * `damage.formula`** — for some (Cure) that is right, because the number
 * lives in a `heal` effect instead; for others it is the only record of
 * damage the spell has, and they deal none.
 *
 * The census reports those separately rather than guessing which is
 * which, because the answer is per-spell and needs the printed text.
 *
 * USAGE:  node tools/spell-automation-census.mjs            # by PP tier
 *         node tools/spell-automation-census.mjs --pp 0     # one tier, listed
 *         node tools/spell-automation-census.mjs --gaps     # every silent spell
 */

import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

/**
 * Spells whose automation lives outside `system.effects` by design.
 *
 * NAMED, NOT INFERRED. A spell is only excused from carrying effects if
 * somebody wrote down which mechanism drives it instead — otherwise
 * "handled elsewhere" becomes the excuse that hides every gap.
 *
 * ─────────────────────────────────────────────────────────────────────
 * AND THE LIST CUTS BOTH WAYS, which 29 August 2026 found the hard way.
 *
 * CUTTING WORDS WAS MISSING FROM IT. The spell has had its own rule
 * module, its own workflow, and its own verify/mutate pair since
 * 3.434.0 — and this census has been reporting it as **silent** ever
 * since, because it carries no `system.effects` row. PP 1 was measured
 * one spell worse than it is for five releases, and the next batch was
 * about to be planned off that number.
 *
 * The header above was written against the danger of a list that is too
 * LONG — "handled elsewhere" as an excuse. A list that is too SHORT
 * fails in the opposite direction and is harder to notice, because a
 * false gap looks exactly like work still to do. It was caught only by
 * searching the module tree for each silent spell's own name before
 * planning against the count, which is the §"search the module tree for
 * a rule's own words" lesson pointed at the measurement instead of at
 * the code.
 *
 * A sweep of every silent spell's name against the module tree on that
 * date found no others: `rage.mjs` is Chapter 4's Invoke Rage action and
 * drives nothing for the PP 2 spell of the same name, and `ward.mjs` is
 * the ward EFFECT KIND rather than a spell.
 */
const DRIVEN_ELSEWHERE = Object.freeze({
  "Natural Defence": "offered as a button on the target's save card (magic/natural-defence.mjs)",
  "Cutting Words": "a reaction resolved by magic/cutting-words.mjs and its workflow — "
    + "the penalty is applied to the triggering check, not carried as an effect row"
});

const filled = (value) => String(value ?? "").trim().length > 0;

/**
 * Classify one spell.
 * @returns {{verdict: string, why: string}}
 */
export function classifySpell(spell) {
  const system = spell?.system ?? {};
  const effects = Array.isArray(system.effects) ? system.effects : [];
  const real = effects.filter((e) => e?.kind && e.kind !== "note");

  if (DRIVEN_ELSEWHERE[spell?.name]) {
    return { verdict: "driven", why: DRIVEN_ELSEWHERE[spell.name] };
  }
  if (real.length) {
    return { verdict: "automated", why: `effects: ${real.map((e) => e.kind).join(", ")}` };
  }
  if (filled(system.damage?.formula)) {
    return { verdict: "automated", why: `damage: ${system.damage.formula} ${system.damage.type ?? ""}`.trim() };
  }
  if (effects.length) {
    return { verdict: "note-only", why: "a reminder on the card, and nothing else" };
  }
  return { verdict: "silent", why: "no effects, no damage, no named mechanism" };
}

/** Does this spell record damage ONLY in the field nothing rolls? */
export function damageOnlyInBaseDamage(spell) {
  const system = spell?.system ?? {};
  if (!filled(system.baseDamage)) return false;
  if (filled(system.damage?.formula)) return false;
  // A heal effect legitimately carries the number instead (Cure).
  //
  // AND SO DOES A STRIKE RIDER, from 3.437.0. Arrow Of The Wild Hunt's
  // 1d6 was on this list because nothing rolled it; it now sits in a
  // `strikeRider` row that the strike loop rolls, and `baseDamage` keeps
  // only the meaning the item sheet documents for it — "used for warping
  // and criticals". Leaving it listed would have gone on reporting a
  // spell as silently damageless for as long as it was fixed, which is
  // the measurement drifting away from the thing measured.
  const effects = Array.isArray(system.effects) ? system.effects : [];
  if (effects.some((e) => e?.kind === "heal" || e?.kind === "tempHP" || e?.kind === "strikeRider")) return false;
  return true;
}

async function spellsPack() {
  const dir = path.join(SYSTEM_ROOT, "packs", "spells");
  const { ClassicLevel } = await import("classic-level");
  const db = new ClassicLevel(dir, { valueEncoding: "json" });
  await db.open();
  const out = [];
  try {
    for await (const [key, value] of db.iterator()) {
      if (!key.startsWith("!items!") || value?.type !== "spell") continue;
      out.push(value);
    }
  } finally {
    await db.close();
  }
  return out;
}

const spells = await spellsPack();
const args = process.argv.slice(2);
const onePP = args.includes("--pp") ? Number(args[args.indexOf("--pp") + 1]) : null;
const gapsOnly = args.includes("--gaps");

const tiers = new Map();
const silent = [];
const noteOnly = [];
const baseDamageOnly = [];

for (const spell of spells) {
  const pp = Number(spell.system?.ppCost ?? 0);
  const { verdict, why } = classifySpell(spell);
  if (!tiers.has(pp)) tiers.set(pp, { automated: 0, driven: 0, "note-only": 0, silent: 0, total: 0 });
  const row = tiers.get(pp);
  row[verdict] += 1;
  row.total += 1;
  if (verdict === "silent") silent.push({ pp, name: spell.name, category: spell.system?.category });
  if (verdict === "note-only") noteOnly.push({ pp, name: spell.name });
  if (damageOnlyInBaseDamage(spell)) {
    baseDamageOnly.push({ pp, name: spell.name, base: spell.system.baseDamage });
  }
}

if (onePP !== null) {
  process.stdout.write(`PP ${onePP}\n`);
  for (const spell of spells.filter((s) => Number(s.system?.ppCost ?? 0) === onePP)
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const { verdict, why } = classifySpell(spell);
    process.stdout.write(`  ${verdict.padEnd(10)} ${spell.name.padEnd(26)} ${why}\n`);
  }
  process.exit(0);
}

if (gapsOnly) {
  process.stdout.write(`SILENT — no effects, no damage, no named mechanism (${silent.length})\n`);
  for (const s of silent.sort((a, b) => a.pp - b.pp || a.name.localeCompare(b.name))) {
    process.stdout.write(`  pp${String(s.pp).padStart(2)}  ${s.name.padEnd(28)} ${s.category ?? ""}\n`);
  }
  process.stdout.write(`\nNOTE ONLY — a reminder and nothing else (${noteOnly.length})\n`);
  for (const s of noteOnly.sort((a, b) => a.pp - b.pp || a.name.localeCompare(b.name))) {
    process.stdout.write(`  pp${String(s.pp).padStart(2)}  ${s.name}\n`);
  }
  process.exit(0);
}

process.stdout.write("PP   total  automated  driven  note-only  silent\n");
for (const pp of [...tiers.keys()].sort((a, b) => a - b)) {
  const r = tiers.get(pp);
  process.stdout.write(
    `${String(pp).padStart(2)} ${String(r.total).padStart(7)} ${String(r.automated).padStart(10)}`
    + ` ${String(r.driven).padStart(7)} ${String(r["note-only"]).padStart(10)} ${String(r.silent).padStart(7)}\n`
  );
}
const totals = [...tiers.values()].reduce((a, r) => {
  for (const k of Object.keys(r)) a[k] = (a[k] ?? 0) + r[k];
  return a;
}, {});
process.stdout.write(
  `\nALL ${totals.total} spells: ${totals.automated} automated, ${totals.driven} driven elsewhere, `
  + `${totals["note-only"]} note-only, ${totals.silent} silent.\n`
);
process.stdout.write(
  `\nDamage recorded ONLY in baseDamage, which nothing rolls (${baseDamageOnly.length}):\n`
);
for (const s of baseDamageOnly.sort((a, b) => a.pp - b.pp)) {
  process.stdout.write(`  pp${String(s.pp).padStart(2)}  ${s.name.padEnd(28)} baseDamage=${s.base}\n`);
}
