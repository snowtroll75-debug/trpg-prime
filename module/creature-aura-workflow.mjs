/**
 * The Foundry half of creature auras: the circle on the canvas, the two
 * hooks that catch a creature, and the card that offers the save.
 *
 * The rules live in module/creature-auras.mjs and are pure. This file
 * owns tokens, Regions, hooks and chat — the split every other workflow
 * in this project uses, and the reason the trigger logic can be tested
 * without a canvas.
 *
 * THE CIRCLE IS A REGION, and deliberately the same machinery a spell's
 * area already uses (module/magic/spell-template.mjs) rather than a
 * second drawing system. The difference is that a spell's area is placed
 * once and an aura's follows its creature, so this file creates one
 * Region per emitted aura and moves it whenever the token moves.
 *
 * WHY NOT A TOKEN LIGHT OR A RING. Both are cosmetic: they draw a circle
 * and know nothing about who is inside it. A Region is a real document
 * with real geometry, which is what "any creature that moves into the
 * radius" needs.
 *
 * THE TWO HOOKS ARE DIFFERENT SHAPES on purpose:
 *   - "moves into the radius" is caught AFTER a move completes, because
 *     what matters is where the creature ended up.
 *   - "begins its turn" is caught on the combat turn changing, because
 *     that is the only moment Foundry tells anyone a turn has begun.
 *
 * AND EVERY HOOK IS GUARDED BY isActingGM(), NOT isGM. A hook fires on
 * every connected client; with two GMs logged in, an isGM guard draws
 * two circles and posts two cards. Found live at 3.255.0 in exactly that
 * way — see module/acting-gm.mjs.
 */

import {
  DEFAULT_IMMUNITY_SECONDS, aurasCatching, aurasOf, auraReachFeet, withAuraImmunity,
  immuneToAuraEffect,
  withAuraEffectImmunity,
  auraRolls, auraOutcomeTags, auraImmunityOpens, auraTraitEffectLands
} from "./creature-auras.mjs";
import { creatureTraits } from "./creature-traits.mjs";
import { isActingGM } from "./acting-gm.mjs";
import { terrainKindLabel } from "./magic/difficult-terrain.mjs";
import { allyConditionalsInForce } from "./aura-conditionals.mjs";

const SYSTEM_ID = "trg-prime";
const IMMUNITY_FLAG = "auraImmunities";
const REGION_FLAG = "auraRegion";

function line(text) {
  return `<p style="margin:2px 0">${text}</p>`;
}

/**
 * Where a token IS, as recorded — not as drawn, and not as animating.
 *
 * WHERE THE TOKEN IS TAKES THREE TRIES TO ASK CORRECTLY, and this is the
 * record of all three, because every one of them looked right and each
 * put the aura a step behind the creature:
 *
 *   token.center     — the canvas PLACEABLE, not re-rendered when the
 *                      hook fires. The last frame's answer. (3.255.0)
 *   tokenDocument.x  — looks authoritative, and is not: Foundry V14
 *                      ANIMATES a token document's own x and y across a
 *                      move, so mid-animation it reports where the
 *                      creature came from. (3.255.2)
 *   toObject().x     — the document's STORED data: the destination, the
 *                      instant the update is applied. This one.
 *
 * Measured live on a move to (1472, 1472): the hook saw
 * `changed = {x: 1472, y: 1472}`, `tokenDocument.x = 736`, and
 * `toObject().x = 1472`. Three readings of "where is it", one right.
 *
 * ONE HELPER, used by every read — the drawing AND the trigger. The
 * first fix corrected only the circle, which would have left a creature
 * walking into an aura judged at the square it came from.
 */
export function tokenCentre(tokenDocument) {
  const size = canvas?.dimensions?.size ?? 100;
  const source = tokenDocument?.toObject?.() ?? tokenDocument ?? {};
  return {
    x: Number(source.x ?? 0) + ((Number(source.width ?? 1) * size) / 2),
    y: Number(source.y ?? 0) + ((Number(source.height ?? 1) * size) / 2)
  };
}

/**
 * The same centre, in FEET.
 *
 * THE BOUNDARY BETWEEN PIXELS AND FEET IS HERE, and it is the only place
 * the two meet. The canvas draws in pixels; the rules are written in
 * feet; module/creature-auras.mjs never sees a pixel. Found live at
 * 3.255.3, when it did: pixel centres were compared against a reach in
 * feet, so an aura caught nobody unless they were within 15 PIXELS.
 */
export function tokenCentreFeet(tokenDocument) {
  const centre = tokenCentre(tokenDocument);
  const size = canvas?.dimensions?.size ?? 100;
  const distance = canvas?.dimensions?.distance ?? 5;
  const feetPerPixel = distance / size;
  return { x: centre.x * feetPerPixel, y: centre.y * feetPerPixel };
}

/** A token's own width, in feet. */
export function tokenWidthFeet(tokenDocument) {
  const source = tokenDocument?.toObject?.() ?? tokenDocument ?? {};
  return Number(source.width ?? 1) * (canvas?.dimensions?.distance ?? 5);
}

