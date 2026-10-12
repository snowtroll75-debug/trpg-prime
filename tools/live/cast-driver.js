/*
 * cast-driver — drive a real cast through the REAL dialogs, from the
 * Foundry console.
 *
 * NEW at 3.519.0, and it exists because of what happened on 7 September
 * 2026 while live-testing the cast-time channel.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY NOT STUB `DialogV2`.
 *
 * The obvious way to script a cast is to replace `DialogV2.prompt`,
 * `.wait` and `.confirm` with functions that answer instantly. That was
 * done, and it REPORTED FALSE NUMBERS: Restore Senses came back as
 * "0 AP spent" under the stub and "2 AP spent" through the real dialogs,
 * the same spell on the same page seconds apart. A long stretch of that
 * session was spent hunting a defect in the system that was really a
 * defect in the harness.
 *
 * The mechanism was never pinned. What matters is the general shape,
 * which `cast-workflow.mjs` already records against the potion prompt:
 * THE HARNESS ANSWERS EVERY PROMPT, SO A WORKFLOW THAT QUIETLY STOPS
 * LOOKS IDENTICAL TO ONE THAT FINISHED. A stubbed run can be trusted for
 * whether a card appears and what it says. It cannot be trusted for what
 * was spent.
 *
 * So this driver does not replace anything. It clicks the real dialogs,
 * in the real order, the way a player does — which is slower, and is the
 * only way the AP and PP numbers mean anything.
 *
 * TWO OTHER TRAPS FROM THAT SESSION, both self-inflicted, both costly:
 *
 *   `delete CONFIG.Dice.randomUniform` does NOT restore Foundry's RNG —
 *   it removes the function, and every roll afterwards throws, aborting
 *   casts part-way with no error and a resolved promise. SAVE IT AND
 *   ASSIGN IT BACK. `forceRoll`/`unforceRoll` below do.
 *
 *   `delete DialogV2.prompt` likewise removes the static method rather
 *   than revealing an original. Only a page reload brings it back.
 *
 * ─────────────────────────────────────────────────────────────────────
 * USE
 *
 *   const D = await import("/systems/trg-prime/tools/live/cast-driver.js");
 *   D.setup("ZZ Test Caster (Cleric of Dawn)");        // opens the sheet
 *   await D.combat();                                  // start one, if needed
 *   await D.cast("Regenerate", { warp: /casting time is 2 AP/ });
 *   await D.cast("Lifekeeping", { warp: /lower the AP cost/, times: 3 });
 *   await D.cast("Cure", { target: /Borin/ });
 *
 * Each call resets AP and PP first, returns what was spent, which dialogs
 * appeared, and the chat cards the cast produced.
 */

let ACTOR = null;
let ORIGINAL_RNG = null;

/** The actor every call below acts on, with its sheet open. */
export function setup(actorName) {
  ACTOR = game.actors.getName(actorName);
  if (!ACTOR) throw new Error(`no actor named ${actorName}`);
  ACTOR.sheet.render(true);
  return ACTOR.name;
}

/**
 * Force every d20 to a given face. SAVES the original rather than
 * deleting it — see the header.
 */
export function forceRoll(natural) {
  ORIGINAL_RNG ??= CONFIG.Dice.randomUniform;
  CONFIG.Dice.randomUniform = () => 1 - (natural - 0.5) / 20;
}

/** Put Foundry's own RNG back. Never `delete` it. */
export function unforceRoll() {
  if (ORIGINAL_RNG) CONFIG.Dice.randomUniform = ORIGINAL_RNG;
}

/** A started combat with this actor in it, so AP is actually tracked. */
export async function combat() {
  let c = game.combat;
  if (!c) c = await Combat.create({ scene: canvas.scene.id });
  let tok = canvas.tokens.placeables.find((t) => t.actor?.id === ACTOR.id);
  if (!tok) {
    const td = await ACTOR.getTokenDocument({ x: 1500, y: 1500 });
    const [made] = await canvas.scene.createEmbeddedDocuments("Token", [td.toObject()]);
    tok = canvas.tokens.get(made.id);
  }
  if (!c.combatants.find((k) => k.actorId === ACTOR.id)) {
    await c.createEmbeddedDocuments("Combatant",
      [{ tokenId: tok.id, actorId: ACTOR.id, sceneId: canvas.scene.id, initiative: 20 }]);
  }
  // `startCombat` is unreliable headlessly; setting the round directly is
  // what `actorInCombat` actually reads.
  if (!c.started) await c.update({ round: 1, turn: 0 });
  return { started: game.combat.started, round: game.combat.round, inCombat: ACTOR.inCombat };
}

const open = () => [...document.querySelectorAll(".application.dialog, dialog[open]")];
const titleOf = (d) => (d.querySelector(".window-title")?.textContent ?? "").trim();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Close whatever dialogs a previous run left standing. */
export function clearDialogs() {
  for (const d of open()) {
    // NO/CANCEL FIRST, THEN THE WINDOW'S OWN CLOSE CONTROL. This looked
    // only for the words "cancel" or "close" and left an Overcasting
    // confirm — whose buttons are Yes and No — standing across every
    // later call in the session.
    const b = [...d.querySelectorAll("button")]
      .find((x) => /^(no|cancel|close)$/i.test((x.textContent || "").trim()))
      ?? d.querySelector('button[data-action="close"]');
    if (b) b.click(); else d.remove();
  }
}

