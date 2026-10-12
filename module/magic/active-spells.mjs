/**
 * Active-spell registry (Chapter 9): the caster-side record of spells that are
 * still "running" — sustained spells and spells whose PP is locked by an
 * extended duration. Kept as a flag list on the caster so it survives reloads.
 *
 * Two Chapter-9 rules ride on this:
 *  - Extended-duration PP locking: a spell that lasts "until your next daily
 *    preparations" locks its spent PP until then; an "unlimited" spell locks it
 *    until dismissed. Locked PP can't be recovered.
 *  - Sustained spells: last until the end of your next turn; the Sustain a Spell
 *    action extends that, and you can't recover PP while sustaining one. A
 *    "Sustained"-word spell that isn't sustained in time lapses (its effects are
 *    removed); an "(S)" spell persists its fixed duration but is dormant.
 *
 * Each entry: { id, name, pp, lock, sustained, sustainType, castRound,
 *   sustainRound, targets, dismissible, ends }.  `id` doubles as the castId flag
 *   on the effects the spell applied, so ending an entry tears down exactly its
 *   own effects.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE THIRD REASON TO BE ON THIS LIST (3.494.0): (D).
 *
 * FOUND LIVE on 5 September 2026 while testing Delayed Respite's
 * dismissal. `magic/dismiss.mjs` has been complete since 3.434.0 — 1 AP,
 * Concentrate, both doors wired, reaching "every active entry" — but the
 * gate in cast-workflow.mjs registered a cast only when it LOCKED PP,
 * was SUSTAINED, or had a LIVE EMANATION. A duration that prints (D),
 * whose entire meaning is "this can be dismissed", registered nothing.
 *
 * Measured against the live pack: 692 spells, 56 printing (D), and 53 of
 * those neither sustained nor locked. So Dismiss could only end spells
 * that were dismissible for some OTHER reason — Shield, Mirror Image,
 * Levitate, Antimagic Field, Geas, every Shape Of The ⟨…⟩, all three
 * Prisons and Delayed Respite among the ones it could not touch.
 *
 * This is the Umbral Veil shape one door over: a registration gate that
 * asks the wrong question, so a spell needing the registry for one
 * reason never gets it. Graham ruled on 5 September: register every (D)
 * spell, marked as MERELY dismissible — it locks no PP and the sustained
 * sweep never sees it.
 *
 * WHICH MAKES THE EXPIRY LOAD-BEARING. Everything registered before this
 * had something that ended it: a lock ends at daily preparations, a
 * sustained spell at its lapse, an emanation on its own stamped clock.
 * A plain "1 minute (D)" had none, so registering 53 more spells without
 * a clock would have traded a gap for a panel filling up with spells
 * that ended some time last session. They wear the emanation's own
 * stamp — see magic/spell-ends.mjs — and one sweep now reads both.
 */
import { removeEffectsByCastId } from "../combat/effect-application-workflow.mjs";
import { endsHaveElapsed } from "./spell-ends.mjs";
import { emanationHasElapsed } from "./emanation-growth.mjs";
import { spellIsOrphaned } from "./orphaned-spells.mjs";
import { roundsHeld } from "./sustain-clock.mjs";

const SYSTEM_ID = "trg-prime";
const FLAG = "activeSpells";

// ---------------------------------------------------------------------------
// Pure helpers (no Foundry globals) — unit-tested by verify-casting-focus.mjs.
// ---------------------------------------------------------------------------

/**
 * The PP-lock condition implied by a spell's duration text, or null.
 * @param {string} duration
 * @returns {"dailyPrep"|"unlimited"|null}
 */
export function ppLockCondition(duration) {
  const t = String(duration ?? "").toLowerCase();
  if (/daily prep/.test(t)) return "dailyPrep";
  // "PERMANENT" IS A LOCK TOO (3.521.0). Three warps in the pack replace
  // a locked duration with the word "permanent" — Antipathy and Sympathy
  // from "Until next daily preparation", Continual Light from
  // "unlimited" — and it matched nothing here, so BUYING A LONGER
  // DURATION RELEASED PP THAT THE SHORTER ONE HELD. A duration that
  // never ends cannot free the points sooner than one that does.
  if (/unlimited|permanent/.test(t)) return "unlimited";
  return null;
}

