#!/usr/bin/env node
/**
 * mutate-chapter5-racial-101-110 — can the block-10 checks fail?
 *
 * NEW at 3.567.0. SURVIVED and an unmatched anchor are both failures.
 *
 * THE EDITS THIS FILE MAKES ARE THE BLOCK'S OWN HISTORY. Each one puts
 * the tree back into a state it was genuinely in, or into the state the
 * obvious "tidy-up" would produce:
 *
 *   #1-#3  Dracoris authored on the axis that already existed, which is
 *          what would have shipped if nobody had noticed that
 *          `sourceTypes` is the attacker's type.
 *   #4     the fallback row losing its stand-down, so the +1 can be
 *          taken twice on the same roll.
 *   #5-#8  Hulking Form's size rule relaxed in the four ways a reader in
 *          a hurry would relax it.
 *   #9     Ascendan Scholar back to its own private copy of the bonus.
 *   #10    the retraction section blinded — because the whole point of
 *          section Z is that it must FAIL when somebody "discovers" that
 *          Fast Healer does nothing.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const HULK = path.join(SYSTEM_ROOT, "module", "hulking-form.mjs");
const FEATS = path.join(SYSTEM_ROOT, "module", "feats-workflow.mjs");
const ACTION = path.join(SYSTEM_ROOT, "module", "combat", "action-workflow.mjs");
const COMBAT = path.join(SYSTEM_ROOT, "module", "documents", "combat.mjs");
const FEATS_RULES = path.join(SYSTEM_ROOT, "module", "feats.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-chapter5-racial-101-110.mjs");

/**
 * THE PACK IS MUTATED THROUGH ITS OWN DECLARED CHANNEL, not by hand.
 *
 * Three of Dracoris's checks read compiled LevelDB rather than source,
 * and a mutation harness that could not reach them would leave the
 * authored rule — the actual deliverable of this block — untested. So
 * these entries name a pack document, and the runner edits it in place
 * and puts it back, with the same guard the source files get.
 */
const PACK_MUTATIONS = [
  {
    name: "Dracoris is authored on sourceTypes — the axis that already existed",
    item: "Dracoris",
    edit: (flags) => {
      const rows = flags["trg-prime"].conditionals;
      rows[0].when.sourceTypes = rows[0].when.targetTypes;
      delete rows[0].when.targetTypes;
    },
    breaks: "A5/A8/A12 — the bonus fires when a Wyrm attacks and never when you talk to one"
  },
  {
    name: "the bonus widens to every skill",
    item: "Dracoris",
    edit: (flags) => { delete flags["trg-prime"].conditionals[0].when.subjects; },
    breaks: "A4/A10 — 'all interactions' read literally, which is what the ruling refused"
  },
  {
    name: "the exact row stops being automatic",
    item: "Dracoris",
    edit: (flags) => { flags["trg-prime"].conditionals[0].auto = false; },
    breaks: "A7 — a bonus whose scope the roll has already settled, left for the player to tick"
  },
  {
    name: "the fallback row stops standing down",
    item: "Dracoris",
    edit: (flags) => { delete flags["trg-prime"].conditionals[1].when.not; },
    breaks: "A15/A16 — both rows offered at once, so the +1 can be taken twice"
  },
  {
    name: "the DR half is dropped while wiring the other half",
    item: "Dracoris",
    effect: "Dracoris: toughened skin (+1 DR, always adds)",
    editEffect: (doc) => { doc.changes = []; },
    breaks: "A19 — the half that always worked, lost to the half that did not"
  },

  /* ---- THE PACK TEXT KEEPING UP WITH THE RULE (3.567.2) ---- *
   * Both of these are the state the pack was ACTUALLY IN when 3.567.1
   * was live-tested: a narrow fix applied the moment E4 was ruled, then
   * never revisited when the full corrected wording arrived. Nothing
   * caught it; these mutations are what make sure something does.
   * ---------------------------------------------------------- */
  {
    name: "the printed text loses the duration clause again",
    item: "Hulking Form",
    edit: null,
    editItem: (doc) => {
      doc.system.description = String(doc.system.description)
        .replace(" (at base PP cost for 10 minutes)", "");
    },
    breaks: "B1d/B1e — the code obeys a rule the text no longer states"
  },
  {
    // THE TRAIT IS THE MECHANISM. actor-sheet.mjs collects heritage feats
    // by testing this field, so a Beastman who loses it stops opening the
    // Beastman lineage — and the player simply cannot see the feats they
    // have already bought, with nothing anywhere saying why.
    name: "Beastman loses the Heritage trait",
    item: "Beastman",
    edit: null,
    editItem: (doc) => { doc.system.traits = ""; },
    breaks: "H2 — the sheet stops recognising it as a heritage feat at all"
  },
  {
    name: "Hulking Form's lineage stops being the one Beastman opens",
    item: "Hulking Form",
    edit: null,
    editItem: (doc) => { doc.system.sourceRace = "Lycanthrope"; },
    breaks: "H9/H10 — a feat gated on a lineage nothing grants is a feat nobody can take"
  },
  {
    name: "the note effect goes back to the pre-clock wording",
    item: "Hulking Form",
    effect: "Hulking Form",
    editEffect: (doc) => {
      doc.description = "While in Hybrid Form you grow one size step, gaining every size "
        + "modifier - Strength, Dexterity, base HP and reach. Applied automatically by Hybrid "
        + "Transformation's Use button and removed when you return to humanoid form.";
    },
    breaks: "B21b/B21c — the sheet stops naming the clock that ends it"
  }
];

