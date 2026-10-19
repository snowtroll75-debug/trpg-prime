/**
 * The Foundry half of a live emanation: the circle that follows its
 * caster, and the bonus that applies while you stand in it.
 *
 * NEW at 3.426.0. The rules are pure and live in magic/emanation.mjs.
 *
 * ─────────────────────────────────────────────────────────────────────
 * DELIBERATELY THE SAME MACHINERY CREATURE AURAS USE.
 *
 * `creature-aura-workflow.mjs` already solved "a Region that follows its
 * creature", including the two things that are not obvious:
 *
 *   - WHERE A TOKEN IS takes three tries to ask correctly, and that file
 *     records all three. Foundry V14 animates a token document's own x
 *     and y across a move, so mid-animation both the placeable and the
 *     document report where the token WAS. `tokenCentre` there reads the
 *     committed value; this file imports it rather than making the same
 *     mistake a fourth time.
 *   - A REGION REFRESH IS A READ-MODIFY-WRITE against the scene, so it
 *     is serialised per token. Two moves in quick succession otherwise
 *     litter the scene with duplicate circles.
 *
 * WHAT IS DIFFERENT: an aura is emitted by an ability the creature
 * permanently has, so its Regions can be rebuilt from the sheet at any
 * time. An emanation belongs to one CAST — it has a duration, it can be
 * dismissed, and two castings of Bless are two circles. So the record
 * lives on the caster's active-spell entry, which is already the thing
 * that knows a spell is still running.
 */

import { getActiveSpells, setActiveSpells } from "./active-spells.mjs";
import {
  emanationDelta, emanationMembers, flooredValue, untestedMembers
} from "./emanation.mjs";
import { grownRadius } from "./emanation-growth.mjs";
// FROM THE AURA WORKFLOW, on purpose. `tokenCentre` is the answer to
// "where is this token really", arrived at over three attempts and
// documented there; `serialiseByKey` is the per-key lock that keeps a
// read-modify-write against the scene from racing itself. Importing
// both is the point — a second copy of either would be a second chance
// to get them wrong.
import { serialiseByKey, tokenCentre, tokenCentreFeet } from "../creature-aura-workflow.mjs";
import { isActingGM } from "../acting-gm.mjs";

const SYSTEM_ID = "trg-prime";

/**
 * Every live emanation running in the world, with its caster's token.
 *
 * READ FROM THE CANVAS, not from derived data — the same reasoning
 * `allyAuraConditionalsFor` records: whether you are standing in a
 * circle changes when a token moves, and a token moving does not
 * re-derive anyone else's actor.
 */
export function runningEmanations() {
  const out = [];
  for (const token of canvas?.tokens?.placeables ?? []) {
    const actor = token.actor;
    if (!actor) continue;
    for (const entry of getActiveSpells(actor)) {
      const em = entry?.emanation;
      // FROZEN MEANS THE CASTER PAID for membership to stop mattering,
      // so it is not live and nothing here touches it.
      if (!em || em.frozen) continue;
      out.push({ actor, token, entry, emanation: em });
    }
  }
  return out;
}

/**
 * Where a dropped circle is, in feet, read off its own Region.
 *
 * NEW at 3.490.0 for Umbral Veil's decoy. Returns null when the Region
 * is gone or is not a circle — a circle that is not there catches
 * nobody, which is the honest answer rather than falling back to the
 * caster and quietly reattaching a cloak they put down.
 */
function regionCentreFeet(region) {
  const shape = region?.shapes?.[0];
  if (!shape || shape.type !== "circle") return null;
  const perFt = (canvas?.dimensions?.size ?? 0) / (canvas?.dimensions?.distance ?? 1);
  if (!perFt) return null;
  return { x: Number(shape.x) / perFt, y: Number(shape.y) / perFt };
}

/** The subjects an emanation could catch — every token with an actor. */
function subjectsOnCanvas() {
  return (canvas?.tokens?.placeables ?? [])
    .filter((t) => t.actor)
    .map((t) => ({
      id: t.id,
      token: t,
      centreFeet: tokenCentreFeet(t.document),
      disposition: t.document.disposition
    }));
}

/** The effects one emanation has placed, keyed by the token holding them. */
function holdersOf(castId) {
  const held = [];
  for (const token of canvas?.tokens?.placeables ?? []) {
    const has = Array.from(token.actor?.effects ?? []).some(
      (e) => e.getFlag?.(SYSTEM_ID, "castId") === castId);
    if (has) held.push(token.id);
  }
  return held;
}