/** Every token on the canvas that emits at least one aura. */
export function auraEmitters() {
  const out = [];
  for (const token of canvas?.tokens?.placeables ?? []) {
    const auras = aurasOf(Array.from(token.actor?.items ?? []), token.actor?.system?.identity?.level ?? 0);
    if (!auras.length) continue;
    out.push({
      id: token.id,
      token,
      name: token.name,
      // Carried for the ally auras, which need to know who is whose —
      // see module/aura-conditionals.mjs. The save auras ignore it.
      disposition: token.document?.disposition,
      centreFeet: tokenCentreFeet(token.document),
      widthFeet: tokenWidthFeet(token.document),
      // THE EMITTER'S STATE (3.633.0): "submerged" while the underwater
      // rail's effect is on it — Mucus Cloud's "in its aquatic environment".
      states: Array.from(token.actor?.effects ?? []).some((e) => !e.disabled && e.getFlag?.(SYSTEM_ID, "submerged")) ? ["submerged"] : [],
      auras
    });
  }
  return out;
}

/**
 * The ally-aura conditionals in force for an actor, read off the canvas.
 *
 * WHY THIS IS NOT DERIVED DATA. Every other conditional in this system is
 * either authored on an item or published in `prepareDerivedData` (the
 * runes). Neither works here: whether you are standing in a circle
 * changes when a token moves, and a token moving does not re-derive
 * anyone else's actor. Cached in derived data it would be stale exactly
 * when it mattered — the character who just stepped into the aura is the
 * character about to roll.
 *
 * So it is read at the moment of the roll, from where the tokens
 * actually are.
 *
 * WHICH TOKEN. An actor may have several on the canvas, in different
 * places, and they cannot all be the one rolling. The controlled one if
 * there is one — because that is the token the person is looking at when
 * they roll — and otherwise the first. Returning nothing at all when
 * there is no token is correct: a character not on the map is not
 * standing in anyone's aura.
 */
export function allyAuraConditionalsFor(actor) {
  const tokens = actor?.getActiveTokens?.() ?? [];
  if (!tokens.length) return [];
  const token = tokens.find((t) => t.controlled) ?? tokens[0];
  if (!token?.document) return [];
  return allyConditionalsInForce({
    subject: {
      id: token.id,
      centreFeet: tokenCentreFeet(token.document),
      disposition: token.document.disposition
    },
    emitters: auraEmitters()
  });
}

/** A token's own immunity record, and the world time to measure against. */
function immunityState(token) {
  return {
    immunities: token.actor?.getFlag?.(SYSTEM_ID, IMMUNITY_FLAG) ?? {},
    now: Number(game?.time?.worldTime ?? 0)
  };
}

/**
 * Draw (or move) the Regions for one emitting token.
 *
 * One Region per aura, flagged with the token and aura it belongs to, so
 * a second call moves the same Region rather than littering the scene
 * with copies — which is what a naive create-on-move would do, once per
 * step, for ever.
 */

/**
 * Run work for one key strictly after the previous work for that key.
 *
 * refreshAuraRegions is a read-modify-write against the scene: it reads
 * which Regions exist, deletes the ones no aura wants, and creates the
 * ones missing. That is safe exactly as long as two of them never
 * overlap — and they do overlap, because `createItem` is a Foundry hook
 * and FOUNDRY DOES NOT AWAIT HOOK CALLBACKS. Adding three aura abilities
 * in one call fires three of them at once.
 *
 * Found live at 3.267.0, and it failed in both directions: three
 * concurrent runs each read the scene before any had written, so one
 * ability produced NO Region (a later run deleted it as an orphan,
 * having read the item list before it arrived) and three abilities
 * produced THREE COPIES of the same circle.
 *
 * This is the same defect, and the same fix, as the grant reconciliation
 * in feats-workflow.mjs — which recorded it at 3.193.0 and which this
 * file did not learn from. Chaining per token makes the later calls see
 * the earlier ones' work, at which point they correctly find nothing
 * left to do.
 *
 * Exported so a harness can drive it with overlapping calls rather than
 * reading the code back.
 */
const IN_FLIGHT = new Map();

/**
 * What to delete and what to create so a Region's behaviours match.
 *
 * Pure, and exported so the harness can assert the property that
 * actually matters: running it against its own result asks for NOTHING.
 * An update that is not idempotent is an update that runs on every token
 * move, and this one used to add a behaviour each time.
 */
/**
 * The Region behaviours a terrain aura wants.
 *
 * Exported and pure so its payload can be checked against Foundry's own
 * schema in a harness — which is the whole point. This shipped once with
 * `system: { terrain: { difficulty: 2 } }`, and Foundry accepted the
 * document, discarded the unknown key, defaulted every difficulty to 1
 * and charged normal movement. See module/schema-guard.mjs.
 *
 * The page exempts creatures with a trait ("any creature that does not
 * have the Air trait"), which this behaviour cannot express — so every
 * movement type is charged and the exemption is named on the Region for
 * whoever is running the creature.
 */
