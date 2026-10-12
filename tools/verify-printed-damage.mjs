#!/usr/bin/env node
/**
 * verify-printed-damage — the book's damage against the pack's.
 *
 * NEW at 3.452.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS, AND IT IS NOT A FLATTERING REASON.
 *
 * Graham, 1 September 2026, after answering five questions I had put to
 * him as open rules problems: "The moral here is that you should
 * probably at some point look at the rulebook that I attached to this
 * thread, it would kind of help!"
 *
 * Four of the five were not rules problems. They were me reading the
 * pack's STRUCTURED FIELDS and treating a field's absence as a gap in
 * the rules, when the spell's own printed description said what it did.
 * The worst of them: I described four spells as having damage "stranded
 * in baseDamage", when `baseDamage` is the per-die base that Empower
 * Spell and the warping options multiply and was doing its job — the
 * real damage was in prose I had not read.
 *
 * SO THE BOOK IS NOW IN THE TREE and this check reads it. Every spell's
 * printed damage is compared against what the pack can actually roll.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT THIS CHECK HAD TO LEARN NOT TO CLAIM.
 *
 * The first three drafts of the sweep behind it were each wrong in a way
 * worth keeping, because each is a way of counting something that is not
 * there:
 *
 *   1. ENTRY BOUNDARIES. The stat-block regex was anchored to end of
 *      line, so a block that ran its traits on after the PP was never a
 *      boundary and its whole entry was swallowed by its predecessor.
 *      Neutralise Poison — a counteract spell with no damage at all —
 *      was reported as carrying 2d6 and 4d6, which belonged to Nexus Of
 *      Elemental Energy underneath it. `verify-basic-save` records the
 *      same failure from the other direction: a fixed-width window that
 *      "reported NINETY-ONE where the real answer was nine".
 *   2. WARPING OPTIONS. A warp's dice are what the spell BECOMES when
 *      paid for, not what it does. Counting them made Ride The Lightning
 *      — which explicitly "cannot cause damage" — a spell missing 8d12.
 *   3. DICE THAT ARE NOT DAMAGE. "1d6 rounds" is a duration, "1d4
 *      questions" a count. Time Stop, Planar Enquiry and Mirage Entity
 *      all arrived on the list as damage defects.
 *
 * Each draft was a bigger number than the truth, and each would have
 * been reported as a finding if the entries had not been read. THAT is
 * the habit this file exists to enforce: read the entry.
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { spellEntries } from "./rulebook.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

/**
 * A dice expression in a damage or healing context.
 *
 * NOT EVERY `NdN` IS DAMAGE — see the header's third draft. The context
 * words are the book's own: it says "inflicts", "takes", "deals",
 * "damage", "Drain", "healed of".
 */
export function damageDice(body) {
  const out = new Set();
  const DAMAGE_WORD = /\b(damage|drain|hp|healed|heals|hit points)\b/i;
  for (const m of String(body ?? "").matchAll(/\b(\d+)d(\d+)\b/g)) {
    const after = body.slice(m.index + m[0].length, m.index + m[0].length + 60);
    const before = body.slice(Math.max(0, m.index - 60), m.index);
    if (DAMAGE_WORD.test(after) || /\b(inflicts?|deals?|takes?|healed of)\b[^.]{0,40}$/i.test(before)) {
      out.add(`${m[1]}d${m[2]}`);
    }
  }
  return [...out];
}

/** The spell's own body: not its warping options, not its Base Damage line. */
export function spellBody(entryText) {
  return String(entryText ?? "").split(/WARPING OPTIONS/i)[0].replace(/^Base Damage.*$/gm, "");
}

const book = spellEntries();
ok("A1 the rulebook is in the tree and parsed", Object.keys(book).length > 650,
  `${Object.keys(book).length} entries — re-run the parser in tools/rulebook.mjs`);
// THE BOUNDARY BUG, PINNED. Neutralise Poison is a counteract spell and
// its entry must not reach into the one below it.
ok("A2 AND ENTRY BOUNDARIES HOLD",
  damageDice(spellBody(book["NEUTRALISE POISON"]?.text ?? "")).length === 0,
  "Neutralise Poison has no damage; if it reports some, an entry is swallowing its neighbour");