/**
 * Move one emanation's Region to its caster, and bring its membership up
 * to date.
 *
 * SERIALISED PER CAST, for the reason the aura file records: this reads
 * the scene and then writes it, and two moves arriving together would
 * otherwise both read the old state.
 */
export function refreshEmanation(record) {
  // ON THE GM'S CLIENT (3.645.0, F3 of Graham's 14 October session). The
  // sweep writes to every creature in the circle — Song Of Despair's floor
  // raises an enemy's frightened, Bless hands an ally its bonus — and a
  // player owns none of them. Run on the caster's client, the first write
  // threw "lacks permission to create ActiveEffect", the cast unwound before
  // its Result card, and the spell never registered to be sustained. The
  // movement sweeps already ran on the acting GM only; the cast-time and
  // Sustain reconciles now ask that same client.
  if (!isActingGM()) return askGMClient("emanation.refresh", { castId: record?.entry?.id ?? "" });
  return serialiseByKey(`emanation:${record?.entry?.id}`, () => refreshEmanationNow(record));
}

/** The socket the emanation requests travel on — the target relay's channel. */
const EMANATION_SOCKET = "system.trg-prime";

/** Hand an emanation write to the acting GM's client; nothing waits on it. */
function askGMClient(action, payload) {
  if (!game.users?.activeGM) {
    ui.notifications?.warn("No GM is connected — the spell's area cannot reach the creatures in it until one is.");
    return Promise.resolve();
  }
  game.socket?.emit(EMANATION_SOCKET, { action, ...payload });
  return Promise.resolve();
}

