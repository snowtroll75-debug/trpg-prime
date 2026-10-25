/**
 * Double Slice — the Foundry side of double-slice.mjs.
 *
 * The two swings go through the ordinary attack workflow, because
 * everything that makes an attack an attack — runes, conditionals,
 * cover, hit location, criticals, the fumble check — already lives
 * there and a second copy of it would drift. What this adds is the four
 * rules that act on the PAIR, and one card that states the pair's
 * actual result.
 *
 * WHY THERE IS A THIRD CARD. Each swing posts its own, as any Strike
 * does; those are the rolls. The pair's own card says what the pair's
 * rules made of them.
 *
 * THE RULES ACT BEFORE THE DAMAGE (3.668.2). This file was written when
 * damage was a button pressed afterwards, so the pair's card could overturn
 * a swing. Damage is now applied as a Strike hits, and the card came too
 * late: both criticals were inflicted, and a fumble could not unmake the
 * other swing's damage (found in the 0.5.1 live test). The second swing is
 * now rolled while the first waits, before anything lands — see
 * runDoubleSlice.
 */
import { attackCountOf, setAttackCount } from "./turn-records.mjs";
import {
  DOUBLE_SLICE_ATTACKS,
  doubleSlicePairValid,
  doubleSliceRequirement,
  resolveDoubleSlice,
  secondStrikeModifier
} from "./double-slice.mjs";
import { backswingCounts, twinBonus } from "./weapon-chapter6-traits.mjs";

const SYSTEM_ID = "trg-prime";