const MUTATIONS = [
  {
    file: HULK,
    name: "the Large exception is dropped",
    from: "  if (index >= LARGE_INDEX) return null;",
    to: "",
    breaks: "B6/B7/B8 — the spell's own clause, discarded because a Beastman is never Large"
  },
  {
    file: HULK,
    name: "an unknown size is coerced rather than refused",
    from: "  if (index < 0) return null;",
    to: "  if (index < 0) return sizeStepUp(\"medium\");",
    breaks: "B9/B10 — lesson 18: a typo becomes a Large character"
  },
  {
    file: HULK,
    name: "the size change loses its priority over the race's",
    from: "    priority: 30",
    to: "    priority: 10",
    breaks: "B13 — which effect wins becomes the order Foundry happened to apply them in"
  },
  {
    file: HULK,
    name: "the change is applied as an add rather than an override",
    from: "    type: CHANGE_TYPE.OVERRIDE,",
    to: "    type: CHANGE_TYPE.CUSTOM,",
    breaks: "B12 — a size field 'added' to is a size field nobody set"
  },
  {
    // THE 3.567.0 GUARANTEE, NOW CARRIED BY THE FLAG. The size effect and
    // the form's effect end at different times, so they cannot share one
    // document; what binds them is that both answer to the same
    // featSource. Drop the stamp and the growth outlives the form.
    file: FEATS,
    name: "the size effect loses the form's source flag",
    from: "        hulking.flags[SYSTEM_ID][FEAT_SOURCE_FLAG] = item.id;",
    to: "",
    breaks: "B19 — the revert no longer sweeps it: a permanently Large Beastman"
  },
  {
    // ORDER MATTERS AND LOOKS LIKE IT DOES NOT. replaceFeatEffect clears
    // every effect carrying that flag before writing its own, so granting
    // the growth first deletes it a moment later — silently, with the
    // card still announcing it.
    file: FEATS,
    name: "the size effect is created before the form's, not after",
    from: "      await replaceFeatEffect(actor, item, {\n        name: \"Hybrid Form\",",
    to: "      if (hulking) {\n        hulking.flags[SYSTEM_ID][FEAT_SOURCE_FLAG] = item.id;\n        hulking.origin = item.uuid;\n        await actor.createEmbeddedDocuments(\"ActiveEffect\", [hulking]);\n      }\n      await replaceFeatEffect(actor, item, {\n        name: \"Hybrid Form\",",
    breaks: "B19b — the growth is granted and then swept away by the form's own replace"
  },
  {
    file: HULK,
    name: "the ten-minute clock is written but nothing expires it",
    from: "        spellEffect: true,",
    to: "        spellEffect: false,",
    breaks: "B25 — a duration in the description and nowhere else"
  },
  {
    file: HULK,
    name: "the clock starts at world time zero rather than now",
    from: "  const start = Math.max(0, Math.trunc(Number(worldTime) || 0));",
    to: "  const start = 0;",
    breaks: "B24/B26 — the effect expires the instant it is granted"
  },
  {
    file: HULK,
    name: "the printed ten minutes becomes one",
    from: "HULKING_FORM_SECONDS = 600;",
    to: "HULKING_FORM_SECONDS = 60;",
    breaks: "B22 — Size Alteration's BASE duration, which is the version the feat does not get"
  },
  {
    // THE FEAT IS FREE (Graham, 17 September 2026). The book names a PP
    // cost; saying nothing leaves the player to decide whether their
    // untouched pool is the bug.
    file: HULK,
    name: "the card stops saying no PP is spent",
    from: '    + "minutes or when you return to humanoid form, whichever comes first. No PP is spent.";',
    to: '    + "minutes or when you return to humanoid form, whichever comes first.";',
    breaks: "B28 — the printed PP cost goes unanswered on the one card that could answer it"
  },
  {
    // THE FAILURE NOBODY REPORTS. A bonus that does not arrive is raised
    // within a session; a bonus that never leaves is raised by nobody,
    // and this is the edit that produces a permanently Large Beastman.
    file: FEATS,
    name: "returning to humanoid form stops removing the feat's effects",
    from: '        if (stale.length) await actor.deleteEmbeddedDocuments("ActiveEffect", stale);',
    to: "",
    breaks: "B20 — the size step outlives the form it belongs to"
  },
  {
    file: FEATS,
    name: "the size is no longer read as a value before the effect is built",
    from: "      const currentSize = actor.system?.identity?.size;",
    to: "      const currentSize = () => actor.system?.identity?.size;",
    breaks: "B20b — a second shift would step up from a size this feat granted"
  },
  {
    file: FEATS,
    name: "Ascendan Scholar gets its own private copy of the bonus",
    from: '      await specialistSkillBonus(actor, item, { title: "Ascendan Scholar", value: 1 });',
    to: '      await postCard(actor, "Ascendan Scholar", [line("+1 to your specialist skill.")]);',
    breaks: "C2 — a seventh implementation of a mechanism six feats share"
  },
  {
    file: FEATS,
    name: "Ascendan Scholar's +1 is 'corrected' to the family's +2",
    from: 'title: "Ascendan Scholar", value: 1',
    to: 'title: "Ascendan Scholar", value: 2',
    breaks: "C3 — the odd value is printed, not a slip"
  },
  {
    file: ACTION,
    name: "the target's type is filled on the roll but not the dialog",
    from: "      targetTypes: creatureTypesOf(targetActor?.system ?? {}),\n      targetUuid: targetActor?.uuid ?? \"\",",
    to: "",
    breaks: "A21 — the rule then works only when the player holds Shift"
  },
  {
    // THE GRANTS TABLE IS THE OTHER HALF — but only for the PARENT
    // lineages, which is why this mutation targets Half-Orc rather than
    // Beastman. `effectiveRaces` pushes the feat's own name before it
    // consults the table, so `beastman: ["Beastman"]` is belt-and-braces
    // and emptying it changes nothing (H11 says so out loud, so the next
    // reader does not file the redundancy as a bug). "Orc" has no such
    // second source: empty it and a Half-Orc loses the Orc feat list.
    file: FEATS_RULES,
    name: "the Half-Orc heritage stops opening the parent Orc lineage",
    from: '  "half-orc": Object.freeze(["Orc", "Half-Orc"]),',
    to: '  "half-orc": Object.freeze(["Half-Orc"]),',
    breaks: "H7 — every Orc racial feat becomes unreachable to a Half-Orc"
  },
  {
    file: COMBAT,
    // RE-ANCHORED AT 3.591.0. Phase 1 now sums TWO rates through one
    // parameterised helper, because Regeneration healed injuries and no
    // hit points until this release, so the literal `"fastHealing"`
    // string is gone from the read. The mutation still does exactly what
    // it did: it stops the turn reading the flag at all.
    name: "the turn no longer reads the fastHealing flag",
    from: 'Number(e.getFlag?.(SYSTEM_ID, flag) ?? 0)',
    to: "0",
    breaks: "Z2 — the retraction's own evidence: Fast Healer really would do nothing"
  },
  {
    // ADDED AT 3.591.0 beside it: the rate is read and then left out of
    // the sum. That is not a hypothetical shape — it is what 3.590.0
    // shipped for Regeneration, and Z2b is the check that would have
    // caught it if it had existed.
    file: COMBAT,
    name: "THE SURVIVAL SHAPE: the rate is read, named, and left out of the heal",
    from: "    const fastHealing = fastHealingRate + regenerationRate;",
    to: "    const fastHealing = regenerationRate;",
    breaks: "Z2b — Fast Healer's own rate drops out of the sum it feeds"
  }
];