/** The GM's side: the record is looked for a few times, as the caster's flag write may still be arriving. */
async function answerEmanationRequest(data) {
  if (!isActingGM()) return;
  if (data?.action === "emanation.end") {
    await endEmanationEverywhere(String(data.castId ?? ""), data.emanation ?? null);
    return;
  }
  if (data?.action !== "emanation.refresh") return;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const record = runningEmanations().find((r) => r.entry.id === data.castId);
    if (record) {
      if (data.adopt) {
        const { adoptCastEffects } = await import("./emanation-effects.mjs");
        await adoptCastEffects(data.castId);
      }
      return refreshEmanation(record);
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

async function refreshEmanationNow({ actor, token, entry, emanation }) {
  if (!canvas?.dimensions) return;

  /*
   * ── the circle follows its ANCHOR ────────────────────────────────
   *
   * THE CASTER BY DEFAULT, which is still the only case for Bless, Bane
   * and every other emanation built before 3.490.0. The anchor became a
   * field so that two things are sayable that were not:
   *
   *   A CIRCLE ON SOMEBODY ELSE. Umbral Veil is cast at touch on "1
   *   willing creature" and its emanation is "centred on the target".
   *   Anchored to the caster it would have followed the wrong person
   *   around the map.
   *
   *   A CIRCLE ON NOBODY. `anchorTokenId: null` is a circle that has
   *   been PUT DOWN — Umbral Veil's decoy — and it must stay exactly
   *   where it was let go.
   *
   * NOTE THE `=== undefined` TEST. An ABSENT anchor means "the caster";
   * a NULL anchor means "nothing". Collapsing those with `??` would snap
   * every dropped cloak back to the caster on the next refresh, which is
   * the whole spell undone by one operator.
   */
  const anchorToken = emanation.anchorTokenId === undefined
    ? token
    : emanation.anchorTokenId === null
      ? null
      : (canvas?.tokens?.get(emanation.anchorTokenId) ?? null);

  const region = canvas.scene?.regions?.get(emanation.regionId) ?? null;
  if (region && anchorToken) {
    const centre = tokenCentre(anchorToken.document);
    const pxPerFt = canvas.dimensions.size / canvas.dimensions.distance;
    await region.update({
      shapes: [{
        type: "circle", x: centre.x, y: centre.y,
        radius: Number(emanation.radiusFeet) * pxPerFt, hole: false
      }]
    });
  }

  /*
   * ── and its membership ───────────────────────────────────────────
   *
   * MEASURED FROM THE SAME ANCHOR THE SHAPE WAS DRAWN FROM. Two answers
   * to "where is this circle" is how a spell ends up affecting one set
   * of creatures and drawing another, and the drawn one is the one
   * everybody at the table believes.
   *
   * A DROPPED CIRCLE KEEPS THE PLACE IT WAS DROPPED, read back off its
   * own Region rather than remembered separately — the Region is where
   * the circle actually is, and anything else would be a second copy of
   * that fact free to disagree with it. With no Region left there is
   * nothing to be inside, so it catches nobody.
   *
   * The caster's disposition still decides friend from foe even for a
   * circle they are no longer standing in: an ally-only shadow dropped
   * on the floor is still THEIR shadow.
   */
  const subjects = subjectsOnCanvas();
  const centreFeet = anchorToken
    ? tokenCentreFeet(anchorToken.document)
    : regionCentreFeet(region);
  const inside = centreFeet ? emanationMembers({
    centreFeet,
    radiusFeet: emanation.radiusFeet,
    subjects,
    casterDisposition: token.document.disposition,
    mode: emanation.mode
  }) : [];
  const byId = new Map(subjects.map((s) => [s.id, s.token]));

  // ── the save an entrant owes, if the spell demands one ───────────
  //
  // ROLLED HERE, ONCE, AND REMEMBERED. Bane's cast rolls a Will save for
  // everyone caught; a creature walking in afterwards must be rolled the
  // same way, or one spell would answer the same question two ways
  // depending on when you arrived (Graham, 28 August 2026). A creature
  // already in `tested` is never asked again — that is his second
  // ruling: it failed once, and being inside is the condition.
  if (emanation.save) {
    const owing = untestedMembers(emanation.tested, inside);
    if (owing.length) {
      const { rollEmanationSave } = await import("./emanation-save-workflow.mjs");
      const tested = { ...(emanation.tested ?? {}) };
      for (const id of owing) {
        const t = byId.get(id);
        if (!t?.actor) continue;
        tested[id] = await rollEmanationSave(t.actor, emanation, actor);
      }
      // WRITTEN BACK WITHOUT RECONCILING (3.609.1, the 3.609.0 live test's
      // F3). This runs INSIDE this emanation's serialised refresh; asking
      // recordEmanation to reconcile queued a second refresh behind the one
      // waiting for it, and the emanation hung for good — a Bane whose
      // first latecomer never got the penalty and whose second was never
      // asked, and a Turn Undead whose cast never finished.
      await recordEmanation(actor, entry.id, { ...emanation, tested }, { reconcile: false });
      emanation.tested = tested;
    }
  }

  // ── the floor a creature standing inside cannot fall below ───────
  //
  // RAISED ON ARRIVAL, RELEASED ON DEPARTURE, AND NEVER LOWERED. Song Of
  // Despair reads "they become frightened 1 and cannot reduce their
  // frightened condition below 1 as long as they remain within the
  // area" — so entering lifts the condition to the floor, and LEAVING
  // CURES NOTHING. There is deliberately no counterpart in the `remove`
  // loop below: walking out restores the ability to recover, which is a
  // different thing from recovering.
  for (const [condition, floor] of Object.entries(emanation.floors ?? {})) {
    for (const id of inside) {
      const t = byId.get(id);
      if (!t?.actor) continue;
      const current = Number(t.actor.getConditionValue?.(condition) ?? 0);
      const next = flooredValue(current, floor);
      if (next !== current) await t.actor.toggleStatusEffect(condition, { value: next });
    }
  }

  const { add, remove } = emanationDelta(holdersOf(entry.id), inside);
  if (!add.length && !remove.length) return;

  const { applyEmanationEffectsTo, removeEmanationEffectsFrom } =
    await import("./emanation-effects.mjs");

  for (const id of remove) {
    const t = byId.get(id);
    if (t?.actor) await removeEmanationEffectsFrom(t.actor, entry.id);
  }
  for (const id of add) {
    const t = byId.get(id);
    // THE DEGREE IT ROLLED, carried through so a Fumble keeps its -2 on
    // the way back in. An unsaved emanation passes null and every row
    // applies, which is Bless unchanged.
    if (t?.actor) {
      const applied = await applyEmanationEffectsTo(
        t.actor, entry.id, emanation, actor, emanation.tested?.[id] ?? null);
      // AN ANTIMAGIC FIELD SAYS SO WHEN IT CLOSES OVER SOMEBODY
      // (3.586.0). Every other emanation applies a number that shows on
      // the sheet; this one switches other effects off, which is invisible
      // unless somebody goes looking at the Effects tab. The silent-nothing
      // rule cuts both ways — a card must not claim what did not happen,
      // and must not stay quiet about what did.
      if (applied?.line) {
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: t.actor }),
          content: `<div class="trg-prime"><p>${applied.line}</p></div>`
        });
      }
    }
  }
}