/**
 * Does this duration print (D) — "this spell can be dismissed"?
 *
 * READ OFF THE DURATION, which is where the book puts it, and asked in
 * the same file as the PP lock because both are one question about one
 * string: what does this duration oblige the system to remember?
 *
 * @param {string} duration
 * @returns {boolean}
 */
export function isDismissibleDuration(duration) {
  return /\(\s*D\s*\)/i.test(String(duration ?? ""));
}

/**
 * THE DURATION THIS CAST ACTUALLY HAS, warps folded in.
 *
 * NEW at 3.521.0, and it exists because SIX PLACES were each written as
 * `warpMods?.durationText || spellData.duration` — the cast card, the
 * effect application, the PP lock, the Region's expiry, the wildshape
 * rider and the effects engine. Six copies of one question is the shape
 * this project keeps paying for, and here it had already gone wrong.
 *
 * ─────────────────────────────────────────────────────────────────────
 * A WARP MUST NOT SILENTLY TAKE THE (D) AWAY.
 *
 * `(D)` on a printed duration means "this spell can be dismissed", and
 * `isDismissibleDuration` reads it straight off the text. So a warp that
 * REPLACES the text — "the duration becomes 10 minutes" — dropped it,
 * and the spell stopped being dismissible. Measured before the fix:
 * EIGHTEEN live warps did this, including Levitate, Cloudkill, Iron
 * Body, Lock and seven of the nine Shape spells. A caster paid PP for a
 * longer duration and lost the ability to end it early — an upgrade that
 * quietly took something away.
 *
 * CARRIED FORWARD RATHER THAN AUTHORED EIGHTEEN TIMES, because it is a
 * rule and not eighteen coincidences: lengthening a duration says
 * nothing about dismissing it, and a warp that genuinely meant to remove
 * (D) would have to say so — none of the eighteen does.
 *
 * @param {string} printed the spell's own duration line
 * @param {object} warpMods aggregated warp mods
 * @returns {string}
 */
export function warpedDurationText(printed, warpMods = {}) {
  const base = String(printed ?? "");
  const override = String(warpMods?.durationText ?? "").trim();
  if (!override) return base;
  if (isDismissibleDuration(base) && !isDismissibleDuration(override)) {
    return `${override} (D)`;
  }
  return override;
}

/**
 * Is this cast still sustained, after the warps are counted?
 *
 * GRAHAM'S RULING, 9 Sep 2026: "the fixed duration replaces sustaining."
 * A warp that buys Circle Of Warmth an hour buys an hour, not an hour of
 * sustaining it every turn.
 *
 * WHAT THE CARD SAID BEFORE THIS RULE, live at 3.537.0:
 *
 *     Warped — +4 PP: the duration changes until next daily preparation.
 *     Sustained — active in your Spellcasting panel; Sustain it each turn.
 *
 * Both lines, on the same card, about the same cast. The contradiction is
 * older than the warps built at 3.537.0 — the 1-hour rung, built long
 * before, printed it too.
 *
 * LIFEKEEPING IS THE REASON THIS TAKES A FLAG RATHER THAN INFERRING IT
 * FROM `durationText`. That spell carries both readings as separate
 * warps — "1 minute (S)" and "1 minute (no longer needs to be sustained
 * each round)" — identical durations, opposite answers. Nothing derivable
 * from the duration string can tell them apart, so the data says which,
 * and the "(S)" rung simply does not carry the flag.
 *
 * THE CALLERS MUST ALL ASK THIS, NOT `spellData.sustained`. There are
 * four of them and they are not interchangeable:
 *
 *   - the card's Sustained banner
 *   - the registry entry's own `sustained` field, which is what the
 *     Spellcasting panel reads. Dropping the banner alone would leave a
 *     sustain entry in the panel for a spell whose card never mentioned
 *     it — worse than the honest contradiction it replaced.
 *   - `ends`, which stamps a clock for anything not locked or sustained.
 *     This is the point: an unsustained hour SHOULD get an hour's clock,
 *     and it gets it from the WARPED duration text, which is what
 *     `parsedForEnd` already parses.
 *   - `castWillRegister`, whose own header warns that it and the
 *     registration "could ever disagree" is how the sweep comes to "miss
 *     real orphans or delete live effects".
 *
 * @param {boolean} sustained the spell's printed sustained flag
 * @param {object} warpMods aggregated warp mods
 * @returns {boolean}
 */
