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
 *     cooldownSeconds: 600,
 *     choose: 1
 *   }
 *
 * CHOOSE (3.638.0; Fiends & Fables 3.0 block 8, R5 — the Cheetah's Sprint,
 * "makes the strike": one Bite OR one Claw). `choose: n` offers every
 * listed strike but lets only n of them be made; once n buttons have been
 * pressed the card refuses the rest.
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
  const rows = Array.isArray(spec?.strikes) ? spec.strikes : [];
  rows.forEach((row, rowIndex) => {
    const pattern = row?.weapon instanceof RegExp ? row.weapon : new RegExp(String(row?.weapon ?? "$^"), "i");
    const not = row?.notWeapon ? (row.notWeapon instanceof RegExp ? row.notWeapon : new RegExp(String(row.notWeapon), "i")) : null;
    const matches = Array.from(weapons ?? []).filter((w) => w?.type === "weapon" && pattern.test(String(w.name ?? "")) && !(not && not.test(String(w.name ?? "")))
      && !(row?.pickOne && (String(w.name ?? "").trim().toLowerCase() === "unarmed strike" || w?.system?.natural === false)));
    // NO CLAW, ITS OTHER NATURAL STRIKES (3.655.0; F&F 3.0 block 22 R0 —
    // Flyby Attack's "two claw attacks" on the Pegasus, Cursarion and
    // Nightmares). `fallbackNatural`: when nothing matches, the creature's
    // natural weapons are offered as one pick — the one chosen makes both.
    let fallback = false;
    if (!matches.length && row?.fallbackNatural) {
      matches.push(...Array.from(weapons ?? []).filter((w) => w?.type === "weapon" && w?.system?.natural === true
        && String(w.name ?? "").trim().toLowerCase() !== "unarmed strike"));
      fallback = matches.length > 0;
    }
    if (!matches.length) { missing.push(String(row?.weapon ?? row?.notWeapon ?? "?")); return; }
    const pickOne = row?.pickOne || (fallback && matches.length > 1);
    // PICK ONE (3.641.0, F&F 3.0 block 11 R5 — Draconic Assault: "two claw
    // attacks followed by another non-claw, natural attack"). The first match
    // in item order was the Wing on one dragon and the Tail on the next; the
    // dragon chooses. Every match is offered under one group, and once one is
    // pressed the rest of the group is refused (compoundPickAllowed).
    for (const weapon of pickOne ? matches : matches.slice(0, 1)) strikes.push({
      weaponId: String(weapon.id ?? weapon._id ?? ""),
      weaponName: String(weapon.name ?? ""),
      count: Math.max(1, Number(row?.count) || 1),
      separateTargets: row?.separateTargets === true,
      bonus: row?.bonus && Number(row.bonus.value) ? { value: Number(row.bonus.value), type: String(row.bonus.type ?? "circumstance"), label: String(row.bonus.label ?? "") } : null,
      extraBaseDice: Math.max(0, Number(row?.extraBaseDice) || 0),
      // STORM OF BLADES (3.640.0, F&F 3.0 block 10 R8): "+5 additional damage
      // for each extra weapon"; "if the attack inflicts a critical hit, it
      // gains the deadly … traits as well as doubling the additional damage".
      extraDamage: Math.max(0, Math.trunc(Number(row?.extraDamage) || 0)),
      onCritical: row?.onCritical && typeof row.onCritical === "object"
        ? { severityUp: Math.max(0, Math.trunc(Number(row.onCritical.severityUp) || 0)), extraDamageMultiplier: Math.max(1, Number(row.onCritical.extraDamageMultiplier) || 1), note: String(row.onCritical.note ?? "") }
        : null,
      // "ONE ATTACK AGAINST ALL CREATURES WITHIN RANGE": a button for each
      // creature targeted when the action is used.
      perTarget: row?.perTarget === true,
      pickGroup: pickOne ? rowIndex : null,
      ...(fallback ? { standsInFor: String(row?.weapon ?? "") } : {})
    });
  });
  return { strikes, missing };
}

/** Whether this strike may be pressed: no other strike of its pick-one group has been. */
export function compoundPickAllowed(strikes = [], strikeIndex = 0, used = {}) {
  const group = strikes?.[strikeIndex]?.pickGroup;
  if (group === null || group === undefined) return true;
  return !Object.keys(used ?? {}).some((key) => {
    const i = Number(String(key).split(":")[0]);
    return i !== Number(strikeIndex) && strikes?.[i]?.pickGroup === group;
  });
}

/** How many strikes the action makes: a pick-one group counts once. */
export function compoundStrikeTotal(strikes = []) {
  let total = 0;
  const groups = new Set();
  for (const s of strikes ?? []) {
    const g = s?.pickGroup;
    if (g !== null && g !== undefined) { if (groups.has(g)) continue; groups.add(g); }
    total += Number(s?.count || 1);
  }
  return total;
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
  if (strike?.extraDamage) options.extraFlatDamage = strike.extraDamage;
  if (strike?.onCritical) options.criticalBoost = strike.onCritical;
  if (mapRule?.kind === "fixed") { options.mapOverride = mapRule.fixed; options.mapFrozen = true; }
  if (mapRule?.kind === "after") options.mapFrozen = true;
  return options;
}

/** How many of the offered strikes may be made (0: all of them). */
export function compoundChooseLimit(spec) {
  const n = Math.trunc(Number(spec?.choose));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Whether another strike may be pressed, given the strikes already made. */
export function compoundStrikeAllowed(choose, used = {}) {
  const limit = Math.trunc(Number(choose)) || 0;
  return limit <= 0 || Object.keys(used ?? {}).length < limit;
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

/**
 * A COMPOUND ACTION WITH MODES (3.640.0, F&F 3.0 block 10 R8 — Storm of
 * Blades: "either one attack against all creatures within range or strike
 * one target with all their blades"). The modes declared, each a partial
 * compound spec laid over the action's own; [] when it has none.
 */
export function compoundModes(spec) {
  return (Array.isArray(spec?.modes) ? spec.modes : []).filter((m) => m && typeof m === "object" && String(m.label ?? "").trim())
    .map((m) => ({ ...m, label: String(m.label).trim() }));
}

/** The action's spec with one mode laid over it. */
export function compoundWithMode(spec, mode) {
  if (!mode) return spec;
  const { modes, ...rest } = spec ?? {};
  const { label, ...over } = mode;
  return { ...rest, ...over, modeLabel: label };
}

/** How many buttons a strike row offers: its count, or one per target. */
export function compoundStrikeCount(strike, targetCount = 0) {
  if (strike?.perTarget) return Math.max(1, Math.trunc(Number(targetCount) || 0));
  return Math.max(1, Number(strike?.count) || 1);
}

/** The flat damage a strike adds, doubled (or as declared) on a critical. */
export function compoundFlatDamage(extra, critical, onCritical) {
  const n = Math.max(0, Math.trunc(Number(extra) || 0));
  if (!n) return 0;
  return critical && onCritical ? Math.trunc(n * Math.max(1, Number(onCritical.extraDamageMultiplier) || 1)) : n;
}

/** A critical's severity stepped up ("gains the deadly trait"): minor → serious → deadly. */
export function steppedCriticalSeverity(severity, steps = 0) {
  const order = ["minor", "serious", "deadly"];
  const at = order.indexOf(String(severity ?? "").toLowerCase());
  if (at < 0) return severity ?? null;
  return order[Math.min(order.length - 1, at + Math.max(0, Math.trunc(Number(steps) || 0)))];
}
