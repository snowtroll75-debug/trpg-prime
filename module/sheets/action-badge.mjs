/**
 * A compact badge for the Basic/Special Actions grid: a short label
 * (the AP cost, or F/R for Free/Reaction) and a color class drawn
 * from this project's own existing theme colors — nothing new
 * introduced, per Graham directly ("not tinkering with the
 * colours").
 *
 * Priority order, since some actions carry more than one qualifying
 * trait (Fight Defensively is both Attack and Defence): Free/Reaction
 * first (a wholly different category from a spent AP cost), then
 * Defence, then Attack (checked against both the traits text and
 * checkType, since Disarm/Grapple/Shove/Trip Attack are attack-type
 * mechanically — checkType "attack"/"unarmed" — but don't carry the
 * formal "Attack" trait tag in the rulebook's own text), then
 * Movement, then Concentrate, with everything else falling to a
 * neutral default rather than a guessed category.
 */

const TRAIT_PATTERNS = {
  defence: /\bDefence\b/i,
  attack: /\bAttack\b/i,
  movement: /\bMovement\b/i,
  concentrate: /\bConcentrate\b/i
};

/**
 * @param {{apCost: string|number, traits?: string, checkType?: string}} action
 * @returns {{label: string, colorClass: string}}
 */
export function actionBadge(action) {
  const apCost = String(action?.apCost ?? "").trim();
  const apCostLower = apCost.toLowerCase();

  if (apCostLower === "free") return { label: "F", colorClass: "action-badge-free" };
  if (apCostLower === "reaction") return { label: "R", colorClass: "action-badge-free" };

  const traits = String(action?.traits ?? "");
  const checkType = String(action?.checkType ?? "");
  const isAttackType = checkType === "attack" || checkType === "unarmed";

  let colorClass;
  if (TRAIT_PATTERNS.defence.test(traits)) {
    colorClass = "action-badge-defence";
  } else if (TRAIT_PATTERNS.attack.test(traits) || isAttackType) {
    colorClass = "action-badge-attack";
  } else if (TRAIT_PATTERNS.movement.test(traits)) {
    colorClass = "action-badge-movement";
  } else if (TRAIT_PATTERNS.concentrate.test(traits)) {
    colorClass = "action-badge-concentrate";
  } else {
    colorClass = "action-badge-other";
  }

  // A genuinely absent AP cost (Burrow/Fly — movement modes with no
  // fixed price) shouldn't read as an actual "0 AP" — shown as a dash
  // instead.
  return { label: apCost || "—", colorClass };
}