export function sustainAfterWarp(sustained, warpMods = {}) {
  if (!sustained) return false;
  return !warpMods?.endsSustain;
}

/**
 * What the caster's panel says an entry is doing.
 *
 * COMPUTED HERE RATHER THAN BRANCHED IN THE TEMPLATE. The template read
 * `{{#if sustained}}Sustained{{else}}PP locked ({{lock}}){{/if}}`, whose
 * else-branch was true only while every unsustained entry was locked —
 * which stopped being true the moment (D) spells joined the list, and
 * would have printed "PP locked ()" over a Shield that locks nothing.
 *
 * @param {object} entry
 * @returns {string}
 */
/**
 * Will this cast get a registry entry?
 *
 * THE FIVE LIMBS ARE `cast-workflow`'s OWN GUARD, lifted verbatim
 * (3.528.0) rather than re-derived — a locked spell, a sustained one, a
 * live emanation, a dismissible one, or a single-casting one.
 *
 * WHY IT IS A NAMED RULE NOW. A spell effect is stamped `endsWithCast`
 * when its cast is registered, and the sweep for stranded effects reads
 * that stamp. If the stamp and the registration ever disagreed, the sweep
 * would either miss real orphans or delete live effects — so BOTH sides
 * call this, and there is only one answer to disagree with.
 *
 * IT IS NOT A GUESS ABOUT DURATIONS, which is the whole point. The first
 * draft of the sweep inferred "no clock and not registered" from the
 * effect alone, and measuring it against the pack found 96 spells whose
 * effects carry no clock and whose casts are never registered — blank and
 * "varies" durations, Holy Shout and Banishment among them. That rule
 * would have deleted their effects the instant they landed. Stamping at
 * the source is safe by construction; inferring afterwards is not.
 *
 * @param {object} options
 * @param {string} options.durationText the warped duration this cast got
 * @param {boolean} options.sustained
 * @param {boolean} options.emanationLive
 * @param {boolean} options.singleCasting
 * @returns {boolean}
 */
/**
 * Every cast id currently registered anywhere in the world.
 *
 * ACROSS ALL ACTORS, because the registry row lives on the CASTER and the
 * effect it left may sit on an ally. A sweep that asked only the actor it
 * is cleaning would call every ally's buff an orphan.
 *
 * @param {Iterable<object>} actors
 * @returns {Set<string>}
 */
export function registeredCastIds(actors) {
  const out = new Set();
  for (const a of actors ?? []) {
    for (const e of (a?.getFlag?.("trg-prime", "activeSpells") ?? [])) {
      if (e?.id) out.add(e.id);
    }
  }
  return out;
}

/**
 * Remove this actor's effects whose registry row is gone.
 *
 * THE MIRROR OF `sweepOrphanedSpells`, which ends a ROW that has lost its
 * effects. This ends EFFECTS that have lost their row — the case found in
 * TRG V14 on 8 September 2026, where nine Bless effects sat on three NPCs
 * with no clock, no row, and nothing that would ever collect them.
 *
 * ONLY STAMPED EFFECTS ARE TOUCHED. See `strandedEffectIds`: an effect
 * with no `endsWithCast` came from a cast that was never registered, and
 * two thirds of the pack is exactly that. Measuring the naive rule — "no
 * clock and no row" — found 96 spells it would have deleted on landing.
 *
 * @param {Actor} actor
 * @param {Set<string>} registered every live cast id, from `registeredCastIds`
 * @returns {Promise<string[]>} the names of what was removed
 */
export async function sweepStrandedEffects(actor, registered) {
  const ids = strandedEffectIds(Array.from(actor?.effects ?? []), registered);
  if (!ids.length) return [];
  const names = ids
    .map((id) => actor.effects.get(id)?.name)
    .filter(Boolean);
  await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
  return names;
}

