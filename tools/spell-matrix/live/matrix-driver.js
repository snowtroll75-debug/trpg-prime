/*
 * matrix-driver — run spell-matrix cases LIVE, through the real sheet button
 * and the real dialogs, from a GM client and a Player client at once.
 *
 * Pasted (or imported) into the console of BOTH clients of a TEST world:
 *   GM      http://localhost:30000      (Testing Dude)
 *   Player  http://127.0.0.1:30000      (PC Tester) — a different origin, so
 *           a different login, in the same browser
 *
 * WHY TWO CLIENTS. A GM may write to any actor; a player may not. A spell that
 * damages a GM-owned foe has to reach that foe through the GM relay, and only
 * a cast made FROM the player's client proves the relay works. Reading the
 * foe's HP is done on the GM client, because a player's client does not hold
 * an actor it has no permission on.
 *
 * WHY THE REAL DIALOGS. tools/live/cast-driver.js records why a stubbed
 * DialogV2 reported false AP and PP. This driver does not replace any dialog:
 * it fills the warp chooser's own inputs (warp-<i>, mm-<id>) and presses its
 * own buttons.
 *
 * DICE. `SM.fix({20: 9, 4: 3})` fixes the face of every die of that size on
 * THIS client (other sizes roll normally); `SM.unfix()` restores the original
 * DiceTerm.roll. Each client rolls its own dice (the caster's check and damage
 * on the caster's client, a GM-owned target's save on the GM's), so fix both.
 *
 * API (globalThis.SM):
 *   SM.fix(faces) / SM.unfix()
 *   SM.snapshot(names)            -> {name: {hp, pp, ap, effects:[names]}}   (GM: any actor)
 *   SM.cast({ actor, spell, picks, targets, decline, pp, ap })
 *        picks   [{kind:"warp", index, times} | {kind:"mm", id, times, choice}]
 *        targets token names to target before casting
 *        decline RegExp of dialog titles to answer No/Cancel (e.g. /Overcast|Sacrifice/)
 *     -> { offered:{warps, metamagic}, filled, missing, trail, pp:{before,after}, ap:{...}, cards, errors }
 *   SM.answerSaves(on)            GM only: press "Roll" on save requests addressed to the GM
 *   SM.cleanup()                  dialogs closed, targets released, dice restored
 */