/** Bring every live emanation in the world up to date. */
async function refreshAllEmanations() {
  for (const record of runningEmanations()) await refreshEmanation(record);
}

/**
 * Record an emanation on the caster's active-spell entry, so it can be
 * followed and reconciled for as long as the spell runs.
 *
 * @param {Actor} actor the caster
 * @param {string} castId the active-spell entry's id
 * @param {object} descriptor {regionId, radiusFeet, mode, effects, frozen}
 */
export async function recordEmanation(actor, castId, descriptor, { reconcile = true } = {}) {
  const entries = getActiveSpells(actor);
  const entry = entries.find((e) => e.id === castId);
  /*
   * NOT SILENT. NOT ANY MORE. (3.492.0)
   *
   * This line read `if (!entry) return null;` and it has now hidden the
   * SAME defect twice, months apart, in two different spells:
   *
   *   AURA OF VITALITY (3.446.0) — neither sustained nor PP-locked, so
   *   the registration gate skipped it and the per-turn heal could never
   *   fire. The card said the spell took effect.
   *
   *   UMBRAL VEIL (3.492.0) — its circle is declared on an effect row and
   *   its stat line has no Area, so `emanationIsLive` could not see it and
   *   the gate skipped it too. The Region was drawn and the light really
   *   dropped, so everything visible worked; only the FOLLOWING was dead.
   *
   * Both times the spell looked right on the card, and both times the
   * failure was found by a person driving it rather than by any check —
   * because a check can assert this function was CALLED with the right
   * arguments and cannot see that it did nothing with them.
   *
   * A caller asking to record an emanation has already decided the spell
   * has one. If there is no entry to write onto, the registration gate
   * and this call disagree about what kind of spell this is, and one of
   * them is wrong. Say so.
   */
  if (!entry) {
    console.error(
      `TRG Prime | ${actor?.name}: an emanation was recorded for a cast that is not in the `
      + "active-spell registry, so it will never follow, expire or be dismissable. The "
      + "registration gate in cast-workflow.mjs and this caller disagree about whether this "
      + "spell has a live emanation — see emanationIsLive.",
      { castId, descriptor }
    );
    return null;
  }
  // `tested` SURVIVES A RE-RECORD. The refresh writes the map back
  // through this same function after rolling an entry save, and a
  // descriptor rebuilt from the spell would drop it — every creature
  // would then owe a fresh save on its next step, which is precisely the
  // ruling this map exists to honour.
  entry.emanation = { tested: entry.emanation?.tested ?? {}, ...descriptor };
  await setActiveSpells(actor, entries);
  // THE CAST'S OWN EFFECTS BECOME THIS EMANATION'S (3.426.0). Without
  // this the creatures caught at the cast are held by an owner that
  // cannot let go — see adoptCastEffects.
  if (!descriptor?.frozen && reconcile) {
    // ADOPTING AND RECONCILING BOTH WRITE TO OTHER PEOPLE'S CREATURES
    // (3.645.0, F3), so a player's cast hands both to the GM's client.
    if (!isActingGM()) {
      await askGMClient("emanation.refresh", { castId, adopt: true });
      return entry;
    }
    const { adoptCastEffects } = await import("./emanation-effects.mjs");
    await adoptCastEffects(castId);
    /*
     * AND THEN RECONCILE ONCE, AT THE CAST (3.586.0).
     *
     * FOUND LIVE, driving Antimagic Field on 23 September 2026. The
     * field went up, the card named both creatures standing in it, and
     * their magic went on working — a +1 Brawn still reading +1 — until
     * somebody happened to MOVE and the movement sweep ran. The card
     * said a thing had happened and nothing had: the silent-nothing
     * shape, in the release that added two checks against it.
     *
     * WHY IT HAD NEVER MATTERED BEFORE. Every live emanation until now
     * applied a BONUS, which `applySpellEffects` places at the cast and
     * `adoptCastEffects` above then takes ownership of — the sweep had
     * nothing left to do on the first frame. `perTurn` needs nothing at
     * the cast either, because its whole rule fires on a turn boundary.
     * An antimagic field is the first kind whose effect is owed to the
     * people standing there the moment it appears, and the only code
     * that knows who those are is the sweep.
     *
     * SO THE SWEEP IS ASKED, ONCE, rather than teaching the cast a
     * second way to apply an emanation. It is a no-op for the ten
     * emanations that predate this: `emanationDelta` compares who is
     * inside against who already holds it, and the creatures caught at
     * the cast were just adopted as holders on the line above.
     */
    const record = runningEmanations().find((r) => r.entry.id === castId);
    if (record) await refreshEmanation(record);
  }
  return entry;
}

