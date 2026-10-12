#!/usr/bin/env node
/**
 * mutate-effect-expiry — can verify-effect-expiry fail?
 *
 * NEW at 3.514.0.
 *
 * R1 IS THE ONE THIS FILE EXISTS FOR, and it restores the shipped defect
 * exactly: the round clock ends the effect, announces it, and leaves
 * everything the spell built standing. Three +1 pebbles that never
 * crumble; a Wild Morph claw that becomes a permanent extra attack. The
 * card is correct, the effect is gone, and the inventory is wrong for the
 * rest of the campaign.
 *
 * W1 IS ITS MIRROR, and it is why the two clocks are asserted against one
 * another rather than one at a time. Either half alone looks reasonable;
 * the failure is that they DIFFER.
 *
 * K1 IS THE ONE THAT WOULD DELETE SOMEBODY'S PROPERTY. Drop the
 * `endsWithSpell` test and Bless Water's Holy Water — a real flask the
 * caster paid ingredients for and is meant to keep — vanishes when some
 * unrelated effect from the same casting runs out.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const EA = path.join(SYSTEM_ROOT, "module", "combat", "effect-application-workflow.mjs");
const EX = path.join(SYSTEM_ROOT, "module", "combat", "effect-expiry.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-effect-expiry.mjs");

const MUTATIONS = [
  /* ── R: the round clock, and the route that was missing ────────── */
  {
    file: EA,
    name: "R1 THE THIRD ROUTE IS UNWIRED AGAIN — the shipped defect, restored",
    from: "one that was missing. See removeSpellItemsByCastId's header.\n      await removeSpellItemsByCastId(actor, castId);",
    to: "one that was missing. See removeSpellItemsByCastId's header.",
    breaks: "R2/A1 — pebbles that never crumble and a claw that never goes away"
  },
  {
    file: EA,
    name: "R2 the round clock stops knowing which cast it ended",
    from: "// as `expireSpellEffects`, for the same reason.\n      const castId = effect.getFlag?.(SYSTEM_ID, CAST_ID_FLAG) ?? null;",
    to: "// as `expireSpellEffects`, for the same reason.\n      const castId = null;",
    breaks: "R2 — the call would still be there and would find nothing to remove"
  },
  {
    file: EA,
    name: "R3 THE ROUND CLOCK ENDS EVERYTHING EARLY",
    from: "    if (Number(currentRound) < Number(expiresRound)) continue;",
    to: "    if (false) continue;",
    breaks: "R3/R4 — a minute-long buff would end on the round it was cast"
  },

  /* ── W: the world clock ────────────────────────────────────────── */
  {
    file: EA,
    name: "W1 THE WORLD CLOCK STOPS TAKING AWAY WHAT THE SPELL BUILT",
    from: "if (actor.effects.get(effect.id)) await endEffect(effect, actor);\n      await removeSpellItemsByCastId(actor, castId);",
    to: "if (actor.effects.get(effect.id)) await endEffect(effect, actor);",
    breaks: "W1c/A1 — the half that already worked stops working"
  },
  {
    file: EA,
    name: "W2 the world clock ends everything early",
    from: "    if (Number(worldTime) < Number(end)) continue;",
    to: "    if (false) continue;",
    breaks: "W2 — a spell would end the second it was cast"
  },
  {
    file: EA,
    name: "W3 A GM'S OWN EFFECT IS SWEPT AWAY",
    from: "    if (!effect.getFlag?.(SYSTEM_ID, SPELL_EFFECT_FLAG)) continue;",
    to: "    if (false) continue;",
    breaks: "W3 — manual effects are never ours to remove"
  },

  /* ── K: what may be taken ──────────────────────────────────────── */
  {
    file: EA,
    name: "K1 A FLASK THE CASTER KEEPS IS DELETED — the item stops having to say it ends",
    from: "      && i.getFlag?.(SYSTEM_ID, \"endsWithSpell\") === true)",
    to: "      )",
    breaks: "R2b/W1d — Bless Water's Holy Water is made by a spell and is meant to survive it"
  },
  {
    file: EA,
    name: "K2 ANOTHER CASTING'S ITEMS ARE TAKEN TOO",
    from: "    .filter((i) => i.getFlag?.(SYSTEM_ID, CAST_ID_FLAG) === castId",
    to: "    .filter((i) => true",
    breaks: "R2c — one spell ending would strip every temporary item on the sheet"
  },

  /* ── S: the sentence ───────────────────────────────────────────── */
  {
    file: EX,
    name: "S1 AN UNNAMED EFFECT ANNOUNCES ITSELF ANYWAY",
    from: "  if (!name) return null;",
    to: "  if (false) return null;",
    breaks: "S3 — \"<strong></strong> expires.\" says something ended and refuses to say what"
  },
  {
    file: EX,
    name: "S2 every line claims to be somebody else's",
    from: "  return `<strong>${name}</strong> expires${who ? ` on ${who}` : \"\"}.`;",
    to: "  return `<strong>${name}</strong> expires on ${who}.`;",
    breaks: "S1/S2b — \"Bless expires on .\" on every world-clock line"
  },
  {
    file: EX,
    name: "S3 THE WORDING CHANGES UNDER PLAYERS WHO HAVE READ IT FOR MONTHS",
    from: "expires${who ? ` on ${who}` : \"\"}.`;",
    to: "ends${who ? ` on ${who}` : \"\"}.`;",
    breaks: "S1 — a fix is not an excuse to reword something that worked"
  }
];

function run() {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const guard = guardFiles([EA, EX, V]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-effect-expiry: verify already fails on an unmodified tree.\n");
    guard.release(); process.exit(2);
  }
  for (const m of MUTATIONS) {
    const original = fs.readFileSync(m.file, "utf8");
    const n = original.split(m.from).length - 1;
    if (n !== 1) { results.push({ name: m.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR x${n}` }); continue; }
    fs.writeFileSync(m.file, original.replace(m.from, m.to));
    const survived = run();
    fs.writeFileSync(m.file, original);
    results.push({ name: m.name, state: survived ? "SURVIVED" : "caught", breaks: m.breaks });
  }
} finally { guard.restore(); guard.release(); }

const bad = results.filter((r) => r.state !== "caught");
for (const r of results) {
  process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
  if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`);
}
process.stdout.write(bad.length
  ? `\nmutate-effect-expiry: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-effect-expiry: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