export function castWillRegister({ durationText, sustained, emanationLive, singleCasting } = {}) {
  return Boolean(ppLockCondition(durationText))
    || Boolean(sustained)
    || Boolean(emanationLive)
    || isDismissibleDuration(durationText)
    || Boolean(singleCasting);
}

/**
 * Every effect on this actor that belonged to a cast nobody is running.
 *
 * PURE, AND IT TAKES THE REGISTERED IDS RATHER THAN LOOKING THEM UP.
 * The registry lives on the CASTER and the effect may sit on an ally, so
 * the caller has to gather ids across every actor first — and a rule that
 * did its own lookup would be a rule the harness could not drive.
 *
 * ONLY STAMPED EFFECTS ARE CANDIDATES. An effect with no stamp came from
 * a cast that was never registered, which is the ordinary case for two
 * thirds of the pack; it ends on its own clock and is none of this
 * sweep's business.
 *
 * @param {Array<object>} effects the actor's effects
 * @param {Set<string>} registeredIds every cast id currently in any registry
 * @param {string} systemId
 * @returns {string[]} effect ids to remove
 */
export function strandedEffectIds(effects, registeredIds, systemId = "trg-prime") {
  const live = registeredIds instanceof Set ? registeredIds : new Set(registeredIds ?? []);
  return (Array.isArray(effects) ? effects : [])
    .filter((e) => {
      const f = e?.flags?.[systemId];
      if (!f?.endsWithCast || !f.castId) return false;
      return !live.has(f.castId);
    })
    .map((e) => e.id)
    .filter(Boolean);
}

export function activeSpellState(entry) {
  if (entry?.sustained) {
    return entry.sustainType ? `Sustained (${entry.sustainType})` : "Sustained";
  }
  if (entry?.lock) return `PP locked (${entry.lock})`;
  if (entry?.emanation) return "Emanation";
  // A FIFTH WORD AT 3.512.0, and the fallback above is exactly why it is
  // needed. FOUR SPELLS START BEING REGISTERED THIS RELEASE for the
  // one-at-a-time rule alone — Breeze, Veiled Secret, Contingency and Pass
  // Without Trace — and not one of them prints (D). Without this line the
  // panel would call all four "Dismissible", which is the same mistake as
  // the two-way branch this function replaced: a fallback true only while
  // the list held nothing else.
  //
  // NO SPELL IS BOTH TODAY, so the order between this and the fallback
  // decides nothing; it is written this way round because "Dismissible"
  // says nothing a reader cannot see — the end button is offered on every
  // row — while "One at a time" says why the row is there at all.
  if (entry?.singleCasting) return "One at a time";
  return "Dismissible";
}

/** Total PP currently locked by extended-duration spells. */
export function lockedPP(entries = []) {
  return entries.reduce((sum, e) => sum + (e?.lock ? Number(e.pp) || 0 : 0), 0);
}

/** Whether the caster is sustaining any spell (blocks PP recovery). */
export function hasSustained(entries = []) {
  return entries.some((e) => e?.sustained);
}

/**
 * Whether a sustained spell lapses at the start of the caster's turn in the
 * given round. A "Sustained"-word spell lasts through the turn after it was last
 * sustained; if two rounds have passed without a Sustain, it lapses. An "(S)"
 * spell never lapses this way (it runs its own fixed duration, just dormant).
 *
 * @param {object} entry
 * @param {number} currentRound
 * @returns {boolean}
 */
export function sustainedLapses(entry, currentRound) {
  if (!entry?.sustained || entry.sustainType !== "duration") return false;
  const last = Number(entry.sustainRound ?? entry.castRound ?? 0);
  return Number(currentRound) - last >= 2;
}

// ---------------------------------------------------------------------------
// Actor-bound operations.
// ---------------------------------------------------------------------------

/** The caster's active-spell entries (a copy). */
export function getActiveSpells(actor) {
  return Array.from(actor?.getFlag?.(SYSTEM_ID, FLAG) ?? []);
}

/**
 * EXPORTED AT 3.426.0 so a live emanation can hang its descriptor on the
 * entry that already knows the spell is running. It was module-local
 * because nothing outside had a reason to write one; now something does.
 */
export async function setActiveSpells(actor, entries) {
  await actor.setFlag(SYSTEM_ID, FLAG, entries);
}

