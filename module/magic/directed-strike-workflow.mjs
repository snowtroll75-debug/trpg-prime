/**
 * THE BALL, AIMED AGAIN EVERY TURN — the Foundry side of
 * magic/directed-strike.mjs.
 *
 * NEW at 3.588.0, for Graham's Ball Lightning rulings of 24 September
 * 2026. The rules themselves are next door and pure; this is the part
 * that has to know about tokens, dialogs and the turn clock.
 *
 * ─────────────────────────────────────────────────────────────────────
 * A BALL IS AN ACTIVE EFFECT ON THE CASTER, NOT A RECORD OF ITS OWN.
 *
 * The recurring ladder built last release keeps its spec on a REGION,
 * because Disturbing Tentacles is a place. A ball is not a place: it has
 * no footprint, it follows nobody, and what it remembers is a CREATURE.
 * So it lives where a caster's other ongoing spells live.
 *
 * That is worth more than tidiness. An ActiveEffect on the caster gets
 * the whole lifecycle for free — `spellEffect`, `spellEffectEnd`,
 * `conditionExpiresRound` and the `castId` teardown — so the minute ends
 * the ball without a second clock, a GM can see it on the Effects tab
 * and delete it, and Dispel reaches it like anything else. A bespoke
 * flag would have needed every one of those written again, and this
 * project has a list of what happens to the second copy of a clock.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE DIALOG DEFAULTS TO STRIKING, AND THAT IS THE RULING.
 *
 * Graham: on a turn where no free action is spent, the ball strikes its
 * current target. So a cancelled dialog, a closed dialog, a GM who is
 * not watching and a player who forgets all produce the same thing — the
 * strike happens. The only thing the free action buys is WHERE.
 *
 * `strikeTargetFor` holds that rule and this file does not re-decide it.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THE SAVE IS ROLLED HERE RATHER THAN CALLED FOR.
 *
 * Each strike is its own basic Reflex save (Graham's second ruling), and
 * the sequence a basic save runs — degree, `basicSavingThrow`, the
 * critical bonus dice off the BASE damage entry, `resolveAgainstDefences`,
 * `applyDamageAndCheckDying`, then the injury — is the same sequence
 * `cast-workflow` runs and `action-workflow` runs. Every RULE in it is
 * imported; what is written out here is the orchestration, which is
 * per-caller in this system already. Copying a rule would be the defect;
 * copying the order of five calls is how the other two callers work.
 */

import {
  DIRECTED_STRIKE_FLAG, directableTargets, directedStrikeLine,
  normaliseDirectedStrike, strikeTargetFor, targetsAreDistinct, withinDirectRange
} from "./directed-strike.mjs";

const SYSTEM_ID = "trg-prime";

/**
 * Every ball this caster currently has running.
 *
 * SKIPS DISABLED EFFECTS, the same rule `collectConditionals` and
 * `suppressedConditionValues` apply: a suppressed spell is switched off,
 * and an Antimagic Field that disables the ball must stop it striking
 * rather than merely hide it from the sheet.
 */
export function runningBalls(actor) {
  const out = [];
  for (const effect of actor?.effects ?? []) {
    if (effect.disabled) continue;
    const raw = effect.getFlag?.(SYSTEM_ID, DIRECTED_STRIKE_FLAG) ?? null;
    const spec = normaliseDirectedStrike(raw);
    if (spec) out.push({ effect, spec, raw });
  }
  return out;
}

/** Every creature on the scene the caster could send a ball at, with distances. */
async function candidatesFor(casterToken) {
  const { distanceBetween } = await import("../combat/geometry.mjs");
  const out = [];
  for (const token of canvas?.tokens?.placeables ?? []) {
    const actor = token?.actor;
    if (!actor || !actor.uuid) continue;
    // A DEAD TOKEN IS NOT A TARGET, but a Dying one is — it is still a
    // creature, and nothing in this entry says the ball checks a pulse.
    if (token.document?.hidden) continue;
    let distance = null;
    try {
      distance = casterToken ? distanceBetween(casterToken, token) : null;
    } catch {
      distance = null;
    }
    out.push({ uuid: actor.uuid, name: token.name || actor.name, distance, token, actor });
  }
  return out;
}

/**
 * Ask where this ball goes.
 *
 * Returns "" for "leave it where it is", which is also what a cancelled
 * or closed dialog returns — see the header.
 */
