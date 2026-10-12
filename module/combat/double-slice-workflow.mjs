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
 * does; those are the rolls. The rules that follow can overturn what a
 * roll appeared to do — a second critical becomes an ordinary hit, and a
 * fumble anywhere makes everything miss — so the pair's own card is the
 * authoritative one, and it says which of the two rolls (if either) to
 * take damage from. Nothing has been applied by then: damage in this
 * system is a button pressed afterwards.
 */
import {
  DOUBLE_SLICE_ATTACKS,
  doubleSlicePairValid,
  doubleSliceRequirement,
  resolveDoubleSlice,
  secondStrikeModifier
} from "./double-slice.mjs";

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
  const mapBefore = Number(actor.getFlag(SYSTEM_ID, "attackCount") ?? 0);

  const firstCheck = await rollWeaponAttack(actor, pair.first, {
    apPaid: true,
    mapFrozen: true
  });
  if (!firstCheck) return null;

  const sameDoubleWeapon = pair.first.id === pair.second.id;
  const penalty = secondStrikeModifier(pair.second, { sameDoubleWeapon });
  const secondCheck = await rollWeaponAttack(actor, pair.second, {
    apPaid: true,
    mapFrozen: true,
    // "Both Strikes must be made against the same target" — the target
    // chosen for the first swing is still the one selected, so the
    // second does not ask again.
    skipTargetPrompt: true,
    extraModifiers: penalty ? [penalty] : []
  });

  const outcome = resolveDoubleSlice(
    swingResult(firstCheck),
    secondCheck ? swingResult(secondCheck) : { hits: false, critical: false, fumbled: false }
  );

  // "This counts as two attacks when calculating your multiple attack
  // penalty" — applied once, here, rather than by either swing.
  await actor.setFlag(SYSTEM_ID, "attackCount", mapBefore + DOUBLE_SLICE_ATTACKS);

  const verdict = (hits, weapon) =>
    `<strong>${esc(weapon.name)}</strong>: ${hits ? "hits" : "misses"}`;
  const lines = [
    `${verdict(outcome.firstHits, pair.first)} — first strike.`,
    secondCheck
      ? `${verdict(outcome.secondHits, pair.second)} — second strike${penalty ? " (−2, not agile)" : sameDoubleWeapon ? " (the double weapon's second end — agile, no penalty)" : " (agile — no penalty)"}.`
      : `<em>The second strike was not made.</em>`,
    ...outcome.notes.map((note) => `<em>${note}</em>`),
    `<em>Multiple attack penalty advances by ${DOUBLE_SLICE_ATTACKS} — now at ${mapBefore + DOUBLE_SLICE_ATTACKS} attacks this turn.</em>`
  ];
  if (!outcome.firstHits && !outcome.secondHits) {
    lines.push("<em>Roll no damage from either card.</em>");
  } else if (outcome.combineDamage) {
    lines.push(
      "<em>Roll damage from both cards and combine the totals, taking whichever damage type serves you better against this target.</em>"
    );
  } else {
    lines.push(
      `<em>Roll damage from the ${outcome.firstHits ? "first" : "second"} strike's card only.</em>`
    );
  }

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