/**
 * WHICH MOVEMENTS ARE CHARGED (3.501.0). Every creature aura charges all
 * four and always has, so that stays the default and none of them
 * changed. Warped Terrain's +6 PP warp needed the other shape: "the
 * illusion appears in the AIR rather than on a surface, causing it to
 * function as difficult terrain for FLYING creatures" — flight charged,
 * walking free. Listing the types rather than adding a boolean means the
 * printed version of the same spell can charge the ground movements and
 * leave flight alone, which is the half the book states and nothing had
 * a way to say.
 */
const ALL_MOVEMENTS = Object.freeze(["walk", "fly", "swim", "burrow"]);

/**
 * WHAT A CREATURE AURA CHARGES WHEN IT DOES NOT SAY (3.579.0).
 *
 * Page 196: "if you have a Fly speed, you are unhindered by difficult
 * terrain." Every creature aura charged all four movements, so a Dragon's
 * churned ground slowed a flying enemy above it — the block-19 audit's
 * D16, and Graham's R16 of 21 September 2026: an aura's difficult ground
 * stops charging fliers unless it says it reaches them.
 *
 * SAYING SO IS `movementTypes` WITH "fly" IN IT, which is the mechanism
 * the air-warp spells already use and needed no widening. The change is
 * only to what SILENCE means.
 */
const DEFAULT_AURA_MOVEMENTS = Object.freeze(["walk", "swim", "burrow"]);

export function terrainBehaviours(aura) {
  const cost = aura?.movementCostMultiplier;
  if (aura?.kind !== "terrain" || !cost) return [];
  // ABSENT AND EMPTY ARE DIFFERENT ANSWERS, and the first draft of this
  // conflated them: `Array.isArray(x) && x.length` is falsy for `[]`, so
  // an explicitly empty list fell through to charging ALL FOUR — the
  // exact opposite of what it asked for, and of what the comment below
  // it claimed. NO KEY means "every movement", which is what every
  // creature aura has always meant; AN EMPTY LIST means "none", and is
  // refused rather than silently widened.
  const listed = Array.isArray(aura.movementTypes) ? aura.movementTypes : null;
  const wanted = listed === null
    ? [...DEFAULT_AURA_MOVEMENTS]
    : listed.filter((m) => ALL_MOVEMENTS.includes(String(m)));
  // AN EMPTY LIST IS NOT A PATCH OF GROUND. A behaviour charging nothing
  // is a Region that exists, renders, and does not one thing — worse than
  // no Region, because the card would say it worked.
  if (!wanted.length) return [];
  const difficulties = {};
  for (const move of ALL_MOVEMENTS) difficulties[move] = wanted.includes(move) ? cost : 1;
  // PAGE 196'S OWN WORD FOR GROUND AT THIS PRICE (R16): ×3 is formidable
  // terrain, not difficult terrain with a bigger number.
  const kind = terrainKindLabel(cost);
  const exempt = [
    ...(aura.exemptTrait ? [`except ${aura.exemptTrait}`] : []),
    ...(wanted.includes("fly") ? [] : ["fliers unhindered"])
  ];
  return [{
    type: "modifyMovementCost",
    name: `${aura.name} (${kind}${exempt.length ? `, ${exempt.join(", ")}` : ""})`,
    system: { difficulties }
  }];
}

export function reconcileBehaviours(existing = [], wanted = []) {
  const key = (b) => `${b?.type}:${JSON.stringify(b?.system ?? {})}`;
  const wantedKeys = wanted.map(key);
  const keptKeys = new Set();
  const toDelete = [];
  for (const b of existing) {
    const k = key(b);
    // A duplicate of something wanted is still a duplicate: keep the
    // first, delete the rest.
    if (wantedKeys.includes(k) && !keptKeys.has(k)) { keptKeys.add(k); continue; }
    toDelete.push(b.id);
  }
  const toCreate = wanted.filter((b) => !keptKeys.has(key(b)));
  return { toDelete, toCreate };
}

export function serialiseByKey(key, work) {
  const previous = IN_FLIGHT.get(key) ?? Promise.resolve();
  const next = previous.then(work);
  // The TAIL is what keeps the queue alive: it swallows this run's
  // outcome, so a run that throws does not strand everything queued
  // behind it. The queue is about ORDER, not about success — and this
  // one line is what makes that true. A second rejection handler on
  // `next` looked like it did that job too, and no test could tell the
  // two apart, which is how you know one of them was doing nothing.
  IN_FLIGHT.set(key, next.then(() => {}, () => {}));
  return next;
}

/**
 * Resolves once every serialised run currently queued has finished.
 *
 * WHY THIS IS EXPORTED. Foundry does not await hook callbacks, so after
 * `createEmbeddedDocuments("Token", …)` resolves, the Regions that
 * token's aura wants have been QUEUED and not yet written. Anything that
 * wants to read back what Foundry actually created — which is the only
 * way to catch a silently-discarded key — has to wait for the queue
 * rather than for the call. The live suite does exactly that.
 *
 * It re-reads the queue after draining it, because a run chained behind
 * another only appears once the first has settled; a single
 * `Promise.all` would return with work still to come.
 */