async function askDirection(label, current, options) {
  if (!options.length) return "";
  const DialogV2 = foundry.applications?.api?.DialogV2;
  if (!DialogV2?.wait) return "";
  const rows = options.map((o) =>
    `<option value="${o.uuid}">${o.name}${Number.isFinite(Number(o.distance)) ? ` — ${o.distance} ft` : ""}</option>`
  ).join("");
  const keep = current
    ? `<option value="" selected>Strike ${current} again (no free action)</option>`
    : `<option value="" selected>Do not direct it</option>`;
  const chosen = await DialogV2.wait({
    window: { title: `${label} — direct the ball?`, icon: "fa-solid fa-bolt" },
    classes: ["trg-prime"],
    content: `<p>Directing the ball at a new target costs a <strong>free action</strong>.`
      + ` Only creatures within the spell's range <em>of you</em> are listed.</p>`
      + `<select name="pick" style="width:100%">${keep}${rows}</select>`,
    buttons: [
      {
        action: "ok", label: "Confirm", icon: "fa-solid fa-check", default: true,
        callback: (event, button) => {
          const form = button.form ?? button.closest?.("form");
          const FDE = foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended;
          return String(new FDE(form).object.pick ?? "");
        }
      },
      { action: "cancel", label: "Leave it", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  }).catch(() => null);
  // EVERY WAY OF NOT ANSWERING MEANS THE SAME THING. See the header:
  // the ruling is that a turn with no free action still strikes.
  if (!chosen || chosen === "cancel") return "";
  return String(chosen);
}

/**
 * Fire every ball this caster has, at the start of their turn.
 *
 * SWALLOWS ITS OWN FAILURE, for the reason the nexus and ladder sweeps
 * do: this runs inside the turn-advance path, and a throw here would
 * leave the encounter mid-turn to report a bad flag.
 *
 * @param {Actor|null} caster
 * @param {Token|null} casterToken
 * @returns {Promise<string[]>} lines for the turn card
 */
export async function fireDirectedStrikes(caster, casterToken) {
  const lines = [];
  try {
    const balls = runningBalls(caster);
    if (!balls.length) return lines;

    const { TRGCheck } = await import("../dice/check.mjs");
    const { basicSavingThrow } = await import("../dice/resolution.mjs");
    const { criticalBonusDamage } = await import("./spell-damage.mjs");
    const { resolveAgainstDefences } = await import("../combat/damage-workflow.mjs");
    const { applyDamageAndCheckDying } = await import("../combat/dying-workflow.mjs");
    const { ownedCreatureTypeSystem } = await import("../creature-type-rules.mjs");
    const { rollCriticalInjury } = await import("../combat/attack-workflow.mjs");

    const candidates = await candidatesFor(casterToken);
    const byUuid = new Map(candidates.map((c) => [c.uuid, c]));
    // WHAT THE OTHER BALLS HAVE ALREADY TAKEN THIS TURN — the warp's
    // "must have a different target", enforced across the whole turn
    // rather than per dialog.
    const claimed = [];

    for (const { effect, spec, raw } of balls) {
      const current = String(raw?.targetUuid ?? "");
      const currentName = byUuid.get(current)?.name ?? "";
      const options = directableTargets(
        candidates, spec.rangeFeet, [...claimed, current].filter(Boolean), caster?.uuid ?? "");

      const chosen = await askDirection(spec.label, currentName, options);
      const aim = strikeTargetFor({ current, chosen });
      if (!aim) {
        lines.push(directedStrikeLine(spec.label, ""));
        continue;
      }
      claimed.push(aim.uuid);

      // THE CONSTRAINT IS ASKED, NOT ASSUMED. The picker already excludes
      // taken uuids; this asks the finished assignment, because the
      // picker is the thing most likely to be changed later.
      if (!targetsAreDistinct(claimed)) {
        lines.push(`<em>${spec.label}: two balls were aimed at one creature — the second is left where it was.</em>`);
        claimed.pop();
        continue;
      }

      const hit = byUuid.get(aim.uuid);
      const target = hit?.actor ?? await fromUuid(aim.uuid).then((d) => d?.actor ?? d).catch(() => null);
      if (!target) {
        lines.push(directedStrikeLine(spec.label, ""));
        continue;
      }
      if (aim.redirected) await effect.setFlag(SYSTEM_ID, DIRECTED_STRIKE_FLAG,
        { ...raw, targetUuid: aim.uuid });

      // THE READING SAID OUT LOUD. Ruling 3 limits where the ball may be
      // SENT; the page says nothing about a target who runs. See the
      // rule module's header — this is the one thing inferred.
      const stillNear = withinDirectRange(hit?.distance ?? null, spec.rangeFeet);
      lines.push(directedStrikeLine(spec.label, target.name,
        { redirected: aim.redirected, outOfRange: !aim.redirected && !stillNear }));

      const saveDC = Number(raw?.saveDC) || 0;
      const check = await TRGCheck.roll({
        actor: target,
        label: `${target.name} — Reflex Save`,
        subtitle: `${spec.label} — basic ${spec.save}`,
        type: "save",
        save: spec.save,
        dc: saveDC
      });
      const degreeKey = check?.outcome?.degree?.key ?? "failure";
      const margin = Number.isFinite(Number(check?.outcome?.margin))
        ? Number(check.outcome.margin) : null;

      const bs = basicSavingThrow(degreeKey, margin);
      const roll = await new Roll(spec.formula).evaluate();
      let amount = Math.floor(roll.total * bs.damageMultiplier);
      // THE BONUS DICE COME FROM THE BASE DAMAGE ENTRY (3.585.1), which
      // is why the ball carries `baseDamage` rather than re-rolling its
      // own die size — Ball Lightning prints Base Damage 1d8 and damage
      // 6d8, and the critical dice are 1d8s.
      const saveCrit = criticalBonusDamage(
        { baseDamage: String(raw?.baseDamage ?? "") }, bs.criticalSeverity, bs.bonusBaseDamage);
      if (saveCrit) {
        const bonusRoll = await new Roll(saveCrit).evaluate();
        amount += bonusRoll.total;
      }

      const packet = resolveAgainstDefences(target.system ?? {}, {
        amount,
        type: spec.damageType,
        creatureTypeSystem: ownedCreatureTypeSystem(target),
        // A SPELL IS A MAGICAL SOURCE (3.548.0). `targeted` is false —
        // this makes no attack roll — and `area` is false, because a
        // ball that hits one creature is not an area however it got
        // there. `verify-defence-vocabulary` W1 names any path that
        // forgets the first of these; it caught the recurring ladder
        // last release.
        magical: true,
        area: false,
        targeted: false
      });
      let newHP = null;
      if (packet.taken > 0) {
        const applied = await applyDamageAndCheckDying(target, packet.taken, {
          isCritical: Boolean(bs.criticalSeverity)
        });
        newHP = applied?.newHP;
      }
      lines.push(packet.immune
        ? `${target.name}: <strong>${degreeKey}</strong> save — <strong>immune</strong> to ${spec.damageType}.`
        : `${target.name}: <strong>${degreeKey}</strong> save — <strong>${packet.taken}</strong> `
          + `${spec.damageType}${newHP != null ? ` — now ${newHP} HP` : ""}`
          + `${bs.criticalSeverity ? ` <strong>(critical ${bs.criticalSeverity})</strong>` : ""}.`);

      if (bs.criticalSeverity && !packet.immune && packet.taken > 0) {
        await rollCriticalInjury(caster, {
          targetActor: target,
          damageType: spec.damageType,
          severity: bs.criticalSeverity,
          attackBonus: saveDC
        });
      }
    }
  } catch (error) {
    console.error("TRG Prime | a directed strike could not be fired this turn", error);
  }
  return lines;
}

/**
 * Record a ball on its caster, as an ActiveEffect carrying its spec.
 *
 * One effect PER BALL, so the warp's second ball is a second effect: the
 * GM can see two, dispel one, and the turn clock fires them in the order
 * they were made. A single effect holding an array would have made
 * "delete one ball" a thing only code could do.
 *
 * @returns {object|null} the normalised spec, or null if the row was bad
 */
export async function recordDirectedStrike(caster, descriptor, effectData = {}) {
  const spec = normaliseDirectedStrike(descriptor);
  if (!spec || !caster?.createEmbeddedDocuments) return null;
  const { createEffectsOn } = await import("../combat/target-relay-workflow.mjs");
  const made = [];
  for (let i = 0; i < spec.count; i += 1) {
    made.push({
      ...effectData,
      name: spec.count > 1 ? `${spec.label} (${i + 1} of ${spec.count})` : spec.label,
      changes: [],
      flags: {
        ...(effectData.flags ?? {}),
        [SYSTEM_ID]: {
          ...(effectData.flags?.[SYSTEM_ID] ?? {}),
          // EACH BALL REMEMBERS ITS OWN TARGET. The second starts on
          // nobody: the warp says it "must have a different target", and
          // the page gives the cast one target — so the second ball is
          // aimed on the caster's first turn, which is the first moment
          // the rule can be honoured.
          [DIRECTED_STRIKE_FLAG]: { ...descriptor, targetUuid: i === 0 ? String(descriptor.targetUuid ?? "") : "" }
        }
      }
    });
  }
  await createEffectsOn(caster, made);
  return spec;
}