/**
 * Grow one emanation by what a single Sustain buys, and reconcile it.
 *
 * ─────────────────────────────────────────────────────────────────────
 * PROTECTIVE WARD, and the reason the growth lives on the RECORD rather
 * than being re-read from the spell.
 *
 * Graham, 28 August 2026: "You can Sustain the Spell each round to
 * extend the radius of the aura by 5 feet, up to a maximum of 30 feet",
 * and his ruling that the growth STAYS — stop sustaining at twenty feet
 * and it is twenty feet for the rest of the minute. So the current
 * radius is a fact about this casting that changes over its life, and
 * the entry is the only thing that knows it. Re-reading the spell would
 * answer "ten" every time.
 *
 * THE REFRESH IS THE POINT, not the number. A wider circle catches
 * creatures who have not moved at all, and every one of them must be
 * given the bonus by the same path that gives it to somebody walking in.
 * Growing the radius without reconciling would be a bigger picture of an
 * unchanged spell.
 *
 * @param {Actor} actor the caster
 * @param {string} castId the active-spell entry's id
 * @returns {Promise<{radiusFeet: number, grewBy: number, atMax: boolean}|null>}
 */
export async function growEmanation(actor, castId) {
  const entries = getActiveSpells(actor);
  const entry = entries.find((e) => e.id === castId);
  const emanation = entry?.emanation ?? null;
  if (!emanation?.growth) return null;

  const grown = grownRadius(emanation.radiusFeet, emanation.growth);
  if (!grown.grewBy) return grown;

  // WRITTEN DIRECTLY RATHER THAN THROUGH `recordEmanation`, which would
  // also re-adopt the cast's effects. Nothing has been cast here; only a
  // number on a record that already exists has changed.
  emanation.radiusFeet = grown.radiusFeet;
  await setActiveSpells(actor, entries);

  const record = runningEmanations().find((r) => r.entry.id === castId);
  if (record) await refreshEmanation(record);
  return grown;
}


/**
 * Lift one emanation's effects from EVERY creature carrying them.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE DEFECT THIS FIXES, latent since 3.426.0 and found while building
 * the expiry sweep above.
 *
 * `endActiveSpell` tears an ended spell's effects off the caster and off
 * `entry.targets` — the list drawn up AT THE CAST. That was complete
 * back when a spell's effects could only land on whoever it was cast at.
 * A live emanation breaks the assumption: a creature that walks in
 * afterwards is given the bonus and is never added to that list, so
 * dismissing Bless left every latecomer permanently blessed.
 *
 * It survived live testing four times over because the natural way to
 * test an emanation is to walk somebody OUT of it, and walking out
 * removes the effect by the other path entirely.
 *
 * SWEPT OVER THE CANVAS, not over a list, because the list is exactly
 * what was wrong. The castId is the identity, and the emanation marker
 * is what separates the effects that are lifted by leaving from the ones
 * a spell hung on you for its duration wherever you go.
 *
 * AND THE CIRCLE GOES WITH THEM. `placeSpellTemplate` creates a Region
 * and nothing has ever deleted one, so every area spell ever cast has
 * left its outline on the scene for good. That was cosmetic while the
 * circle was inert scenery; a ward that fades at the end of its minute
 * and leaves a ten-foot ring following its caster around is a picture of
 * a spell that is still running, which is worse than litter.
 *
 * @param {string} castId
 * @param {object|null} emanation the stored descriptor, for its regionId
 * @returns {Promise<number>} how many creatures were cleared
 */