function run() {
  try {
    execFileSync(process.execPath, [CHECK], { stdio: ["ignore", "pipe", "pipe"] });
    return true;
  } catch {
    return false;
  }
}

const { ClassicLevel } = await import("classic-level");
const PACK = path.join(SYSTEM_ROOT, "packs", "feats");

/** Every key/value in the feats pack that a pack mutation might touch. */
async function withPack(fn) {
  const db = new ClassicLevel(PACK, { valueEncoding: "json" });
  await db.open();
  try { return await fn(db); } finally { await db.close(); }
}

const guard = guardFiles([HULK, FEATS, FEATS_RULES, ACTION, COMBAT, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-chapter5-racial-101-110: verify already fails on an unmodified tree.\n");
    guard.release();
    process.exit(2);
  }

  for (const m of MUTATIONS) {
    const original = fs.readFileSync(m.file, "utf8");
    const occurrences = original.split(m.from).length - 1;
    if (occurrences !== 1) {
      results.push({ name: m.name, state: occurrences === 0 ? "ANCHOR MISSING" : `ANCHOR x${occurrences}` });
      continue;
    }
    fs.writeFileSync(m.file, original.replace(m.from, m.to));
    const survived = run();
    fs.writeFileSync(m.file, original);
    results.push({ name: m.name, state: survived ? "SURVIVED" : "caught", breaks: m.breaks });
  }

  for (const m of PACK_MUTATIONS) {
    const state = await withPack(async (db) => {
      let itemKey = null;
      let itemValue = null;
      let effectKey = null;
      let effectValue = null;
      for await (const [key, value] of db.iterator()) {
        if (key.startsWith("!items!") && !key.slice(7).includes("!") && value?.name === m.item) {
          itemKey = key; itemValue = value;
        } else if (m.effect && key.startsWith("!items.effects!") && value?.name === m.effect) {
          effectKey = key; effectValue = value;
        }
      }
      if (!itemKey) return "ANCHOR MISSING";
      if (m.effect && !effectKey) return "ANCHOR MISSING";

      const targetKey = m.effect ? effectKey : itemKey;
      const targetValue = m.effect ? effectValue : itemValue;
      const restore = JSON.parse(JSON.stringify(targetValue));
      const edited = JSON.parse(JSON.stringify(targetValue));
      // THREE SHAPES, because a pack mutation may reach an effect, an
      // item's flags (where the conditionals live) or an item's own
      // fields (where the printed text does). `editItem` is the last of
      // those, added at 3.567.2 when the printed text became something a
      // check holds to the rule.
      if (m.effect) m.editEffect(edited);
      else if (m.editItem) m.editItem(edited);
      else m.edit(edited.flags ?? {});
      await db.put(targetKey, edited);
      return { targetKey, restore };
    });
    if (typeof state === "string") { results.push({ name: m.name, state }); continue; }

    const survived = run();
    await withPack((db) => db.put(state.targetKey, state.restore));
    results.push({ name: m.name, state: survived ? "SURVIVED" : "caught", breaks: m.breaks });
  }
} finally {
  guard.restore();
  guard.release();
}

const bad = results.filter((r) => r.state !== "caught");
for (const r of results) {
  process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
  if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`);
}
process.stdout.write(
  bad.length
    ? `\nmutate-chapter5-racial-101-110: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-chapter5-racial-101-110: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