/**
 * Register a newly-cast spell that keeps running (sustained and/or PP-locked).
 * Returns the entry (its id is the castId stamped on the spell's effects).
 */
export async function registerActiveSpell(actor, { id, name, pp = 0, lock = null, sustained = false, sustainType = null, castRound = null, targets = [], dismissible = false, singleCasting = false, ends = null, castingDC = 0, sustainChoices = [] }) {
  const entry = {
    id,
    name,
    pp: Number(pp) || 0,
    lock,
    sustained: Boolean(sustained),
    sustainType: sustainType ?? null,
    castRound,
    sustainRound: castRound,
    // HOW LONG IT HAS BEEN HELD, kept apart from `sustainRound` because
    // the two answer different questions — see `sustainActiveSpell`.
    sustainedRounds: 0,
    sustainCharged: 0,
    sustainExhausted: false,
    // THE DC THIS WAS CAST AGAINST (3.585.0), so an interrupted sustain's
    // Spell Concentration check opens already knowing its number rather
    // than asking the player to find a card that has scrolled away. The
    // same courtesy R9 added for an interrupted cast.
    castingDC: Number(castingDC) || 0,
    /*
     * WHAT A SUSTAIN BUYS, ON THE ENTRY ITSELF (3.586.0).
     *
     * This has been recorded since 3.435.0 — but only on the EMANATION
     * record, inside the branch of `castSpell` that draws a circle. A
     * spell with no area gets no emanation record, so Acid Arrow's
     * "Sustain to launch an additional arrow", authored last week, was
     * written into the pack and then never written anywhere a picker
     * could read it. Blink is the second such spell and is what found
     * it. See magic/sustain-choice.mjs.
     */
    sustainChoices: Array.from(sustainChoices ?? []).map((c) => ({ ...c })),
    targets: Array.from(targets ?? []),
    // WHY THIS ENTRY IS ON THE LIST, kept rather than inferred from the
    // absence of the other two reasons. The panel prints it, and a
    // reader that had to deduce "no lock and not sustained, therefore
    // (D)" would be one edit away from calling an emanation dismissible.
    dismissible: Boolean(dismissible),
    // AND WHETHER IT IS THE ONLY ONE ALLOWED (3.512.0). Stored on the
    // entry rather than looked up from the spell when the panel renders,
    // because the spell document may have been edited, re-imported or
    // deleted between the cast and the glance at the panel — and the
    // reason a row is on the list is a fact about the CASTING.
    singleCasting: Boolean(singleCasting),
    ends: ends ?? null
  };
  const entries = getActiveSpells(actor);
  entries.push(entry);
  await setActiveSpells(actor, entries);
  return entry;
}

/**
 * Remove one active spell and tear down the effects it applied.
 *
 * `dismissed` TRAVELS BECAUSE ONE SPELL CARES (3.494.0). Delayed
 * Respite's held blow prints "released early" when a person chose to end
 * the spell and plainly "lands" when its round simply ran out — and this
 * primitive is called by both a Dismiss and three different sweeps. The
 * default is the person, because the sweeps are the callers that know
 * they are not one and can say so.
 */