ok("A2b a known warp-only spell reports no damage",
  damageDice(spellBody(book["RIDE THE LIGHTNING"]?.text ?? "")).length === 0,
  "its 8d12 is a +10 PP warping option, and the spell itself cannot cause damage");
// THE BASE DAMAGE LINE IS NOT THE SPELL'S DAMAGE, and mistaking it for
// one is the exact error Graham corrected on 1 September 2026. Driven
// against the ENTRY rather than asserted about the pack, because the
// pack cannot tell you what the BOOK was read to say.
ok("A2d AND `Base Damage` IS NOT WHAT THE SPELL DEALS",
  !/Base Damage/i.test(spellBody(book["FORCEFUL STRIKE"]?.text ?? ""))
  && !damageDice(spellBody(book["FORCEFUL STRIKE"]?.text ?? "")).includes("1d6"),
  "1d6 is the per-die base Empower multiplies; reading it as damage is the misreading this file exists for");
ok("A2c and a duration is not damage",
  damageDice(spellBody(book["TIME STOP"]?.text ?? "")).length === 0,
  "\"1d6 rounds\" is how long it lasts");

const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
await db.open();
const pack = new Map();
try {
  for await (const [k, v] of db.iterator()) {
    if (k.startsWith("!items!") && v?.type === "spell") {
      pack.set(String(v.name).toUpperCase().replace(/[’']/g, "'"), v);
    }
  }
} finally { await db.close(); }
ok("A3 the pack was read", pack.size > 600, `${pack.size} spells`);

const silent = [];
for (const [name, e] of Object.entries(book)) {
  const printed = damageDice(spellBody(e.text));
  if (!printed.length) continue;
  const p = pack.get(name.toUpperCase().replace(/[’']/g, "'"));
  if (!p) continue;
  const blob = JSON.stringify({ d: p.system?.damage, e: p.system?.effects });
  const found = new Set([...blob.matchAll(/\b(\d+)d(\d+)\b/g)].map((m) => `${m[1]}d${m[2]}`));
  if (!found.size) silent.push(name);
}

/*
 * THE RATCHET. These are spells whose printed damage the pack carries
 * NOWHERE — not in `damage`, not in any effect. Six were fixed at
 * 3.452.0 with mechanisms that already existed and only needed the entry
 * read: four `strikeRider`s (Disrupting/Flaming/Freezing Weapon and
 * Forceful Strike), one `thorns` (Fiery Body), and Shatter's plain 2d10.
 *
 * THE REST NEED MECHANISMS THAT DO NOT EXIST, and that is a different
 * backlog from "somebody forgot a number". It may only SHRINK.
 */
const SILENT_BACKLOG = Object.freeze(new Set([
  // THREE CAME OFF THIS LIST AT 3.454.0 — Spike Stones, Verdant
  // Retribution and Wall Of Thorns — when the hazardous-terrain
  // mechanism was built for the sentence all three share. Wall Of Ice
  // stays: its 2d6 exists only after a section has been DESTROYED, which
  // is an object-damage question and not a terrain one.
  // AURA OF VITALITY CAME OFF AT 3.461.0. Its 2d8 was a heal, not damage,
  // and it needed the `perTurn` kind generalised out of Luminance plus
  // Graham's ruling that the whole circle heals on the caster's turn.
  // THREE CAME OFF AT 3.465.0 — CONSECRATE, DESECRATE and FORCE PUNCH.
  // All three print the book's word "secondary", so all three became
  // packets in the loop `strike-riders.mjs` already feeds. Consecrate and
  // Desecrate needed a rider sourced from the GROUND rather than from the
  // attacker (magic/area-rider.mjs, and Graham's ruling of 2 September
  // 2026 that the system applies it); Force Punch needed only an
  // `unarmed` scope, since the spell infuses a hand and not a weapon.
  // THE TWO PRISONS CAME OFF AT 3.472.0. Both print a four-degree escape
  // ladder that runs the WRONG WAY for this system — a worse roll costs
  // MORE — and the two ladders are not the same shape, so they are stored
  // as four printed numbers each rather than derived from one. See
  // magic/prison.mjs and Graham's rulings of 2 September 2026.
  // ELEMENTAL SHIELD CAME OFF AT 3.473.0. Its 2d6 is the `thorns`
  // mechanism Vibrant Thorns already proved, with a printed save; the
  // resistance it grants is a TYPE, since Graham ruled on 2 September
  // 2026 that resistance halves and has no value — which damage.mjs
  // already implements. See magic/damage-type-choice.mjs for the element.
  // MISSILE STORM CAME OFF AT 3.478.0. Nothing else in this pack rolls
  // dice to decide how many dice to roll — "2d6 +6 magic missiles ...
  // + 1d6 per Size category above Medium" — so the count is a result in
  // its own right, printed on the card, and computed per TARGET because
  // Graham ruled on 3 September 2026 that the target's size is the one
  // that adds the missiles. He also ruled the salvo lands automatically:
  // there is no save line and the sentence is "is hit by". See
  // magic/missile-storm.mjs.
  "MIRAGE ENTITY",
  // QUENCH CAME OFF AT 3.460.0. Its 4d8 was absent because this system's
  // ladder would have burned everyone in the mist; what it needed was
  // Graham's ruling that a "fire creature" is one immune to fire, and a
  // damage scope to say so. See magic/damage-scope.mjs.
  // WAR CRY CAME OFF AT 3.467.0. Its 1d6 needed a reaction that reaches
  // back into a Strike already resolved — see magic/triggered-strike.mjs
  // and Graham's ruling that the die lands on the strike that triggered
  // it. Nothing new had to be remembered: attack-workflow already keeps
  // lastCriticalInjury for Ambush and Sniping.
  // NEXUS CAME OFF AT 3.477.0. Its five-degree ladder needed a zone that
  // is a PLACE rather than an emanation, swept from the turn clock —
  // "any creature that begins their turn within the spells radius" — and
  // an element chosen at cast that decides which save is rolled. See
  // magic/elemental-nexus.mjs.
  "SHAPE OF THE ABERRANT", "SHAPE OF THE WYRM",
  // VITAL BEACON and LIFE SIPHON came off at 3.470.0. The beacon needed a
  // pool that WEARS OUT — nothing in this system did that; Luminance
  // grows and a charged item counts uses of a fixed thing. The siphon
  // needed a record of the last cast, because registerActiveSpell keeps
  // the same three facts only for a locked or sustained spell and an
  // ordinary arcane soul spell is exactly what it triggers on.
  // WALL OF ICE came off at 3.610.0: its 2d6 belongs to a destroyed
  // section, which the wall's card now names as by hand (R9).
  "SLIDE"
]));

const appeared = silent.filter((n) => !SILENT_BACKLOG.has(n));
ok("B1 NO NEW SPELL PRINTS DAMAGE THE PACK CANNOT ROLL",
  appeared.length === 0,
  `${appeared.length} new: ${appeared.join(", ")}`);
// THE RATCHET MAY ONLY SHRINK — the same half `verify-basic-save` learned
// to add, so a fixed spell is removed rather than left making the
// backlog look permanent.
const stale = [...SILENT_BACKLOG].filter((n) => !silent.includes(n));
ok("B2 and no backlog entry outlives the gap it names",
  stale.length === 0,
  `fixed, so remove from the list: ${stale.join(", ")}`);

// THE SIX FIXED AT 3.452.0, asserted individually — a ratchet that only
// counts would pass if one were quietly reverted and another added.
const rolls = (n) => {
  const p = pack.get(n);
  const blob = JSON.stringify({ d: p?.system?.damage, e: p?.system?.effects });
  return [...blob.matchAll(/\b(\d+)d(\d+)\b/g)].map((m) => `${m[1]}d${m[2]}`);
};
/*
 * C1 SAID "ROLLS" AND ONLY CHECKED THAT THE FIELD WAS THERE.
 *
 * Driving 3.452.0 showed Shatter's card reading "The spell takes effect.
 * 4 PP spent." and nothing else: the 2d10 never rolled. Damage resolves
 * through exactly two routes — `category: "attack"` rolls against the
 * target's DB, `category: "save"` runs the basic ladder — and Shatter is
 * `utility`, because the book gives an unattended object automatic
 * damage. There is no third route, so the formula sat inert.
 *
 * A FORMULA WITHOUT A ROUTE IS THE SAME DEFECT `verify-basic-save` was
 * written for: "the save line promises a rule the spell cannot reach."
 * So the rule is general rather than about Shatter — any spell carrying
 * damage must either resolve it or SAY that it does not.
 */
const CATEGORY_RESOLVES_DAMAGE = new Set(["attack", "save"]);
const carriesDamage = [];
for (const [name] of Object.entries(book)) {
  const p = pack.get(name.toUpperCase().replace(/[’']/g, "'"));
  if (!p) continue;
  if (!String(p.system?.damage?.formula ?? "").trim()) continue;
  const category = String(p.system?.category ?? "").trim().toLowerCase();
  if (CATEGORY_RESOLVES_DAMAGE.has(category)) continue;
  // THE NOTE MUST SAY WHERE THE DAMAGE IS APPLIED, by whatever route.
  // "Apply by hand" was the only accepted wording until 3.458.0, when
  // Shatter's note stopped describing a gap and started naming the tool
  // that already closes it. Both are honest answers to the same rule;
  // silence is the only failing one.
  const saysSo = (p.system?.effects ?? []).some(
    (r) => r?.kind === "note" && /apply by hand|Universal Modifier/i.test(String(r.text ?? "")));
  if (!saysSo) carriesDamage.push(`${name} (${category || "no category"})`);
}
ok("C1 A DAMAGE FORMULA EITHER RESOLVES OR SAYS IT DOES NOT",
  carriesDamage.length === 0,
  `${carriesDamage.length} carry damage no route resolves and no note explains: ${carriesDamage.join(", ")}`);
// THE SET ITSELF, asserted positively. A list-is-empty check passes just
// as well when the list can no longer be filled — adding "utility" to
// the routes silently excused the one category whose damage never
// rolled, and C1 above could not tell the difference.
ok("C1c AND ONLY AN ATTACK OR A SAVE RESOLVES DAMAGE",
  [...CATEGORY_RESOLVES_DAMAGE].sort().join(",") === "attack,save",
  "utility has no route — that is the whole finding");
// AND THE ONE SPELL THAT PROVED IT, named. Shatter is `utility` with a
// printed 2d10, so it must carry the sentence that says so.
const shatterNote = (pack.get("SHATTER")?.system?.effects ?? [])
  .find((r) => r?.kind === "note" && /Hardness/i.test(String(r.text ?? "")));
// AND IT NAMES THE TOOL THAT DOES THE JOB (3.458.0). Measuring the pack
// settled the "automatic damage route" I twice proposed building: of 118
// spells carrying a damage formula, 87 resolve through a save and 30
// through an attack, and Shatter is the ONLY one with no route — the one
// I created at 3.452.0. Its target is an unattended OBJECT, and object
// damage already exists in the Universal Modifier, Hardness and all.
ok("C1d Shatter's card says where its damage is applied",
  Boolean(shatterNote) && /Universal Modifier/i.test(String(shatterNote?.text ?? "")),
  "the live card read \"takes effect, 4 PP spent\" and nothing else");
ok("C1e and says why the spell cannot resolve it itself",
  /unattended OBJECT/i.test(String(shatterNote?.text ?? "")),
  "a note that only says \"by hand\" teaches the next reader nothing");

ok("C1b Shatter still carries the number the book prints",
  rolls("SHATTER").includes("2d10"),
  "the sheet should show what the book says even while the card applies it by hand");
ok("C2 Forceful Strike adds 2d6, not its metamagic base",
  rolls("FORCEFUL STRIKE").includes("2d6") && !rolls("FORCEFUL STRIKE").includes("1d6"),
  "Base Damage 1d6 is what Empower multiplies; 2d6 is what the strike adds");
ok("C3 Fiery Body burns whoever touches it", rolls("FIERY BODY").includes("3d6"));
for (const [n, d] of [["DISRUPTING WEAPON", "1d6"], ["FLAMING WEAPON", "1d6"], ["FREEZING WEAPON", "1d6"]]) {
  ok(`C4 ${n} carries its secondary ${d}`, rolls(n).includes(d));
}

if (failures.length) {
  process.stderr.write(`verify-printed-damage: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  - ${f}\n`);
  process.exit(1);
}
process.stdout.write(
  `verify-printed-damage: OK — ${checks} checks, ${silent.length} spells still print damage the pack `
  + `cannot roll. The book is in the tree; read the entry.\n`);
