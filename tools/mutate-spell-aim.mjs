#!/usr/bin/env node
/**
 * mutate-spell-aim — can the aim checks fail?
 *
 * NEW at 3.592.0. SURVIVED and an unmatched anchor are both failures.
 *
 * THE FIRST MUTATION IS THE DEFECT ITSELF: take the banner away and the
 * aim goes back to waiting in silence, which is what a whole live-test
 * afternoon was spent misdiagnosing. If that one survives, this file has
 * bought nothing.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const TPL = path.join(SYSTEM_ROOT, "module", "magic", "spell-template.mjs");
const VERIFY = path.join(SYSTEM_ROOT, "tools", "verify-spell-aim.mjs");

const MUTATIONS = [
  { name: "THE ORIGINAL DEFECT: the aim goes back to waiting in silence",
    from: `  const removeBanner = showAimBanner(label, config, Boolean(token));`,
    to: `  const removeBanner = () => {};`, breaks: "A2" },
  { name: "the banner is shown and never taken down",
    from: `      removeBanner();`, to: `      ;`, breaks: "A3" },
  { name: "the banner stops naming which spell is waiting",
    from: "`<strong>${verb} ${label}</strong>${what ? ` &mdash; ${what}` : \"\"}<br>`",
    to: "`<strong>Placing an area</strong><br>`", breaks: "B1" },
  { name: "the shape and distance go unmentioned",
    from: `  const what = describeArea(config);`, to: `  const what = "";`, breaks: "B2" },
  { name: "only right-click is printed, as if Escape were not a way out",
    from: `Click the map to place it &middot; right-click or <strong>Esc</strong> to cancel`,
    to: `Click the map to place it &middot; right-click to cancel`, breaks: "B3" },
  { name: "every area is \"aimed\", including the ones you simply drop",
    from: `  const verb = config?.t === "cone" || config?.t === "ray" ? "Aim" : "Position";`,
    to: `  const verb = "Aim";`, breaks: "B5" },
  { name: "A CASTER WITH NO TOKEN IS NO LONGER TOLD WHERE IT ANCHORS",
    from: `    + (anchored ? "" : "<br>The caster has no token on this scene, so it is anchored to the centre of the map")`,
    to: `    + ""`, breaks: "B6" },
  { name: "the banner is told the caster always has a token",
    from: `showAimBanner(label, config, Boolean(token));`,
    to: `showAimBanner(label, config, true);`, breaks: "B6b" },
  { name: "Escape stops cancelling",
    from: `      if (event.key !== "Escape") return;`, to: `      return;`, breaks: "C1" },
  { name: "THE CAPTURE: Escape cancels the aim AND opens Foundry's menu over the map",
    from: `    globalThis.addEventListener?.("keydown", onKey, true);`,
    to: `    globalThis.addEventListener?.("keydown", onKey);`, breaks: "C2" },
  { name: "the event is acted on but not stopped",
    from: `      event.preventDefault();
      event.stopPropagation();
      finish(null);`,
    to: `      finish(null);`, breaks: "C2b" },
  { name: "THE PHASE MISMATCH: the Escape listener is never actually removed",
    from: `      globalThis.removeEventListener?.("keydown", onKey, true);`,
    to: `      globalThis.removeEventListener?.("keydown", onKey);`, breaks: "C3" },
  { name: "an area centred on the caster waits for a click nobody will make",
    from: `  if (centredOnCaster) {
    return commit(startX, startY, 0);`,
    to: `  if (false) {
    return commit(startX, startY, 0);`, breaks: "D1" }
];

guardFiles([TPL]);
const original = fs.readFileSync(TPL, "utf8");
const run = () => {
  try { execFileSync(process.execPath, [VERIFY], { stdio: "pipe" }); return true; }
  catch { return false; }
};

if (!run()) {
  console.error("verify-spell-aim does not pass on the unmutated tree — nothing to measure.");
  process.exit(1);
}

let survived = 0;
let unmatched = 0;
try {
  for (const m of MUTATIONS) {
    const n = original.split(m.from).length - 1;
    if (n !== 1) {
      console.error(`  ${n === 0 ? "ANCHOR MISSING" : `ANCHOR x${n}`}  ${m.name}`);
      unmatched++;
      continue;
    }
    fs.writeFileSync(TPL, original.replace(m.from, m.to));
    const stillPasses = run();
    fs.writeFileSync(TPL, original);
    if (stillPasses) {
      console.error(`  SURVIVED  ${m.name} (expected ${m.breaks} to fail)`);
      survived++;
    } else {
      console.log(`  caught    ${m.name}`);
    }
  }
} finally {
  fs.writeFileSync(TPL, original);
}

process.stdout.write(survived + unmatched
  ? `\nmutate-spell-aim: FAILED — ${survived} survived, ${unmatched} unmatched.\n`
  : `\nmutate-spell-aim: OK — all ${MUTATIONS.length} mutations caught, tree restored.\n`);
process.exit(survived + unmatched ? 1 : 0);
