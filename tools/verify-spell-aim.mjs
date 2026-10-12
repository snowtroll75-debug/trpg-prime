#!/usr/bin/env node
/**
 * verify-spell-aim — the area placement says it is waiting.
 *
 * NEW at 3.592.0. Graham, 25 September 2026: "the area hang that you
 * mentioned above needs to be resolved."
 *
 * ─────────────────────────────────────────────────────────────────────
 * IT WAS NEVER A HANG, AND I REPORTED IT AS ONE.
 *
 * `placeSpellTemplate` drew a PIXI preview on the controls layer and
 * returned a promise that resolved on a canvas mousedown. No dialog, no
 * prompt, no text anywhere — so a player reading the cast card that had
 * just posted, or with the cursor off the map, saw a client that had
 * stopped responding. During the 3.591.0 live test I spent six probes
 * hunting a defect that did not exist, and only found the truth by
 * reading the function.
 *
 * FOURTH TIME IN THIS PROJECT that a waiting interaction was mistaken
 * for a broken one. Every one of those was a place where the system knew
 * exactly what it was waiting for and did not say so. That is the defect
 * this file pins closed: not the waiting, the silence.
 *
 * The three things that make it not a hang:
 *   1. a banner naming the spell and the shape being placed,
 *   2. both ways out printed on it,
 *   3. Escape actually being one of them.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { describeArea, parseSpellArea } from "../module/magic/spell-template.mjs";

let checks = 0;
const failures = [];
const ok = (label, cond, detail = "") => {
  checks += 1;
  if (!cond) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
};
const eq = (label, got, want, detail = "") =>
  ok(label, String(got) === String(want), `${JSON.stringify(got)} ≠ ${JSON.stringify(want)}${detail ? ` — ${detail}` : ""}`);

const src = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "magic", "spell-template.mjs"), "utf8");
// COMMENTS STRIPPED: a comment about a silent wait contains every word
// this file greps for.
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

/* ================================================================== *
 * A. THE BANNER EXISTS, AND IS SHOWN BY THE AIM
 * ================================================================== */

ok("A1 there is a banner to show", /function showAimBanner\(label, config, anchored\)/.test(code));
ok("A2 THE AIM SHOWS IT",
  /const removeBanner = showAimBanner\(label, config, Boolean\(token\)\);/.test(code),
  "a banner nothing calls is the defect this file exists to prevent, wearing a new hat");
ok("A2b and it is shown beside the preview, not instead of it",
  code.indexOf("drawAreaPreview(preview, config, startX, startY, 0")
    < code.indexOf("const removeBanner = showAimBanner("),
  "the preview is what makes the aim usable; the banner is what makes it findable");