(() => {
  if (!/test/i.test(game.world.title)) throw new Error(`matrix-driver refuses to run in "${game.world.title}"`);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const DT = foundry.dice.terms.DiceTerm;
  const errors = [];
  if (!globalThis.__smErrHook) {
    globalThis.__smErrHook = true;
    window.addEventListener("error", (e) => errors.push(String(e.message)));
    window.addEventListener("unhandledrejection", (e) => errors.push(String(e.reason?.message ?? e.reason)));
    const ce = console.error.bind(console);
    console.error = (...a) => { errors.push(a.map(String).join(" ").slice(0, 300)); ce(...a); };
  }
  const openDialogs = () => [...document.querySelectorAll(".application.dialog")];
  const titleOf = (d) => (d.querySelector(".window-title")?.textContent ?? "").trim();
  const textOf = (n) => (n?.textContent ?? "").replace(/\s+/g, " ").trim();

  const SM = {
    errors,
    fix(faces) {
      globalThis.__smDice ??= { orig: DT.prototype.roll, faces: {} };
      globalThis.__smDice.faces = { ...faces };
      DT.prototype.roll = async function (options = {}) {
        const f = globalThis.__smDice?.faces?.[this.faces];
        if (f == null) return globalThis.__smDice.orig.call(this, options);
        const r = { result: Array.isArray(f) ? (f.length > 1 ? f.shift() : f[0]) : f, active: true };
        this.results.push(r);
        return r;
      };
      return globalThis.__smDice.faces;
    },
    unfix() {
      if (globalThis.__smDice) { DT.prototype.roll = globalThis.__smDice.orig; delete globalThis.__smDice; }
      return "dice restored";
    },
    snapshot(names) {
      const out = {};
      for (const n of names) {
        const a = game.actors.getName(n);
        if (!a) { out[n] = null; continue; }
        out[n] = { hp: a.system.resources?.hp?.value, pp: a.system.resources?.pp?.value, ap: a.system.resources?.ap?.value,
          effects: a.effects.map((e) => `${e.name}${e.duration?.seconds ? `(${e.duration.seconds}s)` : e.duration?.rounds ? `(${e.duration.rounds}r)` : ""}`) };
      }
      return out;
    },
    clearDialogs() {
      for (const d of openDialogs()) {
        const b = [...d.querySelectorAll("button")].find((x) => /^(no|cancel|close)$/i.test(textOf(x))) ?? d.querySelector('button[data-action="close"]');
        if (b) b.click(); else d.remove();
      }
    },
    async cast({ actor, spell, picks = [], targets = [], decline = null, pp = null, ap = 6, steps = 10, conviction = false, warpManipulation = false } = {}) {
      const A = game.actors.getName(actor);
      if (!A) throw new Error(`no actor ${actor}`);
      SM.clearDialogs(); await wait(400);
      const ppStart = pp ?? Number(A.system.resources?.pp?.max ?? 0);
      if (A.isOwner) await A.update({ "system.resources.pp.value": ppStart, "system.resources.ap.value": ap });
      for (const t of canvas.tokens.placeables) t.setTarget(false, { user: game.user, releaseOthers: false });
      for (const n of targets) {
        const tok = canvas.tokens.placeables.find((t) => t.name === n);
        if (tok) tok.setTarget(true, { user: game.user, releaseOthers: false });
      }
      const from = game.messages.size;
      const errFrom = errors.length;
      const before = { pp: A.system.resources?.pp?.value, ap: A.system.resources?.ap?.value };
      await A.sheet.render(true); await wait(900);
      const sheet = A.sheet.element;
      const tab = sheet.querySelector('[data-tab="spells"][data-action="tab"], nav [data-tab="spells"]');
      tab?.click(); await wait(300);
      const row = [...sheet.querySelectorAll("[data-item-id]")].find((n) => n.querySelector('[data-action="castSpell"]') && A.items.get(n.dataset.itemId)?.name === spell);
      if (!row) return { spell, error: "no spell row with a cast button" };
      row.querySelector('[data-action="castSpell"]').click();
      await wait(1800);
      const trail = [], offered = { warps: [], metamagic: [] }, filled = [], missing = [];
      // A CAST CAN PAUSE ON ITS CHAT CARD, not only in a dialog: the Conviction
      // "+1d6 before it is read?" prompt. Declined, so the roll resolves as rolled
      // (opts.conviction: true to spend instead). Warp Manipulation's offer after a
      // check that beat the DC by 2 is closed unless the case asks for it.
      let idle = 0;
      for (let i = 0; i < steps * 3 && idle < 3; i++) {
        const cardBtn = game.messages.contents.slice(from).map((m) => document.querySelector(`[data-message-id="${m.id}"] [data-action="${conviction ? "convictionNowSpend" : "convictionNowPass"}"]`)).find(Boolean);
        if (cardBtn) { trail.push(`card: conviction ${conviction ? "spent" : "declined"}`); cardBtn.click(); await wait(1600); idle = 0; continue; }
        const d = openDialogs().pop();
        if (!d) { idle++; await wait(700); continue; }
        idle = 0;
        const title = titleOf(d);
        trail.push(title);
        if (/Warp\?/i.test(title)) {
          offered.warps = [...d.querySelectorAll('[name^="warp-"]')].map((x) => `${x.name}: ${textOf(x.closest("label")).slice(0, 70)}`);
          offered.metamagic = [...d.querySelectorAll('[name^="mm-"]')].map((x) => x.name.slice(3));
          for (const p of picks) {
            const name = p.kind === "warp" ? `warp-${p.index}` : `mm-${p.id}`;
            const inp = d.querySelector(`[name="${name}"]`);
            if (!inp) { missing.push(name); continue; }
            if (inp.tagName === "SELECT") inp.value = p.choice ?? "";
            else if (inp.type === "checkbox") inp.checked = p.times > 0;
            else inp.value = String(p.times);
            inp.dispatchEvent(new Event("change", { bubbles: true }));
            filled.push(`${name}=${inp.type === "checkbox" ? inp.checked : inp.value}`);
          }
        }
        const buttons = [...d.querySelectorAll("footer button, .form-footer button, button[data-action]")].filter((b) => textOf(b));
        let go;
        if (/Warp Manipulation/i.test(title) && !warpManipulation) { trail.push("→ (closed)"); d.querySelector('button[data-action="close"]')?.click(); await wait(900); continue; }
        if (decline && decline.test(title)) go = buttons.find((b) => /^(no|cancel)$/i.test(textOf(b)));
        go ??= buttons.find((b) => /continue|^cast|^ok$|^yes$|confirm|proceed|roll|apply/i.test(textOf(b))) ?? buttons[0];
        if (!go) { trail.push("!! no answerable button"); break; }
        trail.push(`→ ${textOf(go)}`);
        go.click();
        await wait(1900);
      }
      await wait(1500);
      const cards = game.messages.contents.slice(from).map((m) => textOf(Object.assign(document.createElement("div"), { innerHTML: m.content })).slice(0, 900));
      return { actor, spell, picks, targets, offered, filled, missing, trail,
        pp: { start: ppStart, before: before.pp, after: A.system.resources?.pp?.value },
        ap: { before: before.ap, after: A.system.resources?.ap?.value },
        cards, errors: errors.slice(errFrom) };
    },
    cleanup() {
      SM.clearDialogs();
      for (const t of canvas.tokens.placeables) t.setTarget(false, { user: game.user, releaseOthers: false });
      return SM.unfix();
    }
  };
  globalThis.SM = SM;
  return `matrix-driver ready as ${game.user.name} (${game.user.isGM ? "GM" : "Player"})`;
})();
