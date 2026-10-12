/**
 * A SPELL THAT GETS BIGGER IF YOU SPEND LONGER CASTING IT.
 *
 * NEW at 3.501.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * ONE SPELL IN THE PACK PRINTS THIS, AND THE SHAPE IS BUILT ANYWAY.
 *
 * Measured before building: of 692 spells, exactly ONE has a `castAP`
 * carrying a "+" — Warped Terrain, "1 AP+".
 *
 *   "By investing additional actions while casting the spell, you can
 *    expand the radius of the illusion. Each extra AP spent increases the
 *    radius by 5 feet, allowing you to extend the deceptive terrain up to
 *    a maximum of 10 extra feet when utilizing 3 AP."
 *
 * SO IT IS KEPT SMALL AND SPELL-AGNOSTIC. A general action-economy
 * feature built for a sample of one would be a shape chosen by guesswork:
 * this declares a cost per step, what a step buys, and a cap, and nothing
 * else. When a second spell prints "AP+" its own sentence can widen this,
 * with two examples to generalise from instead of one.
 *
 * ─────────────────────────────────────────────────────────────────────
 * IT IS NOT `apOptions`, AND THAT WAS MEASURED TOO.
 *
 * Fourteen spells carry `apOptions`, and every one is a VARIANT CHOOSER:
 * Shape Of The Wyrm's six forms, Iron Body's single alternative — each a
 * complete `{ap, label, range, area, effects}` replacing the cast. An
 * increment is a different thing, and squeezing "+5 feet per AP" into a
 * list of whole forms would mean three near-identical clones of one spell
 * whose only difference is a radius.
 *
 * ─────────────────────────────────────────────────────────────────────
 * IT IS NOT A WARP EITHER, though it is offered beside them.
 *
 * A warp is bought with PP and raises the Casting DC. This is bought with
 * ACTIONS and does not. Folding it into the warp chooser would have got
 * the radius right today and put an action cost somewhere no one would
 * look for it — and it would have raised the DC for spending an action,
 * which the book never says.
 *
 * WHAT IT SHARES WITH A WARP is where its effect lands: `areaGrowth` is
 * the mod `warp-area.mjs` already reads, so a spell that grows by AP and
 * a spell that grows by PP grow through one piece of code.
 */

const int = (v) => Math.trunc(Number(v) || 0);
const text = (v) => String(v ?? "").trim();

/** Does this printed cast time offer extra actions? */
export function castAPIsScalable(castAP) {
  return /\+/.test(String(castAP ?? ""));
}

/**
 * The base cost out of a scalable cast time: "1 AP+" is 1.
 *
 * RETURNS NULL WHEN THERE IS NO NUMBER TO FIND, rather than guessing 1.
 * A cast time nothing can read is one the AP prompt must not offer, and
 * the caller falls back to the printed string exactly as it always did.
 */
export function baseAPOf(castAP) {
  const m = /^\s*(\d+)/.exec(String(castAP ?? ""));
  return m ? int(m[1]) : null;
}

/**
 * An AP-scale declaration, or null when it is malformed.
 *
 * @param {object} raw the spell's `system.apScale`
 * @returns {{per: string, step: number, maxExtra: number, label: string}|null}
 */
export function normaliseApScale(raw) {
  if (!raw || typeof raw !== "object") return null;
  const step = int(raw.step);
  const maxExtra = int(raw.maxExtra);
  // A STEP OF NOTHING, OR A CAP OF NOTHING, IS NOT AN OFFER. Either one
  // produces a prompt whose every choice is the same choice.
  if (step <= 0 || maxExtra <= 0) return null;
  const per = text(raw.per) || "areaGrowth";
  return {
    per,
    step,
    maxExtra,
    label: text(raw.label) || `each extra AP adds ${step} to the ${per}`
  };
}

/**
 * What the caster may choose, as {ap, extra, label} rows.
 *
 * ROW ZERO IS THE PRINTED SPELL and is always offered — "1 AP+" means a
 * caster may spend one and stop, and a prompt that forced at least one
 * extra action would be a cost the book never printed.
 */
export function apScaleChoices(scale, baseAP = 1) {
  const spec = normaliseApScale(scale);
  if (!spec) return [];
  const base = Math.max(0, int(baseAP));
  const rows = [];
  for (let extra = 0; extra <= spec.maxExtra; extra += 1) {
    rows.push({
      extra,
      ap: base + extra,
      amount: extra * spec.step,
      label: extra === 0
        ? `${base} AP — as printed`
        : `${base + extra} AP — +${extra * spec.step} (${extra} extra ${extra === 1 ? "action" : "actions"})`
    });
  }
  return rows;
}

/**
 * The mods an AP choice contributes, ready to merge into the warp mods.
 *
 * CLAMPED TO THE CAP HERE rather than trusted from the dialog. The prompt
 * is where the choice is made and the arithmetic is where it is enforced,
 * because a dialog's returned index is data from outside this file.
 */
export function apScaleMods(scale, extraAP = 0) {
  const spec = normaliseApScale(scale);
  if (!spec) return {};
  const extra = Math.min(Math.max(0, int(extraAP)), spec.maxExtra);
  if (!extra) return {};
  return { [spec.per]: extra * spec.step };
}

/** How many extra AP this choice actually costs, after the same clamp. */
export function apScaleCost(scale, extraAP = 0) {
  const spec = normaliseApScale(scale);
  if (!spec) return 0;
  return Math.min(Math.max(0, int(extraAP)), spec.maxExtra);
}

/** What the card says when extra actions were spent. */
export function apScaleLine(scale, extraAP = 0) {
  const spec = normaliseApScale(scale);
  const extra = apScaleCost(scale, extraAP);
  if (!spec || !extra) return null;
  return `<em>${extra} extra ${extra === 1 ? "action" : "actions"} spent casting — `
    + `${spec.per === "areaGrowth" ? "radius" : spec.per} +${extra * spec.step}.</em>`;
}
