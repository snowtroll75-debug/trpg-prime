/**
 * WHICH CURES REACH AN AFFLICTION (3.633.0; Fiends & Fables 3.0 block 3, R8).
 *
 * A counteract names kinds ("disease", "poison"); an affliction answers by
 * its own `afflictionType`. The Aboleth's Slime is a CURSE that the page
 * says "a remove disease can counter", so it also declares the kinds that
 * reach it:
 *
 *   flags.trg-prime.counteredAs = ["disease"]
 *
 * Pure.
 */
const SYSTEM_ID = "trg-prime";
const lower = (v) => String(v ?? "").trim().toLowerCase();

/** Does a counteract of these kinds reach this affliction item? */
export function afflictionCounteredBy(item, kinds = []) {
  const want = (kinds ?? []).map(lower).filter(Boolean);
  if (want.includes(lower(item?.system?.afflictionType))) return true;
  const extra = item?.flags?.[SYSTEM_ID]?.counteredAs;
  return (Array.isArray(extra) ? extra : []).map(lower).some((k) => want.includes(k));
}