function esc(text) {
  return String(text ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

/** Which two weapons, and in which order? Order matters: the second takes the penalty. */
async function promptWeaponPair(weapons, actorSize = "medium") {
  // ONE DOUBLE WEAPON AND NOTHING ELSE: nothing to choose (3.575.0).
  if (weapons.length === 1) return { first: weapons[0], second: weapons[0] };
  const { DialogV2 } = foundry.applications.api;
  const options = (selected) =>
    weapons
      .map((w) => `<option value="${w.id}"${w.id === selected ? " selected" : ""}>${esc(w.name)}</option>`)
      .join("");
  const result = await DialogV2.wait({
    window: { title: "Double Slice — both weapons", icon: "fa-solid fa-hand-fist" },
    classes: ["trg-prime"],
    position: { width: 400 },
    content: `<div class="trg-prime trg-check-dialog">
      <div class="form-group">
        <label for="trg-ds-first">First strike</label>
        <select id="trg-ds-first" name="first" style="width:100%">${options(weapons[0]?.id)}</select>
      </div>
      <div class="form-group">
        <label for="trg-ds-second">Second strike</label>
        <select id="trg-ds-second" name="second" style="width:100%">${options(weapons[1]?.id ?? weapons[0]?.id)}</select>
      </div>
      <p class="hint" style="font-size:.82em;margin:6px 0 0">The order matters: the second strike takes a &minus;2 circumstance penalty unless that weapon is agile. A double weapon held in both hands may be chosen for both strikes, and its second end is always agile. Both use your current multiple attack penalty, and the pair counts as two attacks afterwards.</p>
    </div>`,
    buttons: [
      {
        action: "slice",
        label: "Strike twice",
        icon: "fa-solid fa-hand-fist",
        default: true,
        callback: (event, button, dialog) => {
          const root = dialog?.element ?? button?.form;
          return {
            first: root?.querySelector?.('[name="first"]')?.value ?? null,
            second: root?.querySelector?.('[name="second"]')?.value ?? null
          };
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!result || result === "cancel") return null;
  const first = weapons.find((w) => w.id === result.first) ?? null;
  const second = weapons.find((w) => w.id === result.second) ?? null;
  if (!first || !second) return null;
  const valid = doubleSlicePairValid(first, second, actorSize);
  if (!valid.ok) {
    ui.notifications.warn(`Double Slice: ${valid.reason}.`);
    return null;
  }
  return { first, second };
}

/** What one resolved swing did, in the shape resolveDoubleSlice expects. */
function swingResult(check) {
  return {
    hits: Boolean(check?.attackOutcome?.hits),
    critical: Boolean(check?.attackOutcome?.critical),
    fumbled: Boolean(check?.attackFumbled)
  };
}

/**
 * Resolve the whole action.
 *
 * @param {Actor} actor
 * @param {object} action The Double Slice entry, for its name and traits.
 * @returns {Promise<object|null>}
 */
export async function runDoubleSlice(actor, action) {
  const { rollWeaponAttack } = await import("./attack-workflow.mjs");
  const actorSize = actor?.system?.identity?.size ?? "medium";
  const { allowed, reason, weapons } = doubleSliceRequirement(Array.from(actor?.items ?? []), actorSize);
  if (!allowed) {
    ui.notifications.warn(`${action?.name ?? "Double Slice"}: ${reason}.`);
    return null;
  }

  const pair = await promptWeaponPair(weapons, actorSize);
  if (!pair) return null;

  // THE MAP IS READ ONCE AND FROZEN. "Using your CURRENT multiple attack
  // penalty, make two Strikes" — both swings are made at the penalty
  // that stood when the action began, not at one that climbs between
  // them, and the counter moves by two at the end instead.
  const mapBefore = attackCountOf(actor);

  // THE PAIR'S RULES, DECIDED BEFORE ANYTHING LANDS (3.668.2; Graham, 23
  // October 2026). Damage in this system is applied as a Strike hits, so the
  // rules that act on the pair must be settled before the first swing's
  // damage, not on a card afterwards:
  //   - the second swing is rolled while the first waits (`beforeDamage`);
  //   - "You can only inflict one critical": the first stands, and a second
  //     critical counts as an ordinary hit (`noCritical`);
  //   - "If both attacks hit, combine their damage": the target's DR is met
  //     once, by the first swing's damage (`drWaived` on the second);
  //   - "if either attack fumbles, then the other attack automatically
  //     misses": a fumbled second swing voids the waiting first; a fumbled
  //     first swing means the second is not made.
  // A first swing that may itself fumble (an unmodified 1, or 2 when not
  // proficient) cannot wait: its fumble check comes after it, so it finishes
  // first and the second follows, or not.
  const sameDoubleWeapon = pair.first.id === pair.second.id;
  const penalty = secondStrikeModifier(pair.second, { sameDoubleWeapon });
  const rollSecond = (firstOutcome) => rollWeaponAttack(actor, pair.second, {
    apPaid: true,
    mapFrozen: true,
    // "Both Strikes must be made against the same target" — the target
    // chosen for the first swing is still the one selected, so the
    // second does not ask again.
    skipTargetPrompt: true,
    extraModifiers: penalty ? [penalty] : [],
    noCritical: Boolean(firstOutcome?.hits && firstOutcome?.critical),
    drWaived: Boolean(firstOutcome?.hits),
    optionLabel: "Double Slice"
  });
  let secondCheck = null;
  let secondRolled = false;
  const firstCheck = await rollWeaponAttack(actor, pair.first, {
    apPaid: true,
    mapFrozen: true,
    beforeDamage: async ({ outcome: firstOutcome }) => {
      if (firstOutcome?.fumbleRisk) return null;
      secondCheck = await rollSecond(firstOutcome);
      secondRolled = true;
      return { void: Boolean(secondCheck?.attackFumbled) };
    }
  });
  if (!firstCheck) return null;
  if (!secondRolled && !firstCheck.attackFumbled) secondCheck = await rollSecond(firstCheck.attackOutcome);

  const outcome = resolveDoubleSlice(
    swingResult(firstCheck),
    secondCheck ? swingResult(secondCheck) : { hits: false, critical: false, fumbled: false }
  );

  // WHAT EACH SWING DEALT, after the pair's rules: a swing the pair's
  // rules turned into a miss counts as one.
  const swings = [
    { weaponSystem: pair.first.system, hits: outcome.firstHits, damageTaken: Number(firstCheck?.damageTaken ?? 0) || 0 },
    { weaponSystem: pair.second.system, hits: outcome.secondHits, damageTaken: Number(secondCheck?.damageTaken ?? 0) || 0 }
  ];

  // "This counts as two attacks when calculating your multiple attack
  // penalty" — applied once, here, rather than by either swing. BACKSWING
  // (3.668.1; Inner Tempest): a swing with a Backswing weapon that
  // inflicted no damage is not counted.
  const counted = backswingCounts(swings, DOUBLE_SLICE_ATTACKS);
  await setAttackCount(actor, mapBefore + counted);

  // TWIN (3.668.1; Inner Tempest, Chapter 6): "If both weapons successfully
  // hit and inflict damage whilst using the Double Slice action, their base
  // damage increases by 1." Each swing's damage has been dealt by then, so
  // the increase is dealt after: 1 per weapon, of the type that swing dealt.
  // Its DR was met by the swing's own damage; its resistance and immunity
  // are still met.
  const twin = twinBonus({ first: swings[0], second: swings[1], sameWeapon: sameDoubleWeapon });
  const twinLines = [];
  // The creature both swings struck, as the swings recorded it.
  const twinUuid = String(secondCheck?.targetUuid || firstCheck?.targetUuid || "");
  const twinTarget = twin && twinUuid ? await fromUuid(twinUuid).catch(() => null) : null;
  if (twin && twinTarget) {
    const { applyTypedDamage } = await import("./damage-workflow.mjs");
    // ONE PACKET PER TYPE, so two blades of one type are one blow of 2.
    const byType = new Map();
    for (const [check, weapon] of [[firstCheck, pair.first], [secondCheck, pair.second]]) {
      const type = String(check?.damageType || weapon.system?.damageType || "").trim().toLowerCase();
      byType.set(type, { amount: (byType.get(type)?.amount ?? 0) + twin, names: [...(byType.get(type)?.names ?? []), weapon.name] });
    }
    for (const [type, { amount, names }] of byType) {
      // NOT ON A CREATURE ALREADY DOWN (found in review): the +1 belongs to
      // the swing's own blow, and the blow that dropped it has landed. A
      // packet of its own would be a further blow, and worsen Dying.
      if (!(Number(twinTarget.system?.resources?.hp?.value ?? 0) > 0)) {
        twinLines.push(`<strong>Twin</strong> (${names.map(esc).join(", ")}): ${esc(twinTarget.name)} is already down — the +${twin} belongs to the blow that dropped it, and adds nothing more.`);
        continue;
      }
      const { applied } = await applyTypedDamage(twinTarget, { amount, type, dr: 0, drBypassed: true });
      twinLines.push(`<strong>Twin</strong> (${names.map(esc).join(", ")}): +${twin} base damage each — ${applied} ${esc(type)} more to ${esc(twinTarget.name)}.`);
    }
  }

  const verdict = (hits, weapon) =>
    `<strong>${esc(weapon.name)}</strong>: ${hits ? "hits" : "misses"}`;
  const dealt = (check) => (outcome.firstHits || outcome.secondHits) && check
    ? ` — ${Number(check.damageTaken ?? 0) || 0} damage taken${check.damageType ? ` (${esc(check.damageType)})` : ""}`
    : "";
  const lines = [
    `${verdict(outcome.firstHits, pair.first)} — first strike${outcome.firstHits ? dealt(firstCheck) : ""}${firstCheck.voidedByPair ? " (its hit voided by the second swing's fumble)" : ""}.`,
    secondCheck
      ? `${verdict(outcome.secondHits, pair.second)} — second strike${penalty ? " (−2, not agile)" : sameDoubleWeapon ? " (the double weapon's second end — agile, no penalty)" : " (agile — no penalty)"}${outcome.secondHits ? dealt(secondCheck) : ""}.`
      : `<em>The second strike was not made${firstCheck.attackFumbled ? " — the first fumbled, so it automatically misses" : ""}.</em>`,
    // The fumble rule, as the pure rules state it. Their notes on a second
    // critical and on combining are answered by the lines below instead.
    ...outcome.notes.filter((note) => /fumbled/.test(note)).map((note) => `<em>${note}</em>`),
    ...(secondCheck?.criticalDowngraded ? ["<em>Only one critical: the second swing's critical counted as an ordinary hit — no bonus dice and no injury.</em>"] : []),
    ...(outcome.firstHits && outcome.secondHits ? [`<em>Both hit: their damage is combined, the target's DR met once (by the first swing). Each swing dealt its own damage type.</em>`] : []),
    ...twinLines,
    counted === DOUBLE_SLICE_ATTACKS
      ? `<em>Multiple attack penalty advances by ${DOUBLE_SLICE_ATTACKS} — now at ${mapBefore + counted} attacks this turn.</em>`
      : `<em>Backswing: a swing that inflicted no damage is not counted. Multiple attack penalty advances by ${counted} — now at ${mapBefore + counted} attacks this turn.</em>`,
    outcome.firstHits || outcome.secondHits
      ? "<em>The damage above has been applied.</em>"
      : "<em>Neither swing deals damage.</em>"
  ];

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content:
      `<div class="trg-prime trg-check-card"><header class="check-header">` +
      `<div class="check-heading"><span class="check-actor">${esc(actor.name)}</span>` +
      `<h3>Double Slice — Result</h3></div></header>` +
      lines.map((l) => `<p style="margin:2px 0">${l}</p>`).join("") +
      `</div>`
  });

  return outcome;
}