ok("A3 the banner is taken down when the aim finishes",
  /const finish = \(result\) => \{[\s\S]{0,420}?removeBanner\(\);/.test(code),
  "a banner outliving its aim would sit over the map for the rest of the session");
ok("A3b and taken down on the cancel paths too, because finish is the only exit",
  (code.match(/finish\(null\)/g) ?? []).length >= 3,
  "right-click, the context handler and Escape all route through finish");

/* ================================================================== *
 * B. WHAT IT SAYS
 * ================================================================== */

ok("B1 it names what is being placed", /\$\{verb\} \$\{label\}/.test(code),
  "a GM running four casters wants to know which one the map is waiting on");
ok("B2 and the shape and distance", /const what = describeArea\(config\);/.test(code));
ok("B3 BOTH WAYS OUT ARE PRINTED",
  /right-click or <strong>Esc<\/strong> to cancel/.test(code),
  "right-click was the only exit and nothing announced it");
ok("B4 it says to click the map", /Click the map to place it/.test(code));
ok("B5 a directional area says AIM and a positioned one says POSITION",
  /const verb = config\?\.t === "cone" \|\| config\?\.t === "ray" \? "Aim" : "Position";/.test(code),
  "a line is aimed from the caster; a circle is dropped somewhere");
/*
 * B6 IS A DEFECT THE 3.591.0 LIVE TEST FOUND AND THIS RELEASE SURFACES.
 * A caster with no token on the scene anchors the area at the CENTRE OF
 * THE MAP — which, in Graham's world, is a few squares from where his
 * party stands. The placement is not changed, because a caster who is
 * not on the map has no position to offer instead; it is SAID, so
 * nobody aims a 60-foot line from the middle of the battlefield without
 * being told that is where it starts.
 */
ok("B6 A CASTER WITH NO TOKEN IS TOLD WHERE THE AREA IS ANCHORED",
  /anchored \? "" : "<br>The caster has no token on this scene, so it is anchored to the centre of the map"/
    .test(code),
  "found live on 25 September: the first Massacre of the session would have originated beside the party");
ok("B6b and `anchored` is the caster's token, measured rather than assumed",
  /showAimBanner\(label, config, Boolean\(token\)\)/.test(code));

/* ================================================================== *
 * C. ESCAPE
 * ================================================================== */

ok("C1 Escape cancels the aim",
  /if \(event\.key !== "Escape"\) return;[\s\S]{0,160}?finish\(null\);/.test(code));
/*
 * C2 IS WHY IT IS ON CAPTURE. Foundry binds Escape globally — it closes
 * windows and opens the main menu — so an aim that merely listened would
 * be cancelled AND pop the menu over the map.
 */
ok("C2 IT IS TAKEN BEFORE FOUNDRY SEES IT",
  /globalThis\.addEventListener\?\.\("keydown", onKey, true\);/.test(code),
  "without capture, Escape cancels the aim and opens the main menu over the map");
ok("C2b and the event is stopped, not merely acted on",
  /event\.preventDefault\(\);\s*event\.stopPropagation\(\);\s*finish\(null\);/.test(code));
ok("C3 THE LISTENER IS REMOVED WITH THE SAME PHASE IT WAS ADDED WITH",
  /globalThis\.removeEventListener\?\.\("keydown", onKey, true\);/.test(code),
  "a listener removed with the wrong phase is not removed at all, and this one swallows Escape "
  + "for the rest of the session");
ok("C4 and it is removed in finish, where every exit goes",
  /const finish = \(result\) => \{[\s\S]{0,420}?removeEventListener\?\.\("keydown", onKey, true\)/.test(code));

/* ================================================================== *
 * D. AND THE AIM STILL ONLY HAPPENS WHEN THERE IS SOMETHING TO AIM
 * ================================================================== */

ok("D1 an area centred on the caster is placed without aiming at all",
  /if \(centredOnCaster\) \{\s*return commit\(startX, startY, 0\);/.test(code),
  "no click to wait for means no banner to show");
ok("D1b and that branch is reached before the preview is built",
  code.indexOf("if (centredOnCaster)") < code.indexOf("const preview = new PIXI.Graphics();"));
{
  const cone = parseSpellArea("15-foot cone");
  const line = parseSpellArea("60-foot line");
  const burst = parseSpellArea("20-foot burst");
  eq("D2 a cone parses as a cone", cone?.t, "cone");
  eq("D2b a line parses as a ray", line?.t, "ray");
  ok("D2c and a burst is neither, so it is positioned rather than aimed",
    burst && burst.t !== "cone" && burst.t !== "ray");
  /*
   * `describeArea` reads `canvas.dimensions.units` for the unit, so it
   * needs a canvas to run at all — stubbed rather than skipped, because
   * the banner's whole job is printing what this returns.
   */
  globalThis.canvas = { dimensions: { units: "ft" } };
  const said = describeArea(line);
  delete globalThis.canvas;
  ok("D3 the description the banner prints is the area's own",
    /\d+/.test(said) && /(line|ray)/i.test(said), `describeArea gave "${said}"`);
}

/* ================================================================== */

if (failures.length) {
  process.stdout.write(`verify-spell-aim: FAILED — ${failures.length} of ${checks}\n`);
  for (const f of failures) process.stdout.write(`  ✗ ${f}\n`);
  process.exit(1);
}
process.stdout.write(`verify-spell-aim: OK — ${checks} checks. `
  + "The map says what it is waiting for, and Escape gets you out of it.\n");