/**
 * Cast a spell by clicking its real dialogs.
 *
 * @param {string} spellName
 * @param {object} opts
 *   target  — RegExp matching the target row to tick (default: none ticked)
 *   warp    — RegExp matching the warp row to buy
 *   times   — for a number-box warp, how many purchases (default 1)
 *   ap, pp  — pools to start from (default 3 and the actor's maximum)
 *   steps   — dialog safety cap (default 8)
 */
export async function cast(spellName, opts = {}) {
  const { target = null, warp = null, times = 1, steps = 8 } = opts;
  const ap = opts.ap ?? 3;
  const pp = opts.pp ?? Number(ACTOR.system?.resources?.pp?.max ?? 0);

  clearDialogs();
  await wait(600);
  await ACTOR.update({ "system.resources.ap.value": ap, "system.resources.pp.value": pp });
  const from = game.messages.size;

  const sheet = document.querySelector(".app.sheet.actor, .application.sheet");
  const row = [...sheet.querySelectorAll("[data-item-id]")]
    .find((n) => new RegExp(`^\\s*${spellName}\\b`).test((n.textContent || "").trim()));
  if (!row) throw new Error(`no spell row for ${spellName} — is the sheet open on the right tab?`);
  row.querySelector('[data-action="castSpell"]').click();
  await wait(2200);

  const trail = [];
  for (let i = 0; i < steps; i += 1) {
    const d = open().pop();
    if (!d) break;
    const title = titleOf(d);
    trail.push(title);

    if (target && /Select Target/i.test(title)) {
      /*
       * EVERY ROW IS SET, NOT JUST THE MATCHING ONE (3.519.1). Two bugs
       * lived here and both were found by them producing results that
       * looked like system defects:
       *
       *   The picker PRE-CHECKS whatever is currently targeted, and this
       *   only ever ticked boxes. So a second cast kept the first cast's
       *   target, went over the spell's printed target cap, and was
       *   refused by the target-COUNT gate — which warns without a card,
       *   so the run came back with no cards and no refusal and looked
       *   like a silent failure.
       *
       *   And it ticked only the FIRST match, so a two-target test
       *   quietly became a one-target test.
       *
       * Setting every box from the regex fixes both, and makes the
       * driver say what it selected rather than leaving it to the
       * picker's memory of an earlier cast.
       */
      const boxes = [...d.querySelectorAll('input[name="target"]')];
      let hit = 0;
      for (const cb of boxes) {
        cb.checked = target.test(cb.closest("label")?.textContent || "");
        if (cb.checked) hit += 1;
      }
      trail.push(`(targets ticked: ${hit}/${boxes.length})`);
      if (!hit) trail.push("!! no target row matched");
    }
    if (warp && /Warp\?/i.test(title)) {
      const inp = [...d.querySelectorAll('input[name^="warp-"]')]
        .find((x) => warp.test(x.closest("label")?.textContent || ""));
      if (!inp) trail.push("!! no warp row matched");
      else if (inp.type === "checkbox") inp.checked = true;
      else inp.value = String(times);
    }

    /*
     * HEADER CONTROLS ARE NOT ANSWERS (3.520.1). This took `buttons[0]`
     * as its fallback, and a DialogV2 window's first button is its
     * `toggleControls` icon — no text, no effect. So any dialog whose
     * wording this driver did not recognise (Overcasting — Sacrifice,
     * with its Yes/No) was "clicked" forever: the loop spun, the call
     * timed out, and the cast looked like it had hung the system.
     *
     * Filtering to buttons with visible text makes the fallback the
     * dialog's own first REAL answer, and adds yes/no to the words it
     * recognises so a confirm is answered deliberately rather than by
     * falling through.
     */
    const buttons = [...d.querySelectorAll("button")].filter((b) => (b.textContent || "").trim());
    const go = buttons.find((b) => /continue|^cast$|^ok$|^yes$|confirm|proceed/i.test((b.textContent || "").trim()))
      ?? buttons[0];
    if (!go) { trail.push("!! no answerable button"); break; }
    trail.push(`→ ${(go.textContent || "").trim()}`);
    go.click();
    await wait(2300);
  }

  const cards = game.messages.contents.slice(from)
    .map((m) => String(m.content).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
  return {
    spell: spellName,
    apSpent: ap - Number(ACTOR.system.resources.ap.value),
    ppSpent: pp - Number(ACTOR.system.resources.pp.value),
    dialogs: trail,
    refused: cards.some((c) => /Not Cast/.test(c)),
    cards
  };
}

/**
 * Undo the scaffolding `combat()` created. Removes only what this file
 * added — the combat and the token — and leaves everything else alone.
 */
export async function restore() {
  clearDialogs();
  const removed = [];
  if (game.combat) { await game.combat.delete(); removed.push("combat"); }
  const tok = canvas.tokens.placeables.find((t) => t.actor?.id === ACTOR?.id);
  if (tok) { await canvas.scene.deleteEmbeddedDocuments("Token", [tok.id]); removed.push("token"); }
  for (const t of canvas.tokens.placeables) t.setTarget(false, { user: game.user, releaseOthers: false });
  unforceRoll();
  ACTOR?.sheet?.close();
  return { removed };
}
