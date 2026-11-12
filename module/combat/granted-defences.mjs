/**
 * A DEFENCE GRANTED FOR ONE BLOW, OR FOR ONE CAST (3.681.0; Eldritch Arts
 * Block 3b). A damage reaction answers before the damage meets the defences:
 * Phase Familiar's "resistance to all damage and is immune to precision
 * damage. This applies only against the triggering damage", and Resist
 * Magic's "resistance to the spells damage type. This resistance ends as soon
 * as the spell has been resolved". Held here, on the client resolving the
 * damage (the one that asked), and read by `actorDefences` beside the
 * creature's own fields, so every damage path that reads defences reads it.
 *
 *   instance  cleared when that creature's damage is next applied
 *             (`applyDamageAndCheckDying`), when another damage reaction is
 *             asked of it, or after a minute, whichever is first
 *   cast      cleared when the cast running when it was granted settles
 *             (`endCastScope`, called as castSpell returns)
 *
 * The cast scope is a stack, because a reaction may itself be a cast inside
 * the cast it answers.
 */
const grants = new Map();
/** `${castKey}|${actor}`: asked during that cast already, whatever the answer. */
const askedInCast = new Set();
const castStack = [];
let castSerial = 0;
const INSTANCE_LIFETIME_MS = 60000;

const keyOf = (actor) => String(actor?.uuid ?? actor?.id ?? "");
const words = (value) => (value === "all" ? "all" : Array.from(value ?? []).map((v) => String(v ?? "").trim().toLowerCase()).filter(Boolean));

/** A cast begins: its scope is the one cast-scoped grants are tied to. */
export function beginCastScope() {
  castSerial += 1;
  const key = `cast-${castSerial}`;
  castStack.push(key);
  return key;
}

/** A cast settles: its scope ends, and every grant tied to it with it. */
export function endCastScope(key) {
  const at = castStack.lastIndexOf(key);
  if (at >= 0) castStack.splice(at, 1);
  for (const [actor, list] of grants) {
    const kept = list.filter((g) => g.castKey !== key);
    if (kept.length) grants.set(actor, kept); else grants.delete(actor);
  }
  for (const entry of Array.from(askedInCast)) if (entry.startsWith(`${key}|`)) askedInCast.delete(entry);
}

/**
 * ONE QUESTION A CREATURE A CAST (3.681.0). A spell's damage reaches a
 * creature in several packets (the blow, a "vs" rider, a secondary type),
 * each met separately; the creature is asked before the first and not again
 * during that cast, whether it said yes or no. Outside a cast, every blow is
 * its own question. Returns whether it had been asked, and marks it asked.
 */
export function askOnceThisCast(actor, castKey = currentCastScope()) {
  if (!castKey) return false;
  const entry = `${castKey}|${keyOf(actor)}`;
  if (askedInCast.has(entry)) return true;
  askedInCast.add(entry);
  return false;
}

/**
 * The cast (or strike) running now on this client, or null. Read where a
 * question begins and carried through it (found in review): the question
 * waits on another player, and in that wait this client may open and close
 * scopes of its own — a GM resolving a strike while their cast is paused —
 * so the top of the stack once the answer comes back may be someone else's.
 */
export function currentCastScope() {
  return castStack.at(-1) ?? null;
}

/**
 * Grant a defence. `resist` and `immune` are "all" or a list of damage types
 * (and "precision"); `scope` is "instance" or "cast". A cast grant outside any
 * cast is held as an instance grant.
 * @returns {boolean} whether anything was granted
 */
export function grantDefence(actor, { resist = null, immune = null, weak = null, scope = "instance", label = "", now = Date.now(), castKey: heldScope = undefined } = {}) {
  const key = keyOf(actor);
  const r = resist ? words(resist) : null;
  const i = immune ? words(immune) : null;
  // A WEAKNESS TOO (3.685.0; found checking Eldritch Arts Block 7: Invoke True
  // Name, "the target gains weakness to the first damage it takes from your
  // spells"). A list of damage types — the damage reaction's ctx `types`
  // names the incoming ones; "all" is not a weakness this grants.
  const w = weak && weak !== "all" ? words(weak) : null;
  if (!key || ((!r || !r.length) && (!i || !i.length) && (!w || !w.length))) return false;
  const wanted = scope === "cast" ? (heldScope === undefined ? currentCastScope() : heldScope) : null;
  // A scope that closed while the question waited holds nothing: the grant
  // is the one blow's.
  const castKey = wanted && castStack.includes(wanted) ? wanted : null;
  const list = grants.get(key) ?? [];
  list.push({ resist: r, immune: i, weak: w, castKey, at: now, label: String(label ?? "") });
  grants.set(key, list);
  return true;
}

/** This creature's damage has been applied: its one-blow grants end. */
export function clearInstanceGrants(actor) {
  const key = keyOf(actor);
  const list = grants.get(key);
  if (!list) return;
  const kept = list.filter((g) => g.castKey);
  if (kept.length) grants.set(key, kept); else grants.delete(key);
}


/**
 * What this creature holds now, for `actorDefences`. An instance grant older
 * than a minute has lapsed (a blow that never reached the HP write).
 * @returns {{resistances: string[], resistAll: boolean, immunities: string[], immuneAll: boolean, labels: string[]}}
 */
export function grantedDefencesOf(actor, now = Date.now()) {
  const out = { resistances: [], resistAll: false, immunities: [], immuneAll: false, weaknesses: [], labels: [] };
  const key = keyOf(actor);
  if (!key || !grants.has(key)) return out;
  const live = grants.get(key).filter((g) => (g.castKey ? castStack.includes(g.castKey) : now - g.at < INSTANCE_LIFETIME_MS));
  if (live.length) grants.set(key, live); else grants.delete(key);
  for (const g of live) {
    if (g.resist === "all") out.resistAll = true; else out.resistances.push(...(g.resist ?? []));
    if (g.immune === "all") out.immuneAll = true; else out.immunities.push(...(g.immune ?? []));
    out.weaknesses.push(...(g.weak ?? []));
    if (g.label) out.labels.push(g.label);
  }
  return out;
}

/** For the harness: start again. */
export function resetGrantedDefences() {
  grants.clear();
  askedInCast.clear();
  castStack.length = 0;
}
