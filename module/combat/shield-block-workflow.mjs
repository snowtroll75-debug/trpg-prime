/**
 * Shield Block, at the table.
 *
 * `shield-block.mjs` decides what a block is worth; this asks for the
 * blow, spends the Reaction, hurts the shield and posts the card.
 *
 * WHY IT ASKS FOR THE DAMAGE. The trigger is "you take damage from an
 * attack", and this system's damage pipeline reports what got through
 * and leaves application to the GM — deliberately, since 3.233. So the
 * number the shield is blocking is a number a person is holding, and
 * asking for it is the same stance Falling From Height takes with the
 * distance fallen.
 *
 * THE SHIELD'S HIT POINTS ARE APPLIED, because unlike a creature's the
 * shield's HP is not a person's decision — the item either survives the
 * blow or it does not, and `itemStatus` already knows which. The
 * character's own share is REPORTED, like every other damage figure in
 * this system.
 */

import { applyItemDamage, itemStatus } from "../items.mjs";
import { shieldBlockEligibility, shieldBlockOutcome } from "./shield-block.mjs";
import {
  spellShieldSources, spellShieldsWithout, casterBSB, withRecastLockout,
  SPELL_SHIELD_FLAG, SPELL_RECAST_LOCKOUT_FLAG
} from "../magic/spell-shield.mjs";

const SYSTEM_ID = "trg-prime";
import { loseShieldBonusUntilNextTurn } from "./shield-bash.mjs";
import { spendReaction } from "./action-points-workflow.mjs";
import { shellbackOn } from "../codex-runes.mjs";

const { DialogV2 } = foundry.applications.api;

function line(text) {
  return `<p style="margin:2px 0">${text}</p>`;
}

function esc(text) {
  return String(text ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

async function postCard(actor, title, lines) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="trg-prime trg-check-card"><header class="check-header">`
      + `<div class="check-heading"><span class="check-actor">${esc(actor?.name ?? "")}</span>`
      + `<h3>${esc(title)}</h3></div></header>${lines.join("")}</div>`
  });
}

/** The incoming damage, asked for once. */
async function promptIncomingDamage(shieldName, blockDR) {
  const result = await DialogV2.wait({
    window: { title: "Shield Block", icon: "fa-solid fa-shield-halved" },
    classes: ["trg-prime"],
    position: { width: 400 },
    content: `
      <div class="trg-prime trg-check-dialog">
        <p class="hint">${esc(shieldName)} stops <strong>${blockDR}</strong> of the incoming damage. You and the shield take whatever is left.</p>
        <div class="form-group">
          <label for="trg-block-damage">Damage taken from the attack</label>
          <input id="trg-block-damage" type="number" name="damage" value="0" min="0">
        </div>
      </div>`,
    buttons: [
      {
        action: "block",
        label: "Block",
        icon: "fa-solid fa-shield-halved",
        default: true,
        callback: (event, button) => {
          const form = button.form ?? button.closest?.("form");
          const FDE = foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended;
          return new FDE(form).object;
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!result || result === "cancel") return null;
  return Math.max(0, Math.trunc(Number(result.damage) || 0));
}

/**
 * What a spell shield costs when it blocks: its spell ends, and it may
 * not be cast again for its lockout. Returns the card lines.
 *
 * @param {Actor} actor
 * @param {{label: string, castId: string|null, endsOnBlock: boolean, lockoutMinutes: number}} spell
 * @returns {Promise<string[]>}
 */
async function endSpellShieldOnBlock(actor, spell) {
  const lines = [];
  if (!spell?.endsOnBlock) return lines;
  const rows = actor.getFlag(SYSTEM_ID, SPELL_SHIELD_FLAG) ?? [];
  const spellName = (Array.isArray(rows) ? rows : []).find((r) => r?.castId === spell.castId)?.spell ?? spell.label;
  if (spell.castId) {
    const { endActiveSpell } = await import("../magic/active-spells.mjs");
    await endActiveSpell(actor, spell.castId, { dismissed: false });
  }
  // The row goes whether or not the registry still held the spell, so a
  // shield can never block twice on one casting.
  await actor.setFlag(SYSTEM_ID, SPELL_SHIELD_FLAG, spellShieldsWithout(rows, spell.castId));
  lines.push(line(`<em>${esc(spellName)} ends — a spell shield is spent by the block.</em>`));
  if (spell.lockoutMinutes > 0) {
    const lockouts = actor.getFlag(SYSTEM_ID, SPELL_RECAST_LOCKOUT_FLAG) ?? {};
    await actor.setFlag(SYSTEM_ID, SPELL_RECAST_LOCKOUT_FLAG,
      withRecastLockout(lockouts, spellName, Number(game.time?.worldTime ?? 0), spell.lockoutMinutes));
    lines.push(line(`<em>${esc(spellName)} can't be cast again for ${spell.lockoutMinutes} minutes.</em>`));
  }
  return lines;
}

/**
 * Take the Reaction.
 *
 * @param {Actor} actor
 * @param {object} action the Shield Block entry from BASIC_ACTIONS
 */