export async function endActiveSpell(actor, id, { dismissed = true } = {}) {
  const entries = getActiveSpells(actor);
  const entry = entries.find((e) => e.id === id);
  if (!entry) return null;
  await setActiveSpells(actor, entries.filter((e) => e.id !== id));
  // Remove the spell's own effects wherever they landed (caster + targets).
  const uuids = new Set([actor.uuid, ...(entry.targets ?? [])]);
  for (const uuid of uuids) {
    const target = uuid === actor.uuid ? actor : await fromUuid(uuid).then((d) => d?.actor ?? d).catch(() => null);
    if (target?.deleteEmbeddedDocuments) await removeEffectsByCastId(target, id, { dismissed });
  }
  // AND THE LATECOMERS (3.430.0). `targets` is the list drawn up at the
  // cast, which was a complete answer until an emanation started giving
  // its bonus to whoever walked in afterwards — those creatures were
  // never added to it, so ending the spell left them holding it for
  // good. Swept over the canvas rather than over the list, because the
  // list is the thing that was wrong. See endEmanationEverywhere.
  if (entry.emanation) {
    const { endEmanationEverywhere } = await import("./emanation-workflow.mjs");
    await endEmanationEverywhere(id, entry.emanation);
  }
  // AND THE AREA IT PLACED (3.610.0). A placed Region carries its own clock
  // (region-expiry), which is the whole printed duration; a sustained storm
  // that is not sustained, or a spell dismissed, ends sooner, and its
  // Region must go with it. Found authoring Storm Of Vengeance.
  {
    const { REGION_EXPIRY_FLAG } = await import("./region-expiry.mjs");
    const scene = globalThis.canvas?.scene ?? null;
    // AND ITS LIGHT CIRCLES (3.622.2; the 3.622.1 drive's F1, Graham's R1),
    // stamped or not: a circle whose duration nothing can count still ends
    // with the spell. See magic/light-shift.mjs.
    const { circlesOfCast } = await import("./light-shift.mjs");
    const regions = Array.from(scene?.regions ?? []);
    const circles = new Set(circlesOfCast(regions, id).map((r) => r.id));
    const gone = regions
      .filter((r) => r.getFlag?.("trg-prime", REGION_EXPIRY_FLAG)?.castId === id || circles.has(r.id))
      .map((r) => r.id);
    if (gone.length) await scene.deleteEmbeddedDocuments("Region", gone).catch(() => {});
  }
  return entry;
}

/**
 * End every registered spell whose own clock has run out.
 *
 * ─────────────────────────────────────────────────────────────────────
 * MOVED HERE AT 3.494.0, and widened. It was `sweepEmanationExpiry` in
 * emanation-workflow.mjs and swept one kind of stamp; it sweeps the
 * registry, which is this file's job, and there are two stamps now.
 *
 * THE FIRST LIVE EMANATION NOTHING ELSE ENDED (3.430.0). Every emanation
 * before Protective Ward was a "Sustained"-word spell, so
 * `sweepSustainedLapses` ended it within two unsustained rounds and the
 * question of a duration never came up. Protective Ward's minute is
 * flat: it is not sustained to stay alive, and its effects deliberately
 * carry no duration of their own (see emanation-effects.mjs). Without
 * this sweep, making the spell live would have replaced a ward that did
 * nothing with one that never stopped.
 *
 * AND NOW EVERY (D) SPELL (3.494.0), for exactly that reason one door
 * over: Shield's minute is flat too, and registering it so it could be
 * dismissed would otherwise have left it on the panel for good.
 *
 * ONE SWEEP FOR BOTH STAMPS rather than two beside each other. It
 * already walked every entry and already called `endActiveSpell`; a
 * second sweeper would have been a second thing to remember to call from
 * the turn clock AND the world clock, which is where the (D) gap came
 * from in the first place.
 *
 * READS BOTH CLOCKS, for the reason rage records: the world clock does
 * not necessarily advance in a fight and rounds do not exist outside
 * one. An unstamped entry is ignored, so the six emanations live before
 * 3.430.0 and the spells whose duration is "varies" pass through
 * untouched — see magic/spell-ends.mjs for why that is right.
 *
 * NOT A DISMISSAL. A duration running out is nobody's decision, and
 * Delayed Respite's card says so in as many words.
 *
 * @param {Actor} actor
 * @param {object} now {worldTime, round}
 * @returns {Promise<string[]>} the names of what ended
 */
export async function sweepActiveSpellExpiry(actor, { worldTime = null, round = null } = {}) {
  const ended = [];
  for (const entry of getActiveSpells(actor)) {
    const elapsed = endsHaveElapsed(entry?.ends, { worldTime, round })
      || emanationHasElapsed(entry?.emanation, { worldTime, round });
    if (!elapsed) continue;
    await endActiveSpell(actor, entry.id, { dismissed: false });
    ended.push(entry.name);
  }
  return ended;
}