export async function auraWorkSettled() {
  for (let round = 0; round < 10; round += 1) {
    const pending = Array.from(IN_FLIGHT.values());
    await Promise.all(pending);
    // A macrotask, so a hook that has fired but not yet reached its first
    // await gets to register itself before the next look.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const after = Array.from(IN_FLIGHT.values());
    if (after.length === pending.length && after.every((p, i) => p === pending[i])) return;
  }
}

export function refreshAuraRegions(tokenDocument) {
  // Serialised per token: see serialiseByKey above for what happens
  // otherwise, which is missing circles and duplicated ones.
  return serialiseByKey(`region:${tokenDocument?.id}`, () => refreshAuraRegionsNow(tokenDocument));
}

async function refreshAuraRegionsNow(tokenDocument) {
  const scene = tokenDocument?.parent;
  if (!scene || !canvas?.dimensions) return [];
  // The LEVEL matters: Frightful Aura is "5 feet x the creature's level"
  // and Whirlpool "5 feet emanation per level", so the circle has to be
  // computed from the creature rather than from the item alone — and
  // redrawn when it levels.
  const auras = aurasOf(Array.from(tokenDocument.actor?.items ?? []),
    tokenDocument.actor?.system?.identity?.level ?? 0);
  const existing = scene.regions?.filter(
    (region) => region.getFlag(SYSTEM_ID, REGION_FLAG)?.tokenId === tokenDocument.id) ?? [];

  // Auras that have gone (the ability was removed) take their Regions
  // with them, rather than leaving a circle nothing emits.
  const wanted = new Set(auras.map((aura) => aura.id));
  const orphans = existing.filter(
    (region) => !wanted.has(region.getFlag(SYSTEM_ID, REGION_FLAG)?.auraId));
  if (orphans.length) {
    await scene.deleteEmbeddedDocuments("Region", orphans.map((region) => region.id));
  }
  if (!auras.length) return [];

  const pxPerFt = canvas.dimensions.size / canvas.dimensions.distance;
  const centre = tokenCentre(tokenDocument);
  const widthFeet = tokenWidthFeet(tokenDocument);

  const created = [];
  for (const aura of auras) {
    const radiusPx = auraReachFeet(aura.radius, widthFeet) * pxPerFt;
    const shape = {
      type: "circle", x: centre.x, y: centre.y, radius: radiusPx, hole: false
    };
    // Whirlwind and Whirlpool print no save: their radius simply IS
    // difficult ground. Foundry has a behaviour for exactly that, so the
    // Region carries it rather than this system inventing a second way
    // to make ground cost double.
    // Foundry's own schema is `difficulties`, keyed by movement type —
    // NOT `terrain.difficulty`, which is what this first shipped as.
    // The wrong key is not rejected: the behaviour is created, every
    // difficulty defaults to 1, and moving through costs exactly normal.
    // A behaviour that exists and does nothing is the worst shape of
    // defect this project keeps meeting, and it took a live look at the
    // created Region to see it.
    //
    // The page exempts creatures with a trait ("any creature that does
    // not have the Air trait"), which Foundry's behaviour cannot express
    // — so every movement type is charged and the exemption is the GM's,
    // stated on the ability's own text.
    const behaviors = terrainBehaviours(aura);

    const already = existing.find(
      (region) => region.getFlag(SYSTEM_ID, REGION_FLAG)?.auraId === aura.id);
    if (already) {
      await already.update({ shapes: [shape] });
      // Behaviours are EMBEDDED DOCUMENTS, not a plain field. Passing an
      // array to update() does not replace them — it adds more, so every
      // refresh piled another copy onto the Region and a token that moved
      // a dozen times carried a dozen identical behaviours. Reconciled
      // instead: delete what is not wanted, create only what is missing,
      // and do nothing at all when they already match.
      const { toDelete, toCreate } = reconcileBehaviours(
        already.behaviors?.map((b) => ({ id: b.id, type: b.type, system: b.system?.toObject?.() ?? b.system })) ?? [],
        behaviors
      );
      if (toDelete.length) await already.deleteEmbeddedDocuments("RegionBehavior", toDelete);
      if (toCreate.length) await already.createEmbeddedDocuments("RegionBehavior", toCreate);
      created.push(already);
      continue;
    }
    const [region] = await scene.createEmbeddedDocuments("Region", [{
      name: `${tokenDocument.name}: ${aura.name}`,
      shapes: [shape],
      behaviors,
      visibility: CONST.REGION_VISIBILITY?.ALWAYS ?? 2,
      flags: { [SYSTEM_ID]: { [REGION_FLAG]: { tokenId: tokenDocument.id, auraId: aura.id } } }
    }]);
    created.push(region);
  }
  return created;
}

