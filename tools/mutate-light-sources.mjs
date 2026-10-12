#!/usr/bin/env node
/**
 * mutate-light-sources — can verify-light-sources fail?
 *
 * NEW at 3.396.0. SURVIVED and an unmatched anchor are both failures.
 *
 * EVERY MUTATION INTRODUCES A DEFECT. None loosens a guard — a relaxed
 * check cannot fail on a clean tree, which is how seven of the first
 * eight mutations written for verify-spell-book-fields survived and
 * proved nothing.
 *
 * #1 IS THE MISTAKE THIS WHOLE MODULE EXISTS TO AVOID: reusing the
 * sense rule for a light source. It is the tidy an experienced reader
 * would suggest, it produces entirely plausible numbers, and it silently
 * gives every candle in the game the wrong ceiling and lets torches burn
 * in Supernatural Darkness.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const SRC = path.join(SYSTEM_ROOT, "module", "light-sources.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-light-sources.mjs");
const WORKFLOW = path.join(SYSTEM_ROOT, "module", "light-workflow.mjs");

const MUTATIONS = [
  {
    name: "THE TIDY: the per-source cap becomes the universal sense cap",
    file: SRC,
    from: "  const cap = Number.isFinite(Number(entry.cap)) ? clampLevel(Number(entry.cap)) : 10;",
    to: "  const cap = 8;",
    breaks: "A4/C7/E2 — a candle reaches Bright Light and the printed ceilings stop meaning anything"
  },
  {
    name: "a mundane torch burns in Supernatural Darkness",
    file: SRC,
    from: "  if (!entry.magical && level <= MUNDANE_NEGATED_AT_OR_BELOW) return level;",
    to: "  if (false) return level;",
    breaks: "C1/D6/E1 — the whole reason `magical` exists"
  },
  {
    name: "magic penetrates Abyssal Darkness",
    file: SRC,
    from: "  if (level <= ALL_NEGATED_AT_OR_BELOW) return level;",
    to: "  if (false) return level;",
    breaks: "C3 — 'devours all light' stops being true for the magical sources"
  },
  {
    // THE FLAG IS READ, BUT INVERTED. Subtler than deleting the check.
    name: "the magical flag is read backwards",
    file: SRC,
    from: "  if (!entry.magical && level <= MUNDANE_NEGATED_AT_OR_BELOW) return level;",
    to: "  if (entry.magical && level <= MUNDANE_NEGATED_AT_OR_BELOW) return level;",
    breaks: "C1/C2/D6 — torches work in magical darkness and spells do not"
  },
  {
    name: "a carried torch dims a Radiant room to its own cap",
    file: SRC,
    from: "  if (level >= cap) return level;",
    to: "  if (false) return level;",
    breaks: "C4/C7b — the cap applies to the ROOM instead of to the RAISE"
  },
  {
    name: "Darkness ignores its printed floor",
    file: SRC,
    from: "    return Math.max(clampLevel(Number(entry.floor)), level + steps);",
    to: "    return clampLevel(level + steps);",
    breaks: "C9/C10/C11 — Darkness reaches Supernatural and starts killing torches"
  },
  {
    // THE MUTATION THAT SURVIVED, AIMED SOMEWHERE REACHABLE. It used to
    // remove a `?? 1` fallback in applyLightSource, which no input could
    // reach because Darkness always declares a floor. The fallback is now
    // gone and the invariant is checked instead, so the way to break this
    // is to break the TABLE — which is where the mistake would really be.
    name: "a lowering source loses its floor",
    file: SRC,
    from: "    steps: -4, floor: 3, magical: true, radiusFeet: 20",
    to: "    steps: -4, magical: true, radiusFeet: 20",
    breaks: "A10a — with no fallback left, an absent floor is NaN and Darkness stops resolving"
  },
  {
    name: "a raising source loses its cap key entirely",
    file: SRC,
    from: '    label: "Torch", item: "Torch", pack: "gear",\n    steps: 2, cap: 7, magical: false',
    to: '    label: "Torch", item: "Torch", pack: "gear",\n    steps: 2, magical: false',
    breaks: "A10c — a forgotten field must not read as 'no ceiling'"
  },
  {
    name: "a source stops declaring whether it is magical",
    file: SRC,
    from: '    label: "Light", item: "Light", pack: "spells",\n    steps: 2, cap: 8, magical: true',
    to: '    label: "Light", item: "Light", pack: "spells",\n    steps: 2, cap: 8',
    breaks: "A10e/C2 — undefined reads as mundane and the Light spell dies in Supernatural Darkness"
  },
  {
    name: "light sources stack",
    file: SRC,
    from: "    best = Math.max(best, applyLightSource(level, entry));",
    to: "    best = Math.max(best, applyLightSource(best, entry));",
    breaks: "D1/D2 — two torches compound instead of the brightest winning"
  },
  {
    name: "the dimmest source wins instead of the brightest",
    file: SRC,
    from: "    best = Math.max(best, applyLightSource(level, entry));",
    to: "    best = Math.min(best, applyLightSource(level, entry));",
    breaks: "D2 — a candle beside a torch makes the room darker"
  },
  {
    name: "overlapping Darkness globes compound",
    file: SRC,
    from: "    level = Math.min(level, applyLightSource(base, entry));",
    to: "    level = Math.min(level, applyLightSource(level, entry));",
    breaks: "D7 — two globes are deeper than one"
  },
  {
    // ORDER. Raising before darkening lets a torch lit outside the globe
    // shine through it, which is the opposite of what Darkness is for.
    name: "light resolves before darkness",
    file: SRC,
    from: "  let best = level;",
    to: "  let best = base;",
    breaks: "D5 — a torch inside Darkness raises from the undarkened room"
  },
  {
    name: "the torch-comparison sources take the spell cap of 8",
    file: SRC,
    from: '    steps: 2, cap: 7, magical: true, asTorch: true\n  }),\n  light:',
    to: '    steps: 2, cap: 8, magical: true, asTorch: true\n  }),\n  light:',
    breaks: "A7 — Graham's 25 August ruling that 'equal to a torch' carries the torch's cap"
  },
  {
    // THE BUG THE HARNESS ALREADY CAUGHT ONCE, restored.
    name: "Continual Light is looked up by a name the pack does not hold",
    file: SRC,
    from: '    label: "Continual Light", item: "Continual Light", pack: "spells",',
    to: '    label: "Continual Flame", item: "Continual Flame", pack: "spells",',
    breaks: "A1 — the Improved Combat Reflexes shape: a lookup key nothing matches"
  },
  {
    name: "Unwelcome Halo's absent cap is filled in with a guess",
    file: SRC,
    from: "    steps: 2, cap: null, magical: true, radiusFeet: 20",
    to: "    steps: 2, cap: 8, magical: true, radiusFeet: 20",
    breaks: "A8 — the book prints no ceiling and a guess must be declared, not slipped in"
  },
  {
    // THE FLAG-SHAPE LESSON FROM 3.395.0, checked before it can repeat.
    name: "the light flag is written under a name nothing reads",
    file: SRC,
    from: "  return { lightSource: String(key) };",
    to: "  return { lightSourceKey: String(key) };",
    breaks: "G-series — the applier and the reader stop agreeing, in silence"
  },
  {
    name: "a disabled light effect still sheds light",
    file: SRC,
    from: "    if (effect?.disabled) continue;\n    const key = String(effect.flags?.[\"trg-prime\"]?.lightSource ?? \"\").trim();",
    to: "    const key = String(effect.flags?.[\"trg-prime\"]?.lightSource ?? \"\").trim();",
    breaks: "G — a GM who unticks the effect cannot put the light out"
  },
  {
    name: "an unknown light key is carried anyway",
    file: SRC,
    from: "    if (isLightSourceKey(key)) keys.push(key);",
    to: "    if (key) keys.push(key);",
    breaks: "G — a typo'd source reaches combinedLightLevel, which cannot resolve it"
  },
  {
    name: "a source with a printed shape loses it to the default",
    file: SRC,
    from: "  const printed = Number(entry.radiusFeet ?? entry.coneFeet);",
    to: "  const printed = Number(entry.radiusFeet);",
    breaks: "H — the bullseye lantern's printed 75-foot cone reverts to the 20-foot default"
  },
  {
    // THE LIVE BUG OF 25 AUGUST, restored as one edit. It shipped in the
    // build Graham installed and broke concealment and the perception
    // penalty for every caller — but only while a light was actually lit.
    name: "THE LIVE BUG: a bare number is returned instead of a resolution",
    file: SRC,
    from: '  return { level, source: "sources", ambient: base, keys: list };',
    to: "  return level;",
    breaks: "J1/J5 — all three callers destructure .level and get undefined"
  },
  {
    name: "the whole resolution is passed to the arithmetic",
    file: SRC,
    from: "  const level = combinedLightLevel(base, list);",
    to: "  const level = combinedLightLevel(ambient, list);",
    breaks: "J3 — Number({level:8,…}) is NaN and the fallback answers 8, right by coincidence"
  },
  {
    name: "a no-op source relabels where the light came from",
    file: SRC,
    from: "  if (level === base) return ambient;",
    to: "",
    breaks: "J6 — the sheet stops telling the player the region set their level"
  },
  {
    name: "a malformed ambient is given an invented level",
    file: SRC,
    from: "  if (!list.length || !Number.isFinite(base)) return ambient;",
    to: "  if (!list.length) return ambient;",
    breaks: "J7 — the exact silence that hid the original bug on a bright scene"
  },
  {
    // THE REASON `lit` EXISTS. Treating equipped as burning lights every
    // torch the moment it is drawn.
    name: "equipped is treated as burning",
    file: SRC,
    from: "  return itemIsLit(item);",
    to: "  return true;",
    breaks: "K2 — an unlit torch in your hand lights the room"
  },
  {
    name: "a lit torch in a closed pack sheds light",
    file: SRC,
    from: "  if (!item?.system?.equipped) return false;",
    to: "  if (false) return false;",
    breaks: "K3 — the second half of the rule, and the sillier failure of the two"
  },
  {
    name: "any gear item resolves as a light",
    file: SRC,
    from: "  return GEAR_BY_ITEM_NAME.get(String(item.name ?? \"\").trim().toLowerCase()) ?? null;",
    to: "  return GEAR_BY_ITEM_NAME.get(String(item.name ?? \"\").trim().toLowerCase()) ?? \"torch\";",
    breaks: "K4 — a coil of rope becomes a torch"
  },
  {
    name: "a weapon named Torch counts as one",
    file: SRC,
    from: '  if (!item || item.type !== "gear") return null;',
    to: "  if (!item) return null;",
    breaks: "K5 — a club called Torch starts shedding light"
  },
  {
    name: "the lit flag is read under a name nothing writes",
    file: SRC,
    from: '  return item?.flags?.["trg-prime"]?.[LIT_FLAG] === true;',
    to: '  return item?.flags?.["trg-prime"]?.burning === true;',
    breaks: "K1/K6b — the sheet writes `lit` and the rules read something else"
  },
  {
    name: "the gear name match stops normalising",
    file: SRC,
    from: "  return GEAR_BY_ITEM_NAME.get(String(item.name ?? \"\").trim().toLowerCase()) ?? null;",
    to: "  return GEAR_BY_ITEM_NAME.get(String(item.name ?? \"\")) ?? null;",
    breaks: "K6 — a world copy renamed in case silently stops being a light"
  },
  {
    name: "gear never reaches the one function that answers for both",
    file: SRC,
    from: "  keys.push(...litGearKeysOn(actor));",
    to: "  void litGearKeysOn;",
    breaks: "K8 — the ladder, the glow and the restore check all stop seeing torches"
  },
  {
    // WARN-NOT-BLOCK, INVERTED. The message would read as a refusal.
    name: "the fire-starter warning is produced when one IS carried",
    file: SRC,
    from: "  return has ? null : `No ${FIRE_STARTER} carried — lit anyway; a GM may rule otherwise.`;",
    to: "  return has ? `No ${FIRE_STARTER} carried — lit anyway; a GM may rule otherwise.` : null;",
    breaks: "L1/L2 — the warning appears exactly when it should not"
  },
  {
    name: "the fire-starter match becomes a contains",
    file: SRC,
    from: '    .some((n) => String(n ?? "").trim().toLowerCase() === wanted);',
    to: '    .some((n) => wanted.includes(String(n ?? "").trim().toLowerCase()));',
    breaks: "L7 — a Flintlock, or anything whose name is a substring, starts fires"
  },
  {
    // THE LIVE BUG OF 3.397.0, in the place it now lives. The sheet used
    // to draw a glow whenever a light was lit, without asking whether it
    // was shedding — this is that mistake reduced to one line.
    name: "THE LIVE BUG: a glow is chosen for a source that sheds nothing",
    file: SRC,
    from: "    if (!entry || Number(entry.steps) <= 0) continue;",
    to: "    if (!entry) continue;",
    breaks: "M8 — a Darkness source gets drawn as a light"
  },
  {
    name: "the dimmest carried source is drawn",
    file: SRC,
    from: "      entry.steps !== bestEntry.steps ? entry.steps > bestEntry.steps",
    to: "      entry.steps !== bestEntry.steps ? entry.steps < bestEntry.steps",
    breaks: "M5/M6/M9 — the glow shows a candle while a torch sets the level"
  },
  {
    name: "the cap stops breaking a tie on steps",
    file: SRC,
    from: "      : (entry.cap ?? 10) !== (bestEntry.cap ?? 10) ? (entry.cap ?? 10) > (bestEntry.cap ?? 10)",
    to: "      : false ? false",
    breaks: "M7 — a torch is drawn where the Light spell is setting the level"
  },
  {
    // THE LIVE BUG OF 3.397.1, restored as one edit. The config omitted
    // `angle` for everything but the bullseye lantern, and Foundry's
    // update MERGES — so a torch lit after a bullseye inherited the
    // lantern's 53° wedge. Right numbers, wrong picture, and only after
    // one particular order of events.
    name: "THE LIVE BUG: a config field is omitted and inherited by the merge",
    file: SRC,
    from: "    angle: Number(entry.coneFeet) > 0 ? 53 : 360,",
    to: "    ...(Number(entry.coneFeet) > 0 ? { angle: 53 } : {}),",
    breaks: "N1/N2 — the bullseye's cone sticks to the next light drawn"
  },
  {
    name: "the printed cone is drawn as a full circle",
    file: SRC,
    from: "    angle: Number(entry.coneFeet) > 0 ? 53 : 360,",
    to: "    angle: 360,",
    breaks: "N3 — the bullseye lantern's 75-foot cone stops being a cone"
  },
  {
    name: "a lowering source is drawn as a light",
    file: SRC,
    from: "  if (!entry || Number(entry.steps) <= 0) return null;",
    to: "  if (!entry) return null;",
    breaks: "N6 — a Darkness globe draws a glow"
  },
  {
    name: "a printed step count is mistyped",
    file: SRC,
    from: '    label: "Candle", item: "Candle", pack: "gear",\n    steps: 1, cap: 5, magical: false',
    to: '    label: "Candle", item: "Candle", pack: "gear",\n    steps: 2, cap: 5, magical: false',
    breaks: "A1c/A3 — the pack's terse line and the book both say one step"
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

const guard = guardFiles([SRC, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-light-sources: verify already fails on an unmodified tree.\n");
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
    ? `\nmutate-light-sources: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-light-sources: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
