/**
 * COMPOUND ACTIONS (Creature Codex, Chapter 2; 3.631.0 — Fiends & Fables 3.0
 * block 1, Graham: "all automated").
 *
 * Nine Codex abilities are one action made of a move and some strikes:
 *
 *   Diving Strike     2 AP: fly up to 2× fly Speed, descending 10 ft, then a
 *                     Claw strike at +2 circumstance.
 *   Double Strike     1 AP: two strikes, two different natural weapons, two
 *                     different targets; MAP counted after both.
 *   Draconic Assault  2 AP: Claw, Claw, then one non-claw natural attack.
 *   Flyby Attack      2 AP: Stride up to fly Speed; two Claw strikes at any
 *                     point, separate targets.
 *   Swimby Attack     2 AP: as Flyby, swim Speed, two Bite strikes.
 *   Pouncing Assault  2 AP: a Jump check, two Claw strikes during the move;
 *                     attacks against the creature at -4 until its next turn.
 *   Powerful Charge   2 AP: Stride twice, then a Gore at +2 circumstance
 *                     with +1 base die.
 *   Surge of Speed    1 AP: Stride twice; once every 10 minutes.
 *   Torrent of Strikes 3 AP: six strikes, MAP a fixed -2 each, split among
 *                     adjacent targets.
 *
 * ONE RAIL, DECLARED ON THE ENTRY:
 *
 *   flags.trg-prime.creatureAbility.compound = {
 *     ap: 2,
 *     legs: [{ move: "fly" | "land" | "swim", times: 2, note: "must descend at least 10 feet" }],
 *     strikes: [{ weapon: "claw", count: 2, separateTargets: true,
 *                 bonus: { value: 2, type: "circumstance" }, extraBaseDice: 1 }],
 *     map: "normal" | "after" | { fixed: -2 },
 *     selfEffect: { label: "Pouncing Assault", defenceCircumstance: 4, rounds: 1 },
 *     cooldownSeconds: 600
 *   }
 *
 * THE MOVE IS THE PLAYER'S DRAG (Graham's ruling on movement actions: the
 * action arms the next token move rather than describing one). A leg is
 * armed free of AP — the action already paid — with its own limit; the
 * strikes are buttons on the action's card and roll through the Strike
 * workflow with the bonus, the extra die and the MAP rule the entry
 * declares. Pure; the workflow (compound-action-workflow.mjs) arms, posts
 * and rolls.
 */
const SYSTEM_ID = "trg-prime";

/** The declaration, or null. */
export function compoundOf(item) {
  const c = item?.flags?.[SYSTEM_ID]?.creatureAbility?.compound;
  return c && typeof c === "object" ? c : null;
}

const SPEED_KEYS = Object.freeze({ fly: "fly", land: "land", stride: "land", swim: "swim", climb: "climb", burrow: "burrow" });

/**
 * The legs, resolved against the creature's speeds.
 * @returns {Array<{speedKey: string, maxFeet: number, note: string, provokes: boolean}>}
 */
export function compoundLegs(spec, speeds = {}) {
  return (Array.isArray(spec?.legs) ? spec.legs : []).map((leg) => {
    const speedKey = SPEED_KEYS[String(leg?.move ?? "land").toLowerCase()] ?? "land";
    const speed = Math.max(0, Number(speeds?.[speedKey]) || 0);
    const times = Math.max(1, Number(leg?.times) || 1);
    return {
      speedKey,
      maxFeet: Math.max(Math.max(0, Number(leg?.minFeet) || 0), speed * times),
      note: String(leg?.note ?? ""),
      provokes: leg?.provokes !== false
    };
  }).filter((leg) => leg.maxFeet > 0);
}

/**
 * The strikes, matched to the creature's weapons by name. A pattern that
 * matches nothing is reported rather than dropped.
 * @returns {{strikes: Array<{weaponId: string, weaponName: string, count: number, separateTargets: boolean, bonus: object|null, extraBaseDice: number, notClaw?: boolean}>, missing: string[]}}
 */
export function compoundStrikes(spec, weapons = []) {
  const strikes = [];
  const missing = [];
  for (const row of Array.isArray(spec?.strikes) ? spec.strikes : []) {
    const pattern = row?.weapon instanceof RegExp ? row.weapon : new RegExp(String(row?.weapon ?? "$^"), "i");
    const not = row?.notWeapon ? (row.notWeapon instanceof RegExp ? row.notWeapon : new RegExp(String(row.notWeapon), "i")) : null;
    const weapon = Array.from(weapons ?? []).find((w) => w?.type === "weapon" && pattern.test(String(w.name ?? "")) && !(not && not.test(String(w.name ?? ""))));
    if (!weapon) { missing.push(String(row?.weapon ?? row?.notWeapon ?? "?")); continue; }
    strikes.push({
      weaponId: String(weapon.id ?? weapon._id ?? ""),
      weaponName: String(weapon.name ?? ""),
      count: Math.max(1, Number(row?.count) || 1),
      separateTargets: row?.separateTargets === true,
      bonus: row?.bonus && Number(row.bonus.value) ? { value: Number(row.bonus.value), type: String(row.bonus.type ?? "circumstance"), label: String(row.bonus.label ?? "") } : null,
      extraBaseDice: Math.max(0, Number(row?.extraBaseDice) || 0)
    });
  }
  return { strikes, missing };
}

/** How the strikes count against the multiple attack penalty. */
export function compoundMapRule(spec) {
  const map = spec?.map;
  if (map && typeof map === "object" && Number.isFinite(Number(map.fixed))) return { kind: "fixed", fixed: Number(map.fixed) };
  if (map === "after") return { kind: "after" };
  return { kind: "normal" };
}

/** The roll options one strike button hands the Strike workflow. */
export function compoundStrikeOptions(strike, mapRule, label = "") {
  const options = { apPaid: true, extraModifiers: [] };
  if (strike?.bonus) options.extraModifiers.push({ label: strike.bonus.label || label || "Compound action", value: strike.bonus.value, type: strike.bonus.type });
  if (strike?.extraBaseDice) options.extraBaseDice = strike.extraBaseDice;
  if (mapRule?.kind === "fixed") { options.mapOverride = mapRule.fixed; options.mapFrozen = true; }
  if (mapRule?.kind === "after") options.mapFrozen = true;
  return options;
}

/** Whether the ability can be used now (its cooldown). */
export function compoundAvailable(item, worldTime = 0) {
  const spec = compoundOf(item);
  const cooldown = Math.max(0, Number(spec?.cooldownSeconds) || 0);
  const last = Number(item?.flags?.[SYSTEM_ID]?.lastUsedAt);
  if (cooldown > 0 && Number.isFinite(last) && worldTime - last < cooldown) {
    return { ok: false, reason: `used ${Math.round(worldTime - last)} seconds ago; ${Math.ceil((cooldown - (worldTime - last)) / 60)} minute(s) to go` };
  }
  return { ok: true, reason: "" };
}
