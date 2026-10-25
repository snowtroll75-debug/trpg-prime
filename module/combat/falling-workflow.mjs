import { TRGCheck } from "../dice/check.mjs";
import {
  DANGEROUS_HEIGHT_FEET, FALLING_MINIMUM_AP, LANDED_ON_DC,
  fallingDamage, fallingSaveDC, fallingInjuryOutcome, fallProvokesInjurySave,
  fallByRound, landedOnOutcome, roundsToFall, severityPassedOn
} from "./falling.mjs";
import { actorInCombat, spendActionPoints } from "./action-points-workflow.mjs";
import { spendTemporaryHP } from "./temporary-hp.mjs";
import { rollCriticalInjury } from "./attack-workflow.mjs";
import { skyfeatherCatches } from "../codex-runes.mjs";
import { declaredFallReduction } from "../focus-declarations.mjs";
import { declarationCarriers } from "../declaration-carriers.mjs";

const { DialogV2 } = foundry.applications.api;

function line(text) {
  return `<p style="margin:2px 0">${text}</p>`;
}

async function postCard(actor, title, lines) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading"><span class="check-actor">${actor.name}</span><h3>${title}</h3></div></header>${lines.join("")}</div>`
  });
}

/**
 * "If you land on a creature after falling, that creature must make a
 * DC 20 Reflex Saving Throw."
 *
 * POSTED, NOT ROLLED. The save is the landed-on creature's, the same way
 * Aligned Control's is the target's — so this states the DC and all four
 * printed outcomes with the actual numbers already worked out from what
 * the faller took, and the creature's own player rolls it.
 *
 * ONLY WHEN SOMEBODY IS TARGETED. A fall onto empty floor is the normal
 * case and should not print a block about a creature that is not there.
 */
function landedOnLines(target, damage, fallerSeverity, fallerOutcome = {}) {
  const rows = [
    ["Critical", "critical"],
    ["Success", "success"],
    ["Failure", "failure"],
    ["Fumble", "fumble"]
  ];
  const lines = [
    line(`<strong>${target.name}</strong> is landed on — a <strong>DC ${LANDED_ON_DC} Reflex</strong> saving throw.`)
  ];
  for (const [label, key] of rows) {
    const outcome = landedOnOutcome(key, { fallingDamage: damage, fallerSeverity });
    const critical = outcome.severity
      ? ` and a <strong>${outcome.severity}</strong> bludgeoning critical`
      : "";
    lines.push(line(`<strong>${label}</strong> ${
      outcome.damage > 0
        ? `${outcome.damage} bludgeoning damage (${outcome.share} of the ${damage} taken)`
        : "no damage"
    }${critical}.`));
  }
  // "(none if the initial was minor)" — the parenthesis is easy to miss
  // and easy to argue about, so the card says which way it fell. And a
  // fatal fall says so in its own words, because "deadly" appearing on
  // the card when the faller took no critical at all reads like a bug
  // until you know the ruling.
  if (fallerOutcome.instantDeath) {
    lines.push(line(
      "<em>The fall killed the faller outright, which passes on a deadly critical (Graham, 12 Aug 2026).</em>"));
  } else if (!fallerSeverity) {
    lines.push(line("<em>The faller took no critical, so neither does anyone landed on.</em>"));
  }
  return lines;
}

/**
 * Falling From Height (Chapter 8): prompts for the distance fallen
 * (already adjusted for a soft landing or Grab an Edge, if applicable —
 * those are handled before this is invoked, not by this workflow),
 * applies the bludgeoning damage directly (DR never applies to a fall),
 * rolls the level-based Fortitude save, and applies the resulting
 * critical injury severity or instant death as a Prone condition plus a
 * clearly-labelled result for the GM to resolve the critical itself.
 *
 * A FALL OF NO DAMAGE ENDS BEFORE THE SAVE. Whether that is a five-foot
 * drop, an Arrest a Fall, a Catfall, or Skyfeather's Feather Fall, a
 * fall that costs nothing cannot injure — see `fallProvokesInjurySave`.
 */