export async function endEmanationEverywhere(castId, emanation = null) {
  // A PLAYER ENDING THEIR OWN EMANATION (3.645.0, F3): the creatures in it
  // and its Region are the GM's to write, so the GM's client clears them.
  if (!isActingGM()) {
    await askGMClient("emanation.end", { castId, emanation: emanation ? { regionId: emanation.regionId ?? null } : null });
    return 0;
  }
  const { removeEmanationEffectsFrom } = await import("./emanation-effects.mjs");
  let cleared = 0;
  for (const token of canvas?.tokens?.placeables ?? []) {
    if (!token.actor) continue;
    if (await removeEmanationEffectsFrom(token.actor, castId)) cleared += 1;
  }
  const regionId = emanation?.regionId ?? null;
  if (regionId && canvas?.scene?.regions?.get(regionId)) {
    await canvas.scene.deleteEmbeddedDocuments("Region", [regionId]);
  }
  return cleared;
}

/**
 * Register the hooks. Called once from the system's ready hook.
 *
 * GUARDED BY isActingGM, NOT isGM — the lesson creature auras learned at
 * 3.255.0: a hook fires on every connected client, and with two GMs
 * logged in an isGM guard reconciles twice and races itself.
 */
export function registerEmanations() {
  // THE REQUESTS A PLAYER'S CLIENT SENDS (3.645.0, F3) — see refreshEmanation.
  game.socket?.on(EMANATION_SOCKET, (data) => {
    if (!String(data?.action ?? "").startsWith("emanation.")) return;
    answerEmanationRequest(data).catch((error) => console.error("TRG Prime | emanation request failed", error));
  });

  // ANY token moving can change ANY emanation's membership: the caster
  // moving takes the circle with it, and anybody else moving walks into
  // or out of every circle on the scene. So the sweep is over all of
  // them rather than over the one that moved.
  Hooks.on("updateToken", async (tokenDocument, changed) => {
    if (!isActingGM()) return;
    if (changed?.x === undefined && changed?.y === undefined
      && changed?.elevation === undefined) return;
    await refreshAllEmanations();
  });

  // A token arriving or leaving changes the same question.
  Hooks.on("createToken", async () => {
    if (!isActingGM()) return;
    await refreshAllEmanations();
  });
  Hooks.on("deleteToken", async () => {
    if (!isActingGM()) return;
    await refreshAllEmanations();
  });
}

/** The highest `conditionFloors[condition]` on any active effect of the actor. */
function effectConditionFloor(actor, condition) {
  let floor = 0;
  for (const effect of actor?.appliedEffects ?? actor?.effects ?? []) {
    if (effect.disabled) continue;
    const value = Number(effect.flags?.["trg-prime"]?.conditionFloors?.[condition] ?? 0);
    if (value > floor) floor = value;
  }
  return floor;
}

/**
 * The floor in force on one creature for one condition, right now.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE HALF THAT MAKES "CANNOT REDUCE" TRUE.
 *
 * Applying frightened 1 on arrival is the easy half and, on its own,
 * decorative: the sweep runs when somebody MOVES, so a creature standing
 * still inside Song Of Despair could roll its recovery, drop to 0, and
 * stay there until the next footstep. The spell says it cannot.
 *
 * So the recovery asks this before it writes, and the answer is read
 * from where the tokens actually are — the same reasoning
 * `allyAuraConditionalsFor` records for reading position at roll time
 * rather than from derived data.
 *
 * @param {Actor} actor
 * @param {string} condition
 * @returns {number} the minimum, or 0 if none applies
 */
export function conditionFloorFor(actor, condition) {
  // A FLOOR CARRIED ON THE CREATURE ITSELF (3.561.0) — Pillars of Faith's
  // Korath: "its frightened condition cannot be reduced below 1 until the
  // end of your next turn". Stamped on the target as an effect with
  // `flags.trg-prime.conditionFloors` by whatever inflicted it, and read
  // here beside the emanation floors so every reducer asks one question.
  let floor = effectConditionFloor(actor, condition);
  const tokens = actor?.getActiveTokens?.() ?? [];
  if (!tokens.length) return floor;
  const token = tokens.find((t) => t.controlled) ?? tokens[0];
  if (!token?.document) return 0;
  const here = tokenCentreFeet(token.document);
  for (const record of runningEmanations()) {
    const value = Number(record.emanation?.floors?.[condition] ?? 0);
    if (!value) continue;
    const inside = emanationMembers({
      centreFeet: tokenCentreFeet(record.token.document),
      radiusFeet: record.emanation.radiusFeet,
      subjects: [{ id: token.id, centreFeet: here, disposition: token.document.disposition }],
      casterDisposition: record.token.document.disposition,
      mode: record.emanation.mode
    });
    if (inside.length) floor = Math.max(floor, value);
  }
  return floor;
}
