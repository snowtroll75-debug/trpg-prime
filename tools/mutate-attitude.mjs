#!/usr/bin/env node
/** mutate-attitude — can verify-attitude fail? NEW at 3.408.0. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const A = path.join(SYSTEM_ROOT, "module", "attitude.mjs");
const P = path.join(SYSTEM_ROOT, "module", "effect-parser.mjs");
const W = path.join(SYSTEM_ROOT, "module", "combat", "action-workflow.mjs");
const AW = path.join(SYSTEM_ROOT, "module", "attitude-workflow.mjs");
const FX = path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-attitude.mjs");

const MUTATIONS = [
  // INVERTED AT 3.559.0. This used to put "indifferent" in and call that
  // the other game's word. Page 82 defines the ladder and indifferent IS
  // the printed rung; the mutation that matters now is the one that puts
  // the old spelling back.
  { name: "the middle rung goes back to this system's own old word",
    from: '  "hostile", "unfriendly", "indifferent", "friendly", "helpful"',
    to: '  "hostile", "unfriendly", "neutral", "friendly", "helpful"',
    breaks: "A2/A3 — page 82 prints Indifferent and calls it the default" },
  { name: "the alias stops being read, so saved data resets",
    from: 'const ATTITUDE_ALIASES = Object.freeze({ neutral: "indifferent" });',
    to: "const ATTITUDE_ALIASES = Object.freeze({});",
    breaks: "A3c — every attitude recorded before the rename would read as unknown" },
  { name: "the alias is written back instead of the printed word",
    from: "  next[key] = resolved;",
    to: "  next[key] = clean(step);",
    breaks: "D2b — the old spelling would live in the data for ever and the rename never finish" },
  { name: "the ladder is sorted alphabetically",
    from: 'export const ATTITUDE_STEPS = Object.freeze([',
    to: 'export const ATTITUDE_STEPS = Object.freeze([].concat([',
    breaks: "syntax — the order IS the model" },
  { name: "a shift wraps instead of clamping",
    from: "  const to = Math.max(0, Math.min(ATTITUDE_STEPS.length - 1, from + by));",
    to: "  const to = ((from + by) % ATTITUDE_STEPS.length + ATTITUDE_STEPS.length) % ATTITUDE_STEPS.length;",
    breaks: "B5/B6 — a fumbled Coerce on an unfriendly creature makes it helpful" },
  { name: "an unrecorded pair starts hostile",
    from: 'export const DEFAULT_ATTITUDE = "indifferent";',
    to: 'export const DEFAULT_ATTITUDE = "hostile";',
    breaks: "C2 — every NPC the party has never met is an enemy" },
  { name: "an unknown word maps to the default instead of being refused",
    from: "  return at === -1 ? null : at;",
    to: "  return at === -1 ? 2 : at;",
    breaks: "A4 — any word at all would silently become the middle rung" },
  { name: "an unknown step is written to the record",
    from: "  if (!key || !resolved) return next;",
    to: "  if (!key) return next;",
    breaks: "D2 — a value that reads back as the default for ever" },
  { name: "the record is mutated in place",
    from: "  const next = { ...(record ?? {}) };\n  const resolved",
    to: "  const next = record ?? {};\n  const resolved",
    // CARRIES ONE LINE IT DOES NOT CHANGE, on purpose: the line it does
    // change appears twice in the file, and the neighbour is what tells
    // the two apart. Declared rather than trimmed, because trimming it
    // would make the anchor ambiguous instead of narrow.
    breaks: "D4 — the change appears to work and vanishes on reload" },
  { name: "a write drops every other pair",
    from: "  const next = { ...(record ?? {}) };\n  const resolved =",
    to: "  const next = {};\n  const resolved =",
    breaks: "D5 — impressing the bard makes the ogre forget the paladin" },
  { name: "the shift reports but does not write",
    from: "    record: withAttitude(record, observerUuid, to),",
    to: "    record: record ?? {},",
    breaks: "E2 — the card announces a move that did not happen" },
  { name: "a clamped no-op claims it moved",
    from: "    moved: from !== to",
    to: "    moved: true",
    breaks: "E3 — a helpful creature is reported as becoming more helpful" },
  { name: "the Request gate accepts neutral",
    from: "  return a >= b;",
    to: "  return a >= b - 1;",
    breaks: "F1 — an NPC who merely tolerates you grants requests" },
  { file: P, name: "a requirement sentence is read as a shift",
    from: "  const match = str.match(\n    /\\battitude\\b[^.]*?\\b(improves?|increases?|decreases?|drops?|worsens?|lowers?)\\b[^.]*?\\bby\\s+(one|two|three|a|1|2|3)\\s+steps?/i\n  );",
    to: "  const match = str.match(/\\battitude\\b[^.]*?\\b(one|two|three|a|1|2|3)\\b/i) && [null, \"improves\", \"one\"];",
    breaks: "H5 — Request's requirement moves an attitude every time anyone asks" },
  { file: P, name: "a worsening is read as an improvement",
    from: "  const worse = /^(decreases?|drops?|worsens?|lowers?)$/i.test(match[1]);",
    to: "  const worse = false;",
    breaks: "H3/H4 — a fumbled Coerce makes the target friendlier" },
  { file: P, name: "the step size is always one",
    from: "  const size = WORDS[String(match[2]).toLowerCase()];",
    to: "  const size = 1;",
    breaks: "H1 — a critical Make an Impression moves one step instead of two" },
  { file: W, name: "the workflow stops applying the shift",
    from: "          const moved = await shiftAttitudeToward(targetActor, actor?.uuid ?? \"\", steps);",
    to: "          const moved = { from: \"neutral\", to: \"neutral\", moved: false };",
    breaks: "I2 — the card prints and nothing is recorded" },
  { file: W, name: "the attitude is recorded toward the wrong person",
    from: "shiftAttitudeToward(targetActor, actor?.uuid ?? \"\", steps)",
    to: "shiftAttitudeToward(targetActor, targetActor?.uuid ?? \"\", steps)",
    breaks: 'I2 — the NPC forms an opinion of itself rather than of you' },
  { file: AW, name: "the workflow writes even when nothing moved",
    from: "  if (result.moved) await subject.setFlag(SYSTEM_ID, ATTITUDE_FLAG, result.record);",
    to: "  await subject.setFlag(SYSTEM_ID, ATTITUDE_FLAG, result.record);",
    breaks: "I5" },
  { name: "Request's gate lets a neutral NPC through",
    from: '    atLeast: "friendly",',
    to: '    atLeast: "neutral",',
    breaks: "J1 — an NPC who merely tolerates you grants requests" },
  { name: "Command an Animal stops failing on a hostile animal",
    from: '    failsAtOrBelow: "unfriendly",',
    to: '    failsAtOrBelow: "hostile",',
    breaks: "J2 — an unfriendly animal takes orders the book says it refuses" },
  { name: "the gate direction is inverted",
    from: "  if (gate.atLeast) return { allowed: attitudeAtLeast(attitude, gate.atLeast), gate, attitude };",
    to: "  if (gate.atLeast) return { allowed: attitudeAtMost(attitude, gate.atLeast), gate, attitude };",
    breaks: "J1 — only hostile NPCs grant requests" },
  { name: "an ungated action is gated",
    from: "  if (!gate) return { allowed: true, gate: null, attitude };",
    to: "  if (!gate) return { allowed: false, gate: null, attitude };",
    breaks: "J3 — Make an Impression becomes impossible" },
  { file: W, name: "the workflow stops enforcing the gate",
    from: "    if (!gate.allowed) {",
    to: "    if (false) {",
    breaks: "K3 — the requirement is computed and ignored" },
  { name: "THE LIVE DEFECT: the raw uuid is used as a storage key",
    from: '  return String(observerUuid ?? "").trim().replaceAll(".", "_");',
    to: '  return String(observerUuid ?? "").trim();',
    breaks: "L1/L6 — setFlag nests the dotted key and no read ever finds it again" },
  { name: "the reader and the writer key differently",
    from: "  const key = attitudeKey(observerUuid);\n  if (!key) return DEFAULT_ATTITUDE;",
    to: '  const key = String(observerUuid ?? "").trim();\n  if (!key) return DEFAULT_ATTITUDE;',
    breaks: "L6b — two spellings of one key, the markerFlagData lesson exactly" },
  { name: "a charm DOWNGRADES a helpful creature",
    from: "  return at >= to ? shiftAttitude(current, 1) : ATTITUDE_STEPS[to];",
    to: "  return ATTITUDE_STEPS[to];",
    breaks: "N3/N4 — a helpful creature is knocked back to friendly by being charmed" },
  { name: "a charm becomes a plain shift",
    from: "  return at >= to ? shiftAttitude(current, 1) : ATTITUDE_STEPS[to];",
    to: "  return shiftAttitude(current, 1);",
    breaks: "N1 — a hostile creature ends merely unfriendly, not friendly" },
  { name: "a lapsed spell erases the conversation underneath it",
    from: "  return temporaryAttitude(tempRecord, observerUuid, now)\n    ?? attitudeToward(baseRecord, observerUuid);",
    to: "  return temporaryAttitude(tempRecord, observerUuid, now) ?? DEFAULT_ATTITUDE;",
    breaks: "M6b — a charm wearing off makes the target forget you impressed them" },
  { name: "the base wins over a live spell",
    from: "  return temporaryAttitude(tempRecord, observerUuid, now)\n    ?? attitudeToward(baseRecord, observerUuid);",
    to: "  return attitudeToward(baseRecord, observerUuid);",
    breaks: "M6 — every charm is inert" },
  { name: "a temporary attitude never lapses",
    from: "  return Number(now) < Number(entry.until) ? clean(entry.step) : null;",
    to: "  return clean(entry.step);",
    breaks: "M3 — a 1-minute Tame lasts for ever" },
  { name: "an unlimited entry lapses immediately",
    from: "  if (entry.until === null || entry.until === undefined) return clean(entry.step);",
    to: "  if (entry.until === null || entry.until === undefined) return null;",
    breaks: "M7 — Thrall's fumble does nothing" },
  { name: "pruning drops the unlimited entries too",
    from: "    if (entry.until === null || entry.until === undefined || Number(now) < Number(entry.until)) {",
    to: "    if (Number(now) < Number(entry.until)) {",
    breaks: "M7b — Thrall's fumble is swept away on the next write" },
  { file: FX, name: "THE ONE I NEARLY SHIPPED: a spell's step is permanent",
    from: "            : await charmAttitudeByStep(target, caster?.uuid ?? \"\", steps, seconds);",
    to: "            : await shiftAttitudeToward(target, caster?.uuid ?? \"\", steps);",
    breaks: "P2 — a 1-minute Tame changes an animal's mind for good" },
  { file: FX, name: "the applier accepts an attitude the ladder does not know",
    from: "          if (floor && !isAttitude(floor)) {",
    to: "          if (false) {",
    breaks: "P3" },
  { name: "an unknown threshold opens the gate rather than closing it",
    from: "  if (b === null) return false;\n  return a >= b;",
    to: "  if (b === null) return true;\n  return a >= b;",
    breaks: "F3 — a typo in a threshold lets everything through" }
];

function run() {
  try { execFileSync(process.execPath, [CHECK], { stdio: ["ignore", "pipe", "pipe"] }); return true; }
  catch { return false; }
}

const guard = guardFiles([A, P, W, AW, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-attitude: verify already fails on an unmodified tree.\n");
    guard.release(); process.exit(2);
  }
  for (const m of MUTATIONS) {
    const file = m.file ?? A;
    const original = fs.readFileSync(file, "utf8");
    const n = original.split(m.from).length - 1;
    if (n !== 1) { results.push({ name: m.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR x${n}` }); continue; }
    fs.writeFileSync(file, original.replace(m.from, m.to));
    const survived = run();
    fs.writeFileSync(file, original);
    results.push({ name: m.name, state: survived ? "SURVIVED" : "caught", breaks: m.breaks });
  }
} finally { guard.restore(); guard.release(); }

const bad = results.filter((r) => r.state !== "caught");
for (const r of results) {
  process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
  if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`);
}
process.stdout.write(bad.length
  ? `\nmutate-attitude: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-attitude: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
