/*
 * familiar-check — a LIVE check for a TEST world (3.697.0). Paste into the
 * console as GM and `await trgFamiliarCheck()`.
 *
 * Creates a throwaway 5th-level "ZZ Audit Master" with the Familiar feat,
 * summons its familiar (answering the form prompt with "Owl"), gives the
 * familiar Fast Movement, Spell Battery and Energy Resistant, reads the
 * results, then deletes both actors.
 *
 * On 3.696.3 (measured 17 Nov 2026): land 25 → 25, no Energy Resistant
 * Use, Spell Battery worth 0. On 3.697.0 it should read 25 → 40, a Use, and 1.
 */
globalThis.trgFamiliarCheck = async function () {
  if (!/test|audit/i.test(game.world.title)) throw new Error(`refusing to run in "${game.world.title}": use a test world`);
  const H = game.trgPrime.modules.helpers;
  const famFeat = (await game.packs.get("trg-prime.feats").getDocuments()).find((d) => d.name === "Familiar");
  const docs = await game.packs.get("trg-prime.familiars").getDocuments();
  const auto = Hooks.on("renderDialogV2", (app) => {
    const input = app.element.querySelector("input[name=form]");
    if (input) { input.value = "Owl"; app.element.querySelector("button[data-action=ok]")?.click(); }
  });
  const master = await Actor.create({ name: "ZZ Audit Master", type: "character", system: { identity: { xp: { value: 50000 } } } });
  let familiar = null;
  const out = {};
  try {
    const [feat] = await master.createEmbeddedDocuments("Item", [famFeat.toObject()]);
    const made = await H.createFamiliarFor(master, feat);
    familiar = made?.documentName === "Actor" ? made : (H.familiarsOf(master)[0] ?? null);
    const land = () => { const l = familiar.system.combat.movement.land; return typeof l === "object" ? l.total : l; };
    out.landBefore = land();
    await familiar.createEmbeddedDocuments("Item", ["Fast Movement", "Spell Battery", "Energy Resistant"].map((n) => docs.find((d) => d.name === n).toObject()));
    out.landAfter = land();
    const fw = await import("/systems/trg-prime/module/feats-workflow.mjs");
    const sa = await import("/systems/trg-prime/module/magic/spell-adder.mjs");
    out.energyResistantUse = "energy resistant" in fw.FEAT_AUTOMATION;
    out.spellBattery = typeof sa.familiarSpellAdders === "function"
      ? sa.familiarSpellAdders(H.familiarsOf(master)).reduce((s, x) => s + x.value, 0)
      : 0;
  } catch (e) {
    out.error = String(e?.stack ?? e).slice(0, 500);
  } finally {
    Hooks.off("renderDialogV2", auto);
    if (familiar) await familiar.delete();
    await master.delete();
  }
  return out;
};