export async function rollFalling(actor, { distance: prefilled = 0, onto = undefined, note = "" } = {}) {
  // PREFILLED WHEN SOMETHING ELSE ALREADY KNOWS THE HEIGHT. Fly's
  // turn-end drop knows exactly how far up the token was, and making the
  // GM read that off the token and type it back is how a 40 becomes a 4.
  // Still a field rather than a silent roll, because every reduction the
  // hint lists is one only the table can decide has applied.
  const startingDistance = Math.max(0, Math.floor(Number(prefilled) || 0));
  const result = await DialogV2.wait({
    window: { title: "Falling From Height", icon: "fa-solid fa-person-falling" },
    classes: ["trg-prime"],
    position: { width: 400 },
    content: `
      <div class="trg-prime trg-check-dialog">
        <p class="hint">Enter the final distance fallen — already reduced for a soft landing (20 ft, or 30 ft if you intentionally dove in, capped at the depth) or a successful Grab an Edge, if either applied. Racial and ability reductions (a Ren's 20 feet) are taken off automatically.</p>
        <div class="form-group">
          <label for="trg-fall-distance">Distance fallen (feet)</label>
          <input id="trg-fall-distance" type="number" name="distance" value="${startingDistance}" min="0">
        </div>
      </div>`,
    buttons: [
      {
        action: "roll",
        label: "Roll",
        icon: "fa-solid fa-dice-d20",
        default: true,
        callback: (event, button) => {
          const form = button.form ?? button.closest?.("form");
          const FDE =
            foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended;
          return new FDE(form).object;
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });

  if (!result || result === "cancel") return null;

  // DECLARED REDUCTIONS (3.664.0): a Ren's "treat the distance fallen as
  // 20 feet shorter" and its kin, taken off what the table entered.
  const fallCut = declaredFallReduction(declarationCarriers(actor));
  const entered = Number(result.distance || 0);
  const distance = Math.max(0, entered - fallCut.feet);

  // SKYFEATHER (Creature Codex, Chapter 3): "Trigger you are falling...
  // This acts as a Feather Fall spell." The spell, in this system's own
  // compendium: "the target takes no damage upon landing".
  //
  // So the rune is read BEFORE the damage is computed rather than
  // subtracted afterwards — nil damage means nothing is lost, nothing is
  // absorbed by temporary HP, and the faller does not land Prone, which
  // is three consequences that all follow from the one number.
  //
  // The injury save does not run either — and not because this rune
  // says so. Nil damage provokes no save for any reason at all, which is
  // the general rule further down. The rune brings the damage to
  // nothing and everything else follows from that one number.
  const caught = skyfeatherCatches(Array.from(actor.items ?? []));
  const damage = caught ? 0 : fallingDamage(distance);
  // "A dangerous height (MORE THAN 5 FEET)" — said out loud, because a
  // card reading "Fell 4 feet, taking 0 bludgeoning damage" invites the
  // reader to wonder what went wrong with the arithmetic.
  const shortDrop = !caught && distance > 0 && distance <= DANGEROUS_HEIGHT_FEET;

  // THE DESCENT ITSELF. "You fall approximately 500 feet in the first
  // round of any fall … each subsequent round … about 1,500 feet." Only
  // said when it took more than one round, because for every fall off a
  // wall it is noise.
  const rounds = roundsToFall(distance);
  // Whoever the faller was aimed at, if anyone. Read once, before
  // anything is rolled, so a target released mid-resolution does not
  // change the answer halfway through.
  //
  // UNLESS THE CALLER KNOWS BETTER (3.606.0). A spell that drops its
  // victims into a pit is cast WITH those victims targeted, so "whoever
  // this user has targeted" is the faller itself — Snagging Pit would have
  // had every creature land on itself. `onto: null` says nobody is below;
  // leaving it undefined keeps the sheet button and Fly exactly as they
  // were. And a creature is never landed on by its own fall, whatever the
  // targets say.
  const targeted = onto === undefined
    ? Array.from(game.user?.targets ?? [])[0]?.actor ?? null
    : onto;
  const landedOn = targeted && targeted !== actor && targeted.uuid !== actor?.uuid ? targeted : null;

  const lines = caught
    ? [
      line(`Fell <strong>${distance} feet</strong> — <strong>${caught.item.name}</strong> catches it.`),
      line(`<em>Skyfeather acts as a ${caught.spell} spell: the descent slows to 60 feet per round and <strong>no damage</strong> is taken on landing.</em>`)
    ]
    : shortDrop
      ? [line(`Fell <strong>${distance} feet</strong> — not a dangerous height, which the chapter puts at more than ${DANGEROUS_HEIGHT_FEET} feet. <strong>No damage.</strong>`)]
      : [line(`Fell <strong>${distance} feet</strong>, taking <strong>${damage} bludgeoning damage</strong> (DR does not apply).`)];

  // WHAT SENT THEM OVER, when something did (3.606.0) — Snagging Pit's
  // Fumble, "no time to use reactions", belongs on the card the fall
  // itself posts, beside the number it would otherwise have changed.
  if (String(note ?? "").trim()) lines.push(line(`<em>${String(note).trim()}</em>`));
  if (fallCut.feet > 0 && entered > 0) {
    lines.push(line(`<em>${entered} feet entered, treated as ${distance}: ${fallCut.labels.join(", ")}.</em>`));
  }

  if (rounds > 1) {
    lines.push(line(`The descent takes <strong>${rounds} rounds</strong> — ${
      fallByRound(distance).map((row) => `${row.feet} ft`).join(", then ")}.`));
  }

  // "Unless you make some kind of skill check, falling pretty much any
  // distance will always use a minimum of 1 AP during an encounter." A
  // MINIMUM, so it is spent rather than offered — and `spendActionPoints`
  // is a no-op outside combat, which is exactly the chapter's own
  // "during an encounter".
  if (actorInCombat(actor)) {
    await spendActionPoints(actor, FALLING_MINIMUM_AP, "Falling");
    lines.push(line(`<em>Falling costs a minimum of ${FALLING_MINIMUM_AP} AP in an encounter${
      ""} — spent, unless a skill check was made to avoid it.</em>`));
  }

  if (damage > 0) {
    const absorbed = await spendTemporaryHP(actor, damage);
    if (absorbed.absorbed > 0) {
      lines.push(line(`<strong>${absorbed.absorbed}</strong> absorbed by temporary HP.`));
    }
    const hp = actor.system?.resources?.hp;
    if (hp && absorbed.damageRemaining > 0) {
      const newValue = Math.max(0, Number(hp.value ?? 0) - absorbed.damageRemaining);
      await actor.update({ "system.resources.hp.value": newValue });
    }
    await actor.toggleStatusEffect("prone", { active: true });
    lines.push(line("Lands <strong>Prone</strong>."));
  }

  // A FALL THAT DEALS NO DAMAGE DOES NOT PROVOKE THE INJURY SAVE
  // (Graham's ruling, 12 Aug 2026). The save is "to resist injury" and
  // its DC rises with the damage taken; with none taken there is nothing
  // to resist, and a bad roll was breaking a leg for landing softly.
  //
  // Returned with `check: null` rather than a fabricated success, so a
  // caller can tell "no save was called for" from "a save was passed".
  if (!fallProvokesInjurySave(damage)) {
    lines.push(line("<strong>No damage, so no injury save.</strong>"));
    await postCard(actor, "Falling From Height — Result", lines);
    return { check: null, damage, outcome: { severity: null, instantDeath: false } };
  }

  const fortitude = actor.system?.combat?.saves?.fortitude;
  const modifiers = fortitude?.checkModifiers ?? [
    { label: "Fortitude", value: Number(fortitude?.total ?? 0), type: "untyped" }
  ];

  const dc = fallingSaveDC(Number(actor.system?.identity?.level ?? 0), damage);

  const check = await TRGCheck.roll({
    actor,
    label: "Falling — Injury Save",
    subject: "fortitude",
    subtitle: `Level-based Fortitude save, DC ${dc} (own Level DC +1 per 5 damage taken)`,
    type: "save",
    dc,
    modifiers: [...modifiers]
  });

  const degree = check.outcome?.degree?.key ?? "failure";
  const outcome = fallingInjuryOutcome(degree);

  if (outcome.instantDeath) {
    lines.push(line("<strong>Blunder — the fall is fatal. The character dies instantly.</strong>"));
    await postCard(actor, "Falling From Height — Result", lines);
  } else if (outcome.severity) {
    lines.push(line(`Suffers a <strong>${outcome.severity}</strong> critical injury (bludgeoning) from the fall.`));
    await postCard(actor, "Falling From Height — Result", lines);

    // Roll the critical injury automatically — a fall has no attacking
    // creature, so attackBonus is 0; "targetArmoured" checks the
    // falling actor's own equipped armour, since they're both the
    // faller and the one taking the injury.
    const targetArmoured = Array.from(actor.items ?? []).some(
      (item) => item.type === "armour" && item.system?.equipped
    );
    await rollCriticalInjury(actor, {
      damageType: "bludgeoning",
      severity: outcome.severity,
      attackBonus: 0,
      targetArmoured
    });
  } else {
    lines.push(line("<strong>No critical injury.</strong>"));
    await postCard(actor, "Falling From Height — Result", lines);
  }

  // AND WHOEVER WAS UNDERNEATH. Posted after the faller's own result,
  // because the creature's share is worked out from it — "one-quarter
  // the falling damage YOU took", "a critical of one degree less
  // severity" than YOURS.
  //
  // Through `severityPassedOn` rather than off `outcome.severity`: a
  // Blunder is instant death rather than a critical, so the faller has
  // no severity of their own and passes on a DEADLY all the same.
  if (landedOn) {
    await postCard(actor, "Falling — Landed On",
      landedOnLines(landedOn, damage, severityPassedOn(outcome), outcome));
  }

  return { check, damage, outcome, landedOn: landedOn?.name ?? null };
}
