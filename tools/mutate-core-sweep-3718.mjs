#!/usr/bin/env node
/**
 * mutate-core-sweep-3718 — can verify-core-sweep-3718 fail?
 *
 * NEW at 3.718.0. SURVIVED and an unmatched anchor are both failures.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const RELAY = path.join(SYSTEM_ROOT, "module", "combat", "target-relay.mjs");
const LIVE = path.join(SYSTEM_ROOT, "module", "combat", "target-relay-workflow.mjs");
const EFFECTS = path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs");
const CONJURED = path.join(SYSTEM_ROOT, "module", "magic", "conjured-item.mjs");
const WRITES = path.join(SYSTEM_ROOT, "module", "combat", "relayed-writes.mjs");
const PENDING = path.join(SYSTEM_ROOT, "module", "pending-modifiers.mjs");
const CASTWF = path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs");
const STORM = path.join(SYSTEM_ROOT, "module", "magic", "storm-workflow.mjs");
const FORCED = path.join(SYSTEM_ROOT, "module", "combat", "forced-movement-workflow.mjs");
const STASIS = path.join(SYSTEM_ROOT, "module", "magic", "stasis-workflow.mjs");
const CSAVE = path.join(SYSTEM_ROOT, "module", "magic", "condition-save-workflow.mjs");
const CUT = path.join(SYSTEM_ROOT, "module", "magic", "cutting-words-workflow.mjs");
const WALLWF = path.join(SYSTEM_ROOT, "module", "magic", "wall-spell-workflow.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-core-sweep-3718.mjs");

const MUTATIONS = [
  { file: RELAY, name: "the caster's ownership is not checked",
    from: '      if (deps.userOwns?.(observer, String(request?.userId ?? "")) !== true) return { ok: false, reason: "the asker does not own the caster" };',
    to: "", breaks: "A7 — any player could charm the GM's creature toward anybody" },
  { file: RELAY, name: "the observer is taken from the payload",
    from: '        ? await deps.charmAttitude(target, observer.uuid, String(payload.floor ?? ""), seconds)',
    to: '        ? await deps.charmAttitude(target, String(payload.observerUuid), String(payload.floor ?? ""), seconds)',
    breaks: "A3" },
  { file: RELAY, name: "an unknown mode is treated as a charm",
    from: '      if (mode !== "charm" && mode !== "step") return { ok: false, reason: `not an attitude operation: ${mode}` };',
    to: "", breaks: "A8" },
  { file: RELAY, name: "a non-numeric duration passes",
    from: '      if (seconds !== null && !Number.isFinite(seconds)) return { ok: false, reason: "not a duration" };',
    to: "", breaks: "A10" },
  { file: RELAY, name: "the step count is dropped",
    from: "Math.trunc(Number(payload.steps) || 0), seconds);",
    to: "0, seconds);", breaks: "A6" },
  { file: RELAY, name: "a failed conjuration reports success",
    from: '      return made ? { ok: true, result: { id: made.id, name: made.name } } : { ok: false, reason: "the item could not be made" };',
    to: "      return { ok: true, result: made };", breaks: "B6" },
  { file: RELAY, name: "a conjure with no spec is attempted",
    from: '      if (!spec) return { ok: false, reason: "no item named" };',
    to: "", breaks: "B5" },
  { file: RELAY, name: "the conjuration's clock is lost",
    from: "        expires: payload.expires === true,",
    to: "        expires: true,", breaks: "B3" },
  { file: LIVE, name: "the GM's client skips the attitude check",
    from: "      if (!isAttitude(floor)) return null;",
    to: "", breaks: "A14" },
  { file: LIVE, name: "the GM's client skips the pack allow-list",
    from: '      const clean = normaliseConjuredItem({ kind: "conjureItem", ...spec });\n      if (!clean) return null;',
    to: '      const clean = spec;', breaks: "B7" },
  { file: EFFECTS, name: "the charm writes directly again",
    from: "          const moved = await relayAttitude(target, {",
    to: "          const moved = await (async (t) => t)(target, {", breaks: "A11" },
  { file: EFFECTS, name: "a refused charm reads as unchanged",
    from: "          if (!moved) {\n            lines.push(line(`<em>${target.name}'s attitude could not be changed",
    to: "          if (false) {\n            lines.push(line(`<em>${target.name}'s attitude could not be changed", breaks: "A13" },
  { file: EFFECTS, name: "the conjuration writes directly again",
    from: "          const conjured = await relayConjureItem(target, spec, conjureOpts,",
    to: "          const conjured = await (async (t) => t)(target, spec, conjureOpts,", breaks: "B8" },
  { file: EFFECTS, name: "a refusal blames the compendium again",
    from: "            lines.push(line(conjured.reason\n              ? conjuredItemRefusedLine",
    to: "            lines.push(line(false\n              ? conjuredItemRefusedLine", breaks: "B9" },
  { file: CONJURED, name: "the refusal line drops the reason",
    from: '    + `${reason ? ` (${reason})` : ""} &mdash; nothing was created.</em>`;',
    to: '    + ` &mdash; nothing was created.</em>`;', breaks: "B10" },
  { file: RELAY, name: "any flag may be written",
    from: '      if (!SPELL_RELAY_FLAGS.includes(key)) return { ok: false, reason: `not a spell\'s record: ${key}` };',
    to: "", breaks: "C3" },
  { file: RELAY, name: "the allow-list grows a flag",
    // RE-ANCHORED AT 3.719.0: the list ends with reliefUsedToday now.
    from: '  "reliefUsedToday"\n]);',
    to: '  "reliefUsedToday", "attitude"\n]);', breaks: "C0/C3" },
  { file: RELAY, name: "a scalar record passes",
    from: '      if (value !== null && typeof value !== "object") return { ok: false, reason: "not a record" };',
    to: "", breaks: "C4" },
  { file: RELAY, name: "any item type may be granted",
    from: '    if (item.type !== "ability") return `not an ability: ${item.type}`;',
    to: "", breaks: "D3" },
  { file: RELAY, name: "an unstamped item may be granted",
    from: `    if (item.flags?.[SYSTEM_ID]?.spellItem !== true) return "not a spell's grant";`,
    to: "", breaks: "D4" },
  { file: RELAY, name: "any behaviour type may be created",
    from: '    if (!b || typeof b !== "object" || !RELAY_REGION_BEHAVIOUR_TYPES.includes(b.type)) return `not a relayable behaviour: ${b?.type}`;',
    to: "", breaks: "E3" },
  { file: RELAY, name: "the region's placer is not checked",
    from: '  if (!askerPlacedRegion) return "the asker did not place that region";',
    to: "", breaks: "E4" },
  { file: WRITES, name: "every document is relayed",
    from: '  return doc?.isOwner === false && typeof game !== "undefined" && game?.user?.isGM !== true;',
    to: "  return true;", breaks: "C6/C9" },
  { file: WRITES, name: "a null value is set, not unset",
    from: "    return value === null ? doc.unsetFlag(SYSTEM_ID, key) : doc.setFlag(SYSTEM_ID, key, value);",
    to: "    return doc.setFlag(SYSTEM_ID, key, value);", breaks: "C7" },
  { file: WRITES, name: "region behaviours are gated on ownership",
    from: "BehaviorClass?.canUserCreate?.(game.user) === true;",
    to: "region?.isOwner === true;", breaks: "E8" },
  { file: PENDING, name: "the pending modifier is written directly again",
    from: "  if ((await setTargetFlag(actor, FLAG, [...existing, record])) === false) return null;",
    to: "  await actor.setFlag(SYSTEM_ID, FLAG, [...existing, record]);", breaks: "C10" },
  { file: EFFECTS, name: "the prison is written directly again",
    from: "            if ((await setTargetFlag(prisoner, PRISON_FLAG, {",
    to: "            if ((await prisoner.setFlag(SYSTEM_ID, PRISON_FLAG, {", breaks: "C12/C13" },
  { file: EFFECTS, name: "the speed grant is created directly again",
    from: "          const [madeSpeed] = await createTargetSpellItems(target, [{",
    to: '          const [madeSpeed] = await target.createEmbeddedDocuments("Item", [{', breaks: "D6" },
  { file: CASTWF, name: "the ground's refusal is silent",
    from: "          lines.push(line(`<em>${spell.name}: the GM's client did not make the ground difficult — mark it by hand.</em>`));",
    to: "", breaks: "E6" },
  { file: STORM, name: "the storm's ground is created directly again",
    from: "    await createSpellRegionBehaviours(region, behaviours);",
    to: '    await region.createEmbeddedDocuments("RegionBehavior", behaviours);', breaks: "E7" },
  { file: RELAY, name: "a stray stamp key passes",
    from: "      if (stray) return { ok: false, reason: `not a stamp: ${stray}` };",
    to: "", breaks: "F2" },
  { file: RELAY, name: "any effect may be removed",
    from: `        if (!deps.isSpellEffect(effect)) return { ok: false, reason: "only a spell's own effect may be removed" };`,
    to: "", breaks: "F6" },
  { file: RELAY, name: "an effect off the target is stamped",
    from: '      if (!effect) return { ok: false, reason: "effect not found on that target" };',
    to: "      if (false) return null;", breaks: "F3" },
  { file: RELAY, name: "the forced move's source ownership is not checked",
    from: '      if (deps.userOwns?.(source, String(request?.userId ?? "")) !== true) return { ok: false, reason: "the asker does not own the source creature" };',
    to: "", breaks: "G2" },
  { file: RELAY, name: "the forced move's distance is not bounded",
    from: "      if (!Number.isFinite(feet) || feet <= 0 || feet > FORCED_MOVE_MAX_FEET) return { ok: false, reason: \"not a distance\" };",
    to: "", breaks: "G3/G4" },
  { file: FORCED, name: "forceMoveAway writes the token directly again",
    from: "  if (!direct && targetToken?.isOwner === false && game?.user?.isGM !== true) {",
    to: "  if (false) {", breaks: "G5" },
  { file: LIVE, name: "the GM's pass asks itself",
    from: "      return forceMoveAway(source, target, feet, { direct: true });",
    to: "      return forceMoveAway(source, target, feet);", breaks: "G6" },
  { file: STASIS, name: "Stasis creates directly again",
    from: "  await createEffectsOn(target, [{\n    name: spec.label,",
    to: '  await target.createEmbeddedDocuments("ActiveEffect", [{\n    name: spec.label,', breaks: "H4" },
  { file: CSAVE, name: "the escape save is stamped directly again",
    from: "  if (!(await setEffectFlags(effect, { [CONDITION_SAVE_FLAG]: descriptor }))) return null;",
    to: "  await effect.setFlag(SYSTEM_ID, CONDITION_SAVE_FLAG, descriptor);", breaks: "F7" },
  { file: CUT, name: "Cutting Words writes directly again",
    from: "  if ((await setTargetFlag(target, CUTTING_WORDS_FLAG, record)) === false) return null;",
    to: "  await target.setFlag(SYSTEM_ID, CUTTING_WORDS_FLAG, record);", breaks: "H1" },
  { file: RELAY, name: "the wall's placer is not checked",
    from: '      if (deps.userPlacedRegion?.(target, String(request?.userId ?? "")) !== true) return { ok: false, reason: "the asker did not place that region" };\n      const segments',
    to: "      const segments", breaks: "I2" },
  { file: RELAY, name: "a segment keeps its other fields",
    from: "    out.push({ c, move: sense(w.move), sight: sense(w.sight), light: sense(w.light), sound: sense(w.sound) });",
    to: "    out.push({ ...w, c, move: sense(w.move), sight: sense(w.sight), light: sense(w.light), sound: sense(w.sound) });", breaks: "I4" },
  { file: RELAY, name: "a malformed segment passes",
    from: "    if (c.length !== 4 || !c.every(Number.isFinite)) return null;",
    to: "", breaks: "I3" },
  { file: WALLWF, name: "a player's wall is created directly again",
    from: "      const count = await relaySpellWalls(region, docs.map(({ c, move, sight, light, sound }) => ({ c, move, sight, light, sound })), castId);",
    to: '      const count = (await canvas.scene.createEmbeddedDocuments("Wall", docs)).length;', breaks: "I6" }
];

function run() {
  try {
    execFileSync(process.execPath, [CHECK], { stdio: ["ignore", "pipe", "pipe"] });
    return true;
  } catch {
    return false;
  }
}

const guard = guardFiles([RELAY, LIVE, EFFECTS, CONJURED, WRITES, PENDING, CASTWF, STORM, FORCED, STASIS, CSAVE, CUT, WALLWF, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-core-sweep-3718: verify already fails on an unmodified tree.\n");
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
    ? `\nmutate-core-sweep-3718: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-core-sweep-3718: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