/** Remove every aura Region a token owns. Called when it leaves. */
export function clearAuraRegions(tokenDocument) {
  return serialiseByKey(`region:${tokenDocument?.id}`, () => clearAuraRegionsNow(tokenDocument));
}

async function clearAuraRegionsNow(tokenDocument) {
  const scene = tokenDocument?.parent;
  const mine = scene?.regions?.filter(
    (region) => region.getFlag(SYSTEM_ID, REGION_FLAG)?.tokenId === tokenDocument.id) ?? [];
  if (mine.length) {
    await scene.deleteEmbeddedDocuments("Region", mine.map((region) => region.id));
  }
}

/**
 * One creature caught by one aura: the card, and the immunity window.
 *
 * THE SAVE IS OFFERED, NOT ROLLED. Every aura in the chapter that does
 * anything prints a saving throw, and this system's convention is that a
 * creature's own player or GM rolls it — the card carries the aura's
 * wording, its outcomes and a button, the way an affliction's does.
 */
/**
 * The outcomes of an ability an aura BEHAVES AS.
 *
 * Dreadcarve prints none of its own — "an aura of fear which behaves as
 * the Frightful Aura creature ability" — so its card fetches that
 * ability's six degrees from the compendium where they are authored
 * once. Copying them into the rune would have been a second Frightful
 * Aura, free to drift from the first.
 *
 * Returns {} when the ability cannot be found, which prints a card with
 * the aura, the DC and the borrowing named and no degree table, rather
 * than inventing outcomes for it.
 */
export async function borrowedOutcomes(abilityName) {
  const wanted = String(abilityName ?? "").trim().toLowerCase();
  if (!wanted) return {};
  const pack = game?.packs?.get(`${SYSTEM_ID}.creature-abilities`);
  if (!pack) return {};
  const documents = await pack.getDocuments();
  const ability = documents.find((doc) => String(doc.name).trim().toLowerCase() === wanted);
  const declared = ability?.flags?.[SYSTEM_ID]?.auras?.[0]?.outcomes
    ?? ability?.flags?.[SYSTEM_ID]?.creatureAbility?.activation?.outcomes;
  return declared && typeof declared === "object" ? { ...declared } : {};
}

