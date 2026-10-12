import { TRGCheck } from "../dice/check.mjs";
import { counteractModifier } from "../counteract.mjs";
// A CANTRIP COUNTERACTS AT THE PP YOU CAN CAST (3.583.0; page 236,
// Graham's R10). The dialog asked for a number and said nothing about
// the rule, so a player answering honestly with a cantrip's 0 PP took
// -2 per point of whatever they were trying to counteract.
import { maxPPPerCast } from "../magic/casting.mjs";

const { DialogV2 } = foundry.applications.api;

/**
 * The Counteract Check (Chapter 8): an opposed check against the DC of the
 * effect being removed, at +/-2 per level or PP of difference between the
 * acting check and the effect. Which check to roll and what the target DC
 * equals are both left to the table by the rulebook's own wording, so this
 * prompts for both rather than assuming Spellcraft or a fixed DC formula —
 * see the README's amendments list.
 */
export async function rollCounteractCheck(actor, { targetLevel = 0, dc: knownDC = null, circumstance = 0, dcFromLevel = false } = {}) {
  const maxCastablePP = maxPPPerCast(Number(actor.system?.magic?.casterLevelValue ?? 0));
  const skillEntries = Object.entries(actor.system?.skills ?? {}).map(
    ([key, skill]) => [key, skill.label ?? key]
  );

  const result = await DialogV2.wait({
    window: { title: "Counteract Check", icon: "fa-solid fa-hand-sparkles" },
    classes: ["trg-prime"],
    position: { width: 420 },
    content: `
      <div class="trg-prime trg-check-dialog">
        <p class="hint">Opposed check against the DC of the effect you're removing, modified +/-2 per level or PP of difference.</p>
        <div class="form-group">
          <label for="trg-cc-check">Your check</label>
          <select id="trg-cc-check" name="checkKey">
            <option value="spellcraft">Spellcraft</option>
            ${skillEntries.map(([key, label]) => `<option value="${key}">${label}</option>`).join("")}
          </select>
        </div>
        <div class="form-group">
          <label for="trg-cc-acting">Your level/PP spent</label>
          <input id="trg-cc-acting" type="number" name="acting" value="${maxCastablePP}">
        </div>
        <div class="form-group">
          <label for="trg-cc-target">Effect's level/PP</label>
          <input id="trg-cc-target" type="number" name="target" value="${Math.max(0, Math.trunc(Number(targetLevel) || 0))}">
        </div>
        <p class="hint" style="margin:4px 0">
          <strong>A cantrip counteracts at the PP you can cast</strong>, not at 0 —
          page 236: "cantrips … are always treated as the PP that you are able to
          cast for counteract purposes". Your maximum is
          <strong>${maxCastablePP}</strong>, which is what the acting value is set
          to above; change it if you are counteracting with something else.
        </p>
        <div class="form-group">
          <label for="trg-cc-dc">Effect's DC (if known)</label>
          <input id="trg-cc-dc" type="number" name="dc" placeholder="\u2014"${Number(knownDC) > 0 ? ` value="${Math.trunc(Number(knownDC))}"` : ""}>
        </div>${dcFromLevel ? `
        <p class="hint" style="margin:4px 0">Left blank, the DC is the Level DC of the effect's level above.</p>` : ""}
        <div class="form-group">
          <label for="trg-cc-circ">Circumstance bonus</label>
          <input id="trg-cc-circ" type="number" name="circumstance" value="${Math.trunc(Number(circumstance) || 0)}">
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

  const modifier = counteractModifier(result.acting, result.target);
  /*
   * A BLANK DC IS NO DC (3.630.1, F12 of the 3.630.0 live test). An empty
   * number box arrives as null, not "", and Number(null) is 0 — so every
   * Counteract rolled with the DC left blank was measured against DC 0 and
   * came out Heroic, where the subtitle promised the GM would adjudicate.
   */
  const rawDC = result.dc === "" || result.dc === undefined || result.dc === null ? null : Number(result.dc);
  let dc = Number.isFinite(rawDC) && rawDC > 0 ? rawDC : null;
  // A ROW THAT KNOWS THE EFFECT'S LEVEL MEANS ITS LEVEL DC (Exorcise: the
  // GM enters the possessor's level and nothing else).
  if (dc === null && dcFromLevel) {
    const { levelDC } = await import("../dice/resolution.mjs");
    dc = levelDC(Math.max(0, Math.trunc(Number(result.target) || 0)));
  }

  let modifiers;
  let label;
  let type;
  if (result.checkKey === "spellcraft") {
    label = "Counteract — Spellcraft";
    type = "spellcraft";
    modifiers = [
      {
        label: "Spellcraft",
        value: Number(actor.system?.magic?.spellcraft?.total ?? 0),
        type: "untyped"
      }
    ];
  } else {
    const skill = actor.system?.skills?.[result.checkKey];
    label = `Counteract — ${skill?.label ?? result.checkKey}`;
    type = "skill";
    modifiers = skill?.checkModifiers ?? [
      { label: skill?.label ?? "Skill", value: Number(skill?.total ?? 0), type: "untyped" }
    ];
  }
  modifiers = [...modifiers];
  if (modifier) {
    modifiers.push({
      label: `Level/PP difference (${result.acting} vs ${result.target})`,
      value: modifier,
      // THE BOOK'S ARITHMETIC, NOT A BONUS (3.630.1, found on the retest):
      // typed as circumstance, it swallowed Exorcise's +3 circumstance from
      // the warp under the highest-of-a-type rule (+2 and +3 gave +3).
      type: "untyped"
    });
  }
  // A CIRCUMSTANCE THE SPELL OR THE TABLE NAMES (3.630.1) — Exorcise's warp,
  // "+1 circumstance per +1 PP"; Sever Influence's +2 against its Judged
  // Subject's effect. Both told the player to add it in this dialog, which
  // had nowhere to put it.
  const circ = Math.trunc(Number(result.circumstance) || 0);
  if (circ) modifiers.push({ label: "Circumstance", value: circ, type: "circumstance" });

  return TRGCheck.roll({
    actor,
    label,
    subtitle: dc !== null ? `vs DC ${dc}` : "DC not specified — GM adjudicates",
    type,
    dc,
    modifiers
  });
}