export async function resolveShieldBlock(actor, action) {
  const items = Array.from(actor?.items ?? []);
  /* A SHIELD THE SPELL MADE COUNTS ALONGSIDE A CARRIED ONE (3.542.0).
   * Gathered here rather than inside the rule so the rule stays pure and
   * the harness can drive it without a world. */
  const spellShields = spellShieldSources(
    actor?.getFlag?.(SYSTEM_ID, SPELL_SHIELD_FLAG) ?? [], casterBSB(actor));
  const bdb = Number(actor?.system?.combat?.bdb?.total ?? 0);
  const eligibility = shieldBlockEligibility(items, spellShields, { bdb });

  // "if your shield does not have a DR bonus, it cannot be used to
  // Shield Block" — refused rather than resolved to nothing, because a
  // block that stops zero and still costs the shield bonus is a worse
  // outcome than not having blocked, and the rule says it is not
  // available at all.
  if (!eligibility.able) {
    ui.notifications.warn(`Shield Block: ${eligibility.why}.`);
    return null;
  }

  // THE SHIELD THAT BLOCKS MAY BE A SPELL (3.575.0). Eligibility has
  // answered `{shield: null, spellShield}` whenever the Shield spell is
  // the better blocker since 3.542.0, and every line below read
  // `eligibility.shield.name` — so the reaction threw before it asked for
  // the blow, and no caster could ever block with the spell. The 3.542.0
  // live test checked eligibility and never took the reaction. Found in
  // the pages 151-160 audit.
  //
  // `eligibility.dr` IS what the block is worth either way: a carried
  // shield's DR BDB-scaled, a spell's its own "1 + BSB".
  const carried = eligibility.shield ?? null;
  const spell = carried ? null : (eligibility.spellShield ?? null);
  const blockerName = carried?.name ?? spell?.label ?? "Shield";
  const blockDR = Number(eligibility.dr) || 0;
  const damage = await promptIncomingDamage(blockerName, blockDR);
  if (damage === null) return null;

  await spendReaction(actor, action?.name ?? "Shield Block", { traits: action?.traits ?? "" });

  // OFFENSIVE PARRY (Chapter 5) is a FREE action riding on this
  // reaction — "Trigger You use the Shield Block reaction". Offered
  // here, once the block is paid for, and fire-and-forget so a card
  // that fails to build can never cost somebody their block.
  import("./reaction-feat-detection.mjs")
    .then((m) => m.detectShieldReactions(actor, null, { blocked: true }))
    .catch(() => {});

  const shellback = carried ? shellbackOn(carried) : null;
  const outcome = shieldBlockOutcome({
    damage,
    blockDR,
    halveShieldDamage: Boolean(shellback?.halvesShieldDamage)
  });

  // "You and your shield take any further damage" — one sentence when
  // that is true of both, and TWO WHEN IT IS NOT. Shellback halves the
  // shield's share, and a card that says "and so does the shield" and
  // then corrects itself a line later is a card that has to be read
  // twice to find out which number is real. Live testing, 3.284.0.
  const lines = [
    line(`<strong>${esc(blockerName)}</strong> stops <strong>${outcome.prevented}</strong> of ${outcome.damage}.`),
    outcome.halved || !carried
      ? line(`<strong>${esc(actor.name)}</strong> takes <strong>${outcome.toCharacter}</strong>.`)
      : line(`<strong>${esc(actor.name)}</strong> takes <strong>${outcome.toCharacter}</strong>, and so does the shield.`)
  ];

  if (shellback && outcome.halved) {
    lines.push(line(
      `<em>Shellback halves the shield's share: it takes <strong>${outcome.toShield}</strong> rather than ${outcome.toCharacter}.</em>`));
  } else if (shellback) {
    // Shellback is inscribed and there was nothing to halve — a blow the
    // shield stopped entirely, or one that halves to the same number.
    // Said rather than silently omitted, so the rune is not mistaken for
    // one that failed to fire.
    lines.push(line(
      `<em>Shellback: nothing got through for it to halve.</em>`));
  }

  // The shield's own hit points, applied. The item's DR is NOT taken off
  // again here — it was already spent granting the block, and taking it
  // twice would mean a shield that stops 9 loses nothing to a blow of
  // 17. See shield-block.mjs.
  if (carried && outcome.toShield > 0) {
    const hp = carried.system?.hp ?? {};
    const after = applyItemDamage(Number(hp.value ?? 0), outcome.toShield, 0);
    await carried.update({ "system.hp.value": after });
    const status = itemStatus(after, Number(hp.max ?? 0));
    if (status === "broken" || status === "destroyed") {
      lines.push(line(`<strong>${esc(carried.name)} is ${status}.</strong>`));
    }
  }

  // THE SPELL ENDS ON THE BLOCK (Shield: "after a Shield Block the spell
  // ends and can't be recast for 10 minutes"). Declared on the row as
  // `endsOnBlock` and `lockoutMinutes` since 3.542.0 and carried out by
  // nothing. A spell-made shield has no hit points to lose; this is its
  // cost instead.
  if (spell) {
    lines.push(...await endSpellShieldOnBlock(actor, spell));
  }

  // "after using Shield Block, you lose your shield bonus to DB until
  // the beginning of your next turn" — word for word Shield Bash's own
  // clause, so it is Shield Bash's own mechanism rather than a second
  // flag meaning the same thing.
  await loseShieldBonusUntilNextTurn(actor);
  lines.push(line("<em>Your shield bonus to DB is lost until the beginning of your next turn.</em>"));

  if (shellback) {
    lines.push(line(
      `<strong>Free ${esc(shellback.asAction)} (0 AP):</strong> move ${shellback.freeStepFeet} feet away from the attacker, without triggering reactions.`));
  }

  return postCard(actor, "Shield Block", lines);
}