export async function announceAura(subjectToken, aura, emitterToken) {
  const actor = subjectToken?.actor;
  if (!actor) return null;
  // AN AURA MAY NAME ANOTHER ABILITY RATHER THAN PRINT ITS OWN OUTCOMES.
  const outcomes = Object.keys(aura.outcomes ?? {}).length
    ? aura.outcomes
    : await borrowedOutcomes(aura.borrowsOutcomesFrom);
  const lines = [
    line(`<strong>${aura.name}</strong> — ${emitterToken?.name ?? "a creature"}'s aura, `
      + `${aura.radius} ft.`),
    aura.appliesTo ? line(`<em>${aura.appliesTo}</em>`) : "",
    aura.save
      // A PRINTED DC IS PRINTED. Without one the save is level-based and
      // the GM reads the emitter's own Level DC — which is what every
      // aura before Dreadcarve meant by not printing one.
      ? line(`<strong>${aura.save[0].toUpperCase()}${aura.save.slice(1)} save</strong>${
        aura.dc ? ` <strong>DC ${aura.dc}</strong>` : ""} to resist.`)
      : "",
    aura.borrowsOutcomesFrom
      ? line(`<em>Behaves as the ${aura.borrowsOutcomesFrom} creature ability.</em>`)
      : ""
  ].filter(Boolean);
  for (const [degree, outcome] of Object.entries(outcomes ?? {})) {
    lines.push(line(`<strong>${degree[0].toUpperCase()}${degree.slice(1)}</strong> ${outcome}`));
  }
  // THE PARTIAL WINDOW, READ (3.363.0). It had been WRITTEN since the
  // aura landed — a save against Aura of Despair recorded 24 hours of
  // immunity to the paralysis under its own key — and nothing ever read
  // it back, so the paralysis was re-offered every time the creature
  // stepped into the radius. `immuneToAuraEffect` was tested, correct and
  // called by nothing; found by tools/verify-rules-have-callers.mjs.
  //
  // ANNOUNCED, NOT SUPPRESSED. A degree line reads "frightened 2 and
  // paralysed for 1 round"; deleting it would take the fear away with the
  // paralysis, which is the exact mistake the rule warns against. So the
  // outcomes stand as printed and one line says which part no longer
  // lands — the GM applies the rest.
  {
    const state = immunityState(subjectToken);
    const effect = aura.partialImmunity?.to ?? "";
    if (effect && immuneToAuraEffect(state.immunities, aura.id, effect, state.now)) {
      lines.push(line(
        `<strong>Already immune to the ${effect}</strong> — ${actor.name} saved against `
        + `${aura.name} within the last ${Math.round((aura.partialImmunity.seconds ?? 0) / 3600)} hours. `
        + `Everything else in the outcome above still applies.`));
    }
  }
  if (aura.immunitySeconds > 0) {
    lines.push(line(
      `<em>Immune to ${aura.name} for ${aura.immunitySeconds} seconds after making a save.</em>`));
  }
  // A ROLLED AURA (3.627.0): the save is rolled here and its degree's
  // conditions applied — see creature-auras.mjs `auraRolls`. An aura that
  // declares none is still the card above and nothing more.
  const rolled = auraRolls(aura) ? await rollAuraSave(subjectToken, aura, emitterToken) : null;
  if (rolled) lines.push(...rolled.lines.map((l) => line(l)));
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="trg-prime trg-check-card"><header class="check-header">`
      + `<div class="check-heading"><span class="check-actor">${actor.name}</span>`
      + `<h3>${aura.name}</h3></div></header>${lines.join("")}</div>`
  });
  // The window opens when the creature is subjected to the aura, which
  // is the moment it is asked for a save — not when the roll comes back.
  // A creature that ignores the prompt is not caught again on its next
  // step across the same square.
  const { immunities, now } = immunityState(subjectToken);
  if (rolled?.skipped) {
    // Not a creature the aura reaches (not living): no save made, no window.
  } else if (rolled && aura.immunitySeconds > 0) {
    // A ROLLED AURA KNOWS THE RESULT, so "a creature that saves … is immune"
    // can be honoured as written (3.627.0); the default stays "regardless".
    if (auraImmunityOpens(aura, rolled.succeeded)) {
      await actor.setFlag(SYSTEM_ID, IMMUNITY_FLAG, withAuraImmunity(immunities, aura, now));
    }
  } else if (aura.immunitySeconds > 0) {
    await actor.setFlag(SYSTEM_ID, IMMUNITY_FLAG, withAuraImmunity(immunities, aura, now));
  } else if (aura.partialImmunity?.to) {
    // Aura of Despair: immune to the PARALYSIS for 24 hours, not to the
    // aura. Recorded under its own key so the fear keeps landing every
    // time the aura comes round, which is what the page says.
    await actor.setFlag(SYSTEM_ID, IMMUNITY_FLAG, withAuraEffectImmunity(immunities, aura, now));
  }
  return { aura, emitterId: emitterToken?.id ?? "" };
}

/**
 * Roll a rolled aura's save for the creature it caught and apply what the
 * degree lands (3.627.0). The DC is the printed one, or the emitter's Level
 * DC — "saving throws caused by Unliving class feats are level-based saving
 * throws using the Unliving character's level".
 *
 * @returns {Promise<{lines: string[], succeeded: boolean, skipped?: boolean}>}
 */
async function rollAuraSave(subjectToken, aura, emitterToken) {
  const actor = subjectToken?.actor;
  if (aura.livingOnly) {
    const { isLivingCreature } = await import("./kind-targeting.mjs");
    if (!isLivingCreature(actor?.system ?? {})) {
      return { lines: [`<em>${actor?.name ?? "It"} is not a living creature — ${aura.name} does not reach it.</em>`], succeeded: false, skipped: true };
    }
  }
  if (aura.appliesToTraits?.length) {
    const { alignedTraitsOf } = await import("./aligned.mjs");
    const have = alignedTraitsOf(actor?.system ?? {}).map((t) => String(t).toLowerCase());
    if (!aura.appliesToTraits.some((t) => have.includes(t))) {
      return { lines: [`<em>${actor?.name ?? "It"} is not ${aura.appliesToTraits.join(" or ")} aligned — ${aura.name} does not reach it.</em>`], succeeded: false, skipped: true };
    }
  }
  const { levelDC } = await import("./dice/resolution.mjs");
  const emitterLevel = Math.max(0, Math.floor(Number(emitterToken?.actor?.system?.identity?.level ?? 0) || 0));
  const dc = aura.dc || levelDC(emitterLevel);
  const save = aura.save;
  const { TRGCheck } = await import("./dice/check.mjs");
  const { withCheckModifiers } = await import("./dice/check-modifiers.mjs");
  const check = await TRGCheck.roll(withCheckModifiers({
    actor,
    label: `${actor.name} — ${save.charAt(0).toUpperCase()}${save.slice(1)} Save`,
    subtitle: `${aura.name} — DC ${dc}${aura.dc ? "" : ` (${emitterToken?.name ?? "the emitter"}'s Level DC)`}`,
    type: "save",
    save,
    dc,
    traits: aura.traits.join(", ")
  }));
  const degree = check?.outcome?.degree;
  const { immunities, now } = immunityState(subjectToken);
  const immuneToPartial = Boolean(aura.partialImmunity?.to) && immuneToAuraEffect(immunities, aura.id, aura.partialImmunity.to, now);
  const { text, tags } = auraOutcomeTags(aura, degree?.key ?? "failure", {
    immuneToPartial,
    combatRound: game.combat?.started ? Number(game.combat.round ?? 0) : null,
    worldTime: Number(game.time?.worldTime ?? 0)
  });
  const lines = [`<strong>Rolled:</strong> ${save} save <strong>${degree?.label ?? "?"}</strong> against DC ${dc}.${text ? ` ${text}` : ""}`];
  // "REDUCED TO 0 HIT POINTS, GAINING THE UNCONSCIOUS CONDITION" — the
  // fear ladders' Blunder. Not a condition, so written here.
  if (tags.some((t) => t.zeroHP)) {
    await actor.update({ "system.resources.hp.value": 0 });
    lines.push(`${actor.name} collapses — reduced to <strong>0 HP</strong>.`);
  }
  const conditionTags = tags.filter((t) => t.key && !t.zeroHP).map(({ resave, zeroHP, ...tag }) => tag);
  if (conditionTags.length) {
    const { applyConditionTags, formatAppliedTags } = await import("./combat/effect-application-workflow.mjs");
    const { conditionLabel } = await import("./conditions/condition-rules.mjs");
    const applied = await applyConditionTags(actor, conditionTags.map((t) => ({ ...t, label: conditionLabel(t.key) })), {});
    lines.push(`Applied: ${formatAppliedTags(applied)}.`);
  } else if (!tags.length && !aura.damage && !auraTraitEffectLands(aura, degree?.key ?? "failure")) {
    lines.push("<em>Unaffected.</em>");
  }
  // A TRAIT FOR A WHILE (3.633.0, F&F 3.0 R7): Mucus Cloud's failure —
  // Mucus-Bound, the Aquatic trait for 2 hours. See aura-trait-effect-workflow.
  if (auraTraitEffectLands(aura, degree?.key ?? "failure")) {
    const { applyAuraTraitEffect } = await import("./aura-trait-effect-workflow.mjs");
    lines.push(await applyAuraTraitEffect(actor, aura.traitEffect, { source: emitterToken?.name ?? aura.name }));
  }
  // AURA DAMAGE (3.631.0): the declared dice, basic by default — halved on
  // a Success, nothing on a Critical, an extra base die per failed
  // severity — through the typed-damage path so resistances meet it.
  if (aura.damage) {
    lines.push(await applyAuraDamage(actor, aura, degree, check, emitterToken));
  }
  return { lines, succeeded: Boolean(degree?.success) };
}

/** Everything that catches this token right now, for one trigger. */
/** Roll and apply a rolled aura's declared damage; the card line. */
async function applyAuraDamage(actor, aura, degree, check, emitterToken) {
  const { basicSavingThrow } = await import("./dice/resolution.mjs");
  const roll = await new Roll(aura.damage.formula).evaluate();
  const key = degree?.key ?? "failure";
  const bs = aura.damage.basic
    ? basicSavingThrow(key, check?.outcome?.margin ?? null)
    : { damageMultiplier: degree?.success ? 0 : 1, bonusBaseDamage: 0, criticalSeverity: null };
  let total = roll.total;
  const parts = [`<strong>${aura.damage.type} damage:</strong> ${roll.total} (${aura.damage.formula})`];
  if (bs.bonusBaseDamage > 0) {
    const die = /d(\d+)/i.exec(aura.damage.formula)?.[1] ?? "6";
    const bonus = await new Roll(`${bs.bonusBaseDamage}d${die}`).evaluate();
    total += bonus.total;
    parts.push(`${bs.criticalSeverity ?? "failed badly"}: +${bs.bonusBaseDamage} base (${bonus.total})`);
  }
  const amount = Math.floor(total * bs.damageMultiplier);
  if (amount <= 0) { parts.push("— no damage."); return parts.join(" "); }
  const { applyTypedDamage, describeDamage } = await import("./combat/damage-workflow.mjs");
  const level = Math.max(0, Math.floor(Number(emitterToken?.actor?.system?.identity?.level ?? 0) || 0));
  const dealt = await applyTypedDamage(actor, { amount, type: aura.damage.type, sourceLevel: level, sourceName: aura.name });
  parts.push(`— ${describeDamage(dealt.packet, actor.name)}`);
  return parts.join(" ");
}

export async function resolveAuras(tokenDocument, trigger) {
  const token = tokenDocument?.object;
  if (!token || !isActingGM()) return [];
  const { immunities, now } = immunityState(token);
  const caught = aurasCatching({
    trigger,
    subject: { id: token.id, centreFeet: tokenCentreFeet(tokenDocument), widthFeet: tokenWidthFeet(tokenDocument), immunities, traits: creatureTraits(token.actor?.system ?? {}).map((t) => String(t).toLowerCase()) },
    emitters: auraEmitters(),
    now
  });
  const announced = [];
  for (const { aura, emitterId } of caught) {
    const emitter = canvas.tokens.get(emitterId);
    announced.push(await announceAura(token, aura, emitter));
  }
  return announced;
}

/**
 * Could this item update change what the item emits?
 *
 * Three things can, and they are the three an inscribed aura depends on:
 * whether the item is WORN, what is INSCRIBED on it, and whether the
 * rune is currently UP. Anything else — hit points, quantity, a note —
 * cannot, and refreshing on those would put a scene-wide Region rebuild
 * behind the commonest event in a session.
 *
 * IT HAS TO ANSWER BOTH SHAPES, nested and flattened, for the same
 * reason `touchesLevel` does: code writes `{system: {equipped: true}}`
 * and a sheet submits `{"system.equipped": true}`.
 *
 * Exported and pure so the harness can drive both shapes rather than
 * reading the hook back.
 */
export function touchesAuraSource(changed) {
  if (!changed || typeof changed !== "object") return false;
  if (Object.hasOwn(changed, "system.equipped")) return true;
  if (Object.hasOwn(changed, "system.runes")) return true;
  if (Object.hasOwn(changed?.system ?? {}, "equipped")) return true;
  if (Object.hasOwn(changed?.system ?? {}, "runes")) return true;
  // The rune state lives in flags, and a toggle arrives as either
  // `{flags: {"trg-prime": {runeState: {...}}}}` or a dotted path.
  if (Object.keys(changed).some((key) => key.startsWith(`flags.${SYSTEM_ID}.runeState`))) return true;
  return Boolean(changed?.flags?.[SYSTEM_ID]?.runeState);
}

/**
 * Did this update change the creature's level?
 *
 * IT HAS TO ANSWER BOTH SHAPES. An update may arrive nested —
 * `{system: {identity: {level: 8}}}`, which is what code writes — or
 * FLATTENED, `{"system.identity.level": 8}`, which is what a sheet
 * submits, because a form's field names are dotted paths. A guard that
 * reads only the nested shape is a guard that works from the console and
 * not from the sheet, which is the harder kind of defect to notice: the
 * feature demonstrates perfectly and fails for the person using it.
 *
 * Exported and pure, so both shapes can be driven in a harness rather
 * than reasoned about.
 */
export function touchesLevel(changed) {
  if (!changed || typeof changed !== "object") return false;
  if (changed["system.identity.level"] !== undefined) return true;
  return changed.system?.identity?.level !== undefined;
}

/** Wire the hooks. Called once, from the system's ready pass. */
export function registerAuraHooks() {
  // MOVED INTO THE RADIUS — after the move, because where the creature
  // ended up is the question. `preMoveToken` is already spoken for by
  // the AP/opportunity machinery and answers a different one.
  Hooks.on("updateToken", async (tokenDocument, changed) => {
    if (!isActingGM()) return;
    const moved = "x" in changed || "y" in changed;
    if (!moved) return;
    await refreshAuraRegions(tokenDocument);
    await resolveAuras(tokenDocument, "enter");
  });

  // BEGINS ITS TURN — the only moment Foundry announces a turn starting.
  Hooks.on("updateCombat", async (combat, changed) => {
    if (!isActingGM()) return;
    if (!("turn" in changed) && !("round" in changed)) return;
    const tokenDocument = combat.combatant?.token;
    if (!tokenDocument) return;
    await resolveAuras(tokenDocument, "turnStart");
  });

  // An aura's circle should exist as soon as its creature does, and go
  // when it goes.
  Hooks.on("createToken", async (tokenDocument) => {
    if (isActingGM()) await refreshAuraRegions(tokenDocument);
  });
  Hooks.on("deleteToken", async (tokenDocument) => {
    if (isActingGM()) await clearAuraRegions(tokenDocument);
  });
  // A LEVEL CHANGE RESIZES THE CIRCLE. Frightful Aura is "5 feet x the
  // creature's level" and Whirlpool "5 feet emanation per level", so a
  // creature that levels up mid-session was emitting the radius it had
  // when the circle was first drawn. Found live at 3.267.1.
  Hooks.on("updateActor", async (actor, changed) => {
    if (!isActingGM()) return;
    if (!touchesLevel(changed)) return;
    for (const token of actor.getActiveTokens?.() ?? []) {
      await refreshAuraRegions(token.document);
    }
  });

  // An ability added or removed changes what a creature emits.
  for (const hook of ["createItem", "deleteItem"]) {
    Hooks.on(hook, async (item) => {
      if (!isActingGM() || !item.parent?.getActiveTokens) return;
      for (const token of item.parent.getActiveTokens()) {
        await refreshAuraRegions(token.document);
      }
    });
  }

  // AND AN ITEM CHANGING CHANGES IT TOO, which was not true until an
  // aura could be inscribed. A creature ability is added or removed and
  // nothing else about it matters; a Dreadcarve rune is COMMANDED up and
  // down, INSCRIBED onto an item that already exists, and the armour
  // carrying it is TAKEN OFF — three updates to an item that never
  // arrives and never leaves, and the circle has to follow all three.
  //
  // Narrowed to those three fields rather than refreshing on every item
  // update: an item update is one of the commonest events in a session,
  // and a scene-wide Region read-modify-write on each of them would be
  // felt at the table.
  Hooks.on("updateItem", async (item, changed) => {
    if (!isActingGM() || !item.parent?.getActiveTokens) return;
    if (!touchesAuraSource(changed)) return;
    for (const token of item.parent.getActiveTokens()) {
      await refreshAuraRegions(token.document);
    }
  });
}

export { DEFAULT_IMMUNITY_SECONDS };
