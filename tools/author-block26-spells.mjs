#!/usr/bin/env node
/**
 * Author the pages 261-270 spell work settled in block 26.
 *
 * Graham's R1-R7, 24 September 2026.
 *
 * IDEMPOTENT, AND THIS TIME THE WARPS ARE TOO. Block 25's script claimed
 * idempotency at the top and broke it four hundred lines down, in the
 * two warp edits: `mods: { ...(w.mods ?? {}), key: v }` keeps a key an
 * EARLIER RUN of the same script wrote, so replacing one key with a
 * better one silently keeps both. Ball Lightning carried `extraTargets`
 * and `targetCap` together for two runs. Every edit below REPLACES the
 * field it owns.
 *
 * ─────────────────────────────────────────────────────────────────────
 * R1's ELEVEN LADDERS, AND WHY THIS IS AUTHORING RATHER THAN BUILDING.
 *
 * Twelve spells in the block print a degree ladder and none was
 * modelled. Both mechanisms now exist and are driven: `onSave` for rungs
 * that apply conditions, `saveLadder` for rungs that scale damage. The
 * three rules from block 25 govern every row here too — declare the
 * rungs the page prints and only those; "Critical: unaffected" is the
 * absence of a row; "as failure, but also…" means naming the fumble on
 * the failure row as well.
 */

import { ClassicLevel } from "classic-level";

const cond = (condition, onSave, extra = {}) =>
  ({ kind: "condition", target: "targets", condition, onSave, ...extra });
const say = (onSave, text) => ({ kind: "note", onSave, text });
const note = (text) => ({ kind: "note", text });