/**
 * Mark an active sustained spell as sustained this round (extends it).
 *
 * TWO NUMBERS, NOT ONE (3.585.0). `sustainRound` is a TIMESTAMP and
 * answers "have they stopped?" for `sustainedLapses`. `sustainedRounds`
 * is a TALLY and answers "how long has this been going?" for page 241's
 * exhaustion check and PP re-expenditure. Deriving either from the other
 * is impossible — a spell sustained once in round 40 and a spell
 * sustained forty times both have `sustainRound` 40 — and until this
 * existed neither of those two costs could be charged at all.
 *
 * `charged` and `exhausted` ride alongside so the clock bills for each
 * ten minutes exactly once; see magic/sustain-clock.mjs.
 */
export async function sustainActiveSpell(actor, id, currentRound) {
  const entries = getActiveSpells(actor);
  const entry = entries.find((e) => e.id === id);
  if (!entry) return null;
  entry.sustainRound = Number(currentRound ?? entry.sustainRound ?? 0);
  entry.sustainedRounds = roundsHeld(entry) + 1;
  await setActiveSpells(actor, entries);
  return entry;
}

/**
 * Record what the clock has already collected from this entry.
 *
 * @param {Actor} actor
 * @param {string} id
 * @param {object} paid `{charged, exhausted}` — either may be omitted
 * @returns {Promise<object|null>} the updated entry
 */
export async function recordSustainDues(actor, id, { charged = null, exhausted = null } = {}) {
  const entries = getActiveSpells(actor);
  const entry = entries.find((e) => e.id === id);
  if (!entry) return null;
  if (charged !== null) entry.sustainCharged = Math.max(0, Math.floor(Number(charged) || 0));
  if (exhausted !== null) entry.sustainExhausted = Boolean(exhausted);
  await setActiveSpells(actor, entries);
  return entry;
}

/**
 * Turn-start sweep: end sustained "Sustained"-word spells that weren't sustained
 * in time. Returns the names of what lapsed. "(S)" spells are left untouched.
 */
export async function sweepSustainedLapses(actor, currentRound) {
  const entries = getActiveSpells(actor);
  const lapsed = entries.filter((e) => sustainedLapses(e, currentRound));
  for (const entry of lapsed) await endActiveSpell(actor, entry.id);
  return lapsed.map((e) => e.name);
}

/**
 * Daily preparation: release "until daily preparations" PP locks and end every
 * sustained spell (a new day breaks concentration). Returns the released entries.
 */
export async function releaseDailyPrepAndSustained(actor) {
  const entries = getActiveSpells(actor);
  const ending = entries.filter((e) => e.lock === "dailyPrep" || e.sustained);
  for (const entry of ending) await endActiveSpell(actor, entry.id);
  return ending;
}

/**
 * End every registered spell that has lost everything it applied.
 *
 * Graham's ruling of 7 September 2026 — see magic/orphaned-spells.mjs
 * for what it fixes and, more importantly, for the three kinds of entry
 * it must not touch.
 *
 * ASKS EVERY ACTOR THE ENTRY LISTED, plus the caster, because that is
 * where `endActiveSpell` goes looking when it tears one down. Both an
 * ActiveEffect and an `endsWithSpell` item carry the castId, so both are
 * asked: a row whose only survivor is a conjured weapon is not orphaned.
 *
 * @param {Actor} actor the caster
 * @returns {Promise<string[]>} the names of what ended
 */
export async function sweepOrphanedSpells(actor) {
  const ended = [];
  for (const entry of getActiveSpells(actor)) {
    if (!spellIsOrphaned(entry, true)) continue;   // cheap guards first
    let carries = false;
    for (const uuid of new Set([actor.uuid, ...(entry.targets ?? [])])) {
      const target = uuid === actor.uuid
        ? actor
        : await fromUuid(uuid).then((d) => d?.actor ?? d).catch(() => null);
      if (!target) continue;
      const hasEffect = Array.from(target.effects ?? [])
        .some((e) => e.getFlag?.(SYSTEM_ID, "castId") === entry.id);
      const hasItem = Array.from(target.items ?? [])
        .some((i) => i.getFlag?.(SYSTEM_ID, "castId") === entry.id
          && i.getFlag?.(SYSTEM_ID, "endsWithSpell") === true);
      if (hasEffect || hasItem) { carries = true; break; }
    }
    if (spellIsOrphaned(entry, carries)) {
      await endActiveSpell(actor, entry.id, { dismissed: false });
      ended.push(entry.name);
    }
  }
  return ended;
}
