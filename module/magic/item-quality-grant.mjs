/**
 * A SPELL THAT RAISES AN ITEM'S QUALITY FOR A DURATION.
 *
 * NEW at 3.591.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * MASTERWORK ITEM (PP 6, 10 minutes): "You can improve an object's
 * quality, making it effectively an expert item", with warps for master
 * and legendary.
 *
 * `QUALITY_TIERS` has held exactly those tiers since the item-quality
 * work — the level delta, the trait allowance, the item bonus, the
 * per-die weapon damage, the armour ACP and Dex cap, the shield DR. Four
 * of the spell's six printed words were already implemented; the spell
 * had no row and its two warps were inert.
 *
 * ─────────────────────────────────────────────────────────────────────
 * IT RAISES, IT DOES NOT SET. "Improve an object's quality" is the
 * page's verb, and an item that is ALREADY master must not become expert
 * because a 6 PP spell was cast on it. So the grant is the HIGHER of the
 * two tiers, and a spell cast on something better than it says leaves it
 * alone and says so.
 *
 * THE OLD TIER IS CARRIED ON THE GRANT, because the spell ends. Reading
 * the item's tier again at expiry would find the spell's own, and the
 * item would keep it — the shape a conjured weapon's clock exists to
 * avoid.
 */

const text = (v) => String(v ?? "").trim().toLowerCase();

/** The tiers a spell may grant, weakest first. */
export const GRANTABLE_QUALITIES = Object.freeze(["expert", "master", "legendary"]);

/** Where a tier sits in the order, or -1 for one that is not a tier. */
export function qualityRank(quality) {
  const q = text(quality);
  if (q === "standard" || !q) return 0;
  const at = GRANTABLE_QUALITIES.indexOf(q);
  return at < 0 ? -1 : at + 1;
}

/**
 * An item-quality row after its warps, or null when it is malformed.
 *
 * @param {object} raw the effect row as authored
 * @param {object} warpMods aggregated warp mods
 * @returns {{quality:string, label:string}|null}
 */
export function normaliseItemQuality(raw, warpMods = {}) {
  if (!raw || typeof raw !== "object") return null;
  if (text(raw.kind) !== "itemquality") return null;

  // THE WARP REPLACES THE TIER rather than stepping it, because the page
  // says "item is classed as master quality" — a name, not a step. A
  // caster who buys both has chosen twice and gets the better, which is
  // the reading `warpedSuppression` takes for a ceiling.
  const asked = GRANTABLE_QUALITIES.includes(text(warpMods?.qualityTier))
    ? text(warpMods.qualityTier)
    : text(raw.quality);
  if (!GRANTABLE_QUALITIES.includes(asked)) return null;

  return { quality: asked, label: String(raw.label ?? "").trim() };
}

/**
 * What this grant does to an item that is already at some tier.
 *
 * @param {object} spec a normalised row
 * @param {string} current the item's own quality
 * @returns {{quality:string, raised:boolean, from:string}}
 */
export function qualityGrantFor(spec, current) {
  /*
   * AN UNKNOWN TIER RANKS BELOW STANDARD, and that is the right answer
   * rather than a hole: `want` is never below 1 for a spec that
   * normalised, so an item wearing a tier this system does not implement
   * is raised either way. A `Math.max(0, ...)` was written here first and
   * taken out again on 25 September, because it cannot change the
   * comparison \u2014 the mutation that removed it changed no answer, which
   * is the definition of a reassurance nothing has earned.
   *
   * `from` IS load-bearing and defaults to "standard": it is written onto
   * the effect flag and put back on the item at expiry, so an empty
   * string here would restore the sword to no tier at all.
   */
  const from = text(current) || "standard";
  const have = qualityRank(from);
  const want = qualityRank(spec.quality);
  return want > have
    ? { quality: spec.quality, raised: true, from }
    : { quality: from, raised: false, from };
}

/** What the card says. */
export function itemQualityLine(grant, itemName, durationText = "") {
  return grant.raised
    ? `<strong>${itemName}</strong> becomes an <strong>${grant.quality}</strong> item${durationText}.`
    : `<strong>${itemName}</strong> is already <strong>${grant.from}</strong> quality &mdash; nothing applied.`;
}