const EDITS = {

  /* ─── R5: the block's one parameter discrepancy ─────────────────── */
  "Defer Fatality": (y) => { y.duration = "1 hour"; },

  /* ─── R1: the seven condition ladders ───────────────────────────── */

  "Conjuring Control": (y) => {
    y.effects = [
      say(["success"], "Free will until the end of its next turn — it acts according to its nature."),
      say(["failure", "fumble"], "You may command the creature as if you had conjured it."),
      note("Seizing a conjured creature disrupts the bond with the caster who summoned it.")
    ];
  },

  "Control Undead": (y) => {
    y.effects = [
      cond("stunned", ["success"], { value: 1 }),
      say(["partial"], "Controlled for 10 minutes."),
      say(["failure"], "Controlled for 1 day."),
      say(["fumble"], "Controlled until you release it or it is destroyed.")
    ];
    // R7 — the same sentence the nine Conjure spells carry.
    y.warps = (y.warps ?? []).map((w) => w.ppCost === 1
      ? { ...w, mods: { conjuredLevel: 1, conjuredBase: 1 } } : w);
  },

  "Crushing Despair": (y) => {
    // "As success, but the duration is 1 minute" / "As failure, and…" —
    // so each rung carries the sentence above it as well as its own.
    y.effects = [
      say(["success"], "For 1 ROUND it can't use reactions or the Delay action, and must attempt another save at the start of its turn."),
      say(["failure"], "For 1 MINUTE it can't use reactions or the Delay action, and must attempt another save at the start of its turn."),
      say(["fumble"], "For 1 minute it can't use reactions or the Delay action, must attempt another save at the start of its turn — and is automatically slowed 1 for 1 minute."),
      cond("slowed", ["fumble"], { value: 1, duration: "1 minute" })
    ];
  },

  "Dance Macabre": (y) => {
    y.effects = [
      say(["success"], "Duration 3 rounds: it must expend at least 1 AP each turn dancing."),
      say(["failure"], "Duration 1 minute: it must expend at least 2 AP each turn dancing."),
      say(["fumble"], "Duration 1 minute: it must spend ALL its actions each turn dancing."),
      // THE BLUNDER IS PRINTED AND IS NOT A BIGGER NUMBER — the same
      // shape as Bungle's, and the reason it must be declared.
      say(["blunder"], "As a fumble, but the dancing continues until the target falls from exhaustion (GM discretion).")
    ];
  },

  "Deafness": (y) => {
    y.effects = [
      cond("deafened", ["success"], { duration: "1 round" }),
      cond("deafened", ["failure"], { duration: "10 minutes" }),
      // "permanent" is a duration the parser reads since 3.586.0, built
      // for Blindness's fumble rung, which prints the same word.
      cond("deafened", ["fumble"], { duration: "permanent" })
    ];
  },

  "Deific Presence": (y) => {
    y.effects = [
      say(["success"], "Must pay tribute TWICE."),
      say(["failure"], "Must pay tribute SIX times."),
      say(["fumble"], "Must pay tribute six times — and spend all its actions paying tribute if it can.")
    ];
  },

  "Disorient": (y) => {
    y.effects = [
      say(["success"], "-1 circumstance penalty to the NEXT check it makes before the end of its next turn."),
      say(["failure"], "The next check it makes before the end of its next turn is made with DISADVANTAGE."),
      say(["fumble"], "DISADVANTAGE on all checks until the end of its next turn.")
    ];
  },

  /* ─── R1: the two damage ladders ────────────────────────────────── */

  "Dangerous Vision": (y) => {
    y.effects = [{
      kind: "saveLadder", target: "targets", damageType: "mental",
      ladder: { critical: "", success: "1d8", partial: "2d8", failure: "4d8", fumble: "6d8" },
      criticalOn: { partial: "minor", failure: "serious", fumble: "deadly" }
    }];
  },

  "Disintegrate": (y) => {
    // EVERY RUNG DOES DAMAGE, including the Critical — this spell prints
    // no harmless outcome at all, so there is no empty rung.
    y.effects = [{
      kind: "saveLadder", target: "targets", damageType: "force",
      ladder: { critical: "2d10", success: "6d10", failure: "12d10", fumble: "24d10" },
      criticalOn: {}
    }];
  },

  /* ─── R2: the spell that prints two ladders ─────────────────────── */

  "Disturbing Tentacles": (y) => {
    /*
     * GRAHAM'S RULING, 24 September 2026: the first save is made at the
     * casting for everyone in the area; the second at the END of each
     * turn, for a creature still standing in it.
     *
     * So the Reflex ladder is the ordinary one and the Will ladder rides
     * `recurring` — see magic/save-ladder.mjs. The GRAB is not part of
     * either ladder (a ladder scales dice); it is an `onSave` row gated
     * on the same Reflex degree, which is how Apocalypse pairs a ladder
     * with its prose.
     */
    y.effects = [
      {
        kind: "saveLadder", target: "targets", damageType: "bludgeoning",
        ladder: { critical: "", success: "1d10", failure: "2d10", fumble: "4d10" },
        criticalOn: { fumble: "minor" },
        recurring: {
          save: "will", on: "endOfTurn", damageType: "mental",
          ladder: { success: "", failure: "1d10", fumble: "2d10" },
          criticalOn: { fumble: "minor" }
        }
      },
      cond("grabbed", ["failure", "fumble"]),
      say(["success"], "Not grappled — the tentacles only strike."),
      note("The tentacles' Escape DC equals your Spell DC. A tentacle may be attacked: its DB equals your Spell DC and it is destroyed by 10 or more damage — but more grow until the duration ends.")
    ];
  },

  /* ─── R7: the warps that had a key waiting ──────────────────────── */

  "Create Undead": (y) => {
    y.warps = (y.warps ?? []).map((w) => w.ppCost === 1
      ? { ...w, mods: { conjuredLevel: 1, conjuredBase: 1 } } : w);
  },

  "Dead Tongue": (y) => {
    y.warps = (y.warps ?? []).map((w) =>
      /add one target/i.test(String(w.text)) ? { ...w, mods: { extraTargets: 1 } } : w);
  },

  "Darkvision": (y) => {
    y.warps = (y.warps ?? []).map((w) =>
      /range is touch/i.test(String(w.text))
        ? { ...w, mods: { rangeOverride: "touch", targetCap: 1 } } : w);
  },

  "Dimension Door": (y) => {
    y.warps = (y.warps ?? []).map((w) =>
      /range increases to 1 mile/i.test(String(w.text))
        ? { ...w, mods: { rangeOverride: "1 mile" } } : w);
  },

  "Deflections": (y) => {
    y.warps = (y.warps ?? []).map((w) =>
      /increase the penalty/i.test(String(w.text))
        ? { ...w, mods: { bonusValue: 1, bonusMax: 10 } } : w);
  }
};

const db = new ClassicLevel("packs/spells", { valueEncoding: "json" });
await db.open();
const done = [];
for await (const [key, value] of db.iterator()) {
  if (!Object.prototype.hasOwnProperty.call(EDITS, value?.name)) continue;
  EDITS[value.name](value.system);
  await db.put(key, value);
  done.push(value.name);
}
await db.close();
console.log(`authored ${done.length}: ${done.sort().join(", ")}`);
const missing = Object.keys(EDITS).filter((n) => !done.includes(n));
if (missing.length) { console.error(`MISSING from the pack: ${missing.join(", ")}`); process.exit(1); }
