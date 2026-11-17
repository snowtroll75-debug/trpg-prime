/*
 * advancement-sweep — a LIVE check, pasted into the console of a TEST world
 * (never the campaign world). 3.697.0.
 *
 * For each class in the core `classes` pack it creates a throwaway character
 * named "ZZ Audit <class>", adds the class, then walks the XP up from 1st to
 * 20th level one level at a time and back down again, letting the system's
 * own grant machinery run at every step. At every level it records:
 *
 *   - BAB and BDB totals against the class table row,
 *   - the class part of each save against the table,
 *   - caster level and Power Point maximum (PP from the table, before ability),
 *   - every item on the actor, so that
 *       * a granted item present twice is reported (duplicate grant),
 *       * an item still present after levelling back down below the level
 *         that granted it is reported (orphaned grant),
 *       * the item set at 1st level going up and coming back down can be
 *         compared (advancement must be reversible).
 *
 * Any dialog the grant machinery opens (a choice the player makes) is
 * recorded by title and closed unanswered, so the sweep never blocks.
 *
 * The actors are deleted at the end. Nothing else in the world is touched.
 *
 * Usage (console, as GM):  await trgAdvancementSweep({ only: ["Fighter"] })
 * Returns a plain object; nothing is posted to chat.
 */
globalThis.trgAdvancementSweep = async function ({ only = null, top = 20 } = {}) {
  if (!/test|audit/i.test(game.world.title)) throw new Error(`refusing to run in "${game.world.title}": use a test world`);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const dialogs = [];
  const closeDialogs = async () => {
    for (const app of foundry.applications.instances.values()) {
      if (app instanceof foundry.applications.api.DialogV2) {
        dialogs.push(app.options?.window?.title ?? app.title ?? "(untitled)");
        try { await app.close(); } catch (_e) { /* already closing */ }
      }
    }
  };
  const settle = async (actor) => {
    let last = -1, stable = 0;
    for (let i = 0; i < 60 && stable < 3; i++) {
      await sleep(250);
      await closeDialogs();
      const n = actor.items.size + actor.effects.size;
      stable = n === last ? stable + 1 : 0;
      last = n;
    }
  };
  const itemKey = (i) => `${i.type}:${i.name}`;
  const pack = game.packs.get("trg-prime.classes");
  const classes = (await pack.getDocuments()).filter((c) => !only || only.includes(c.name));
  const report = {};
  for (const cls of classes) {
    const rows = Array.isArray(cls.system.progression) ? cls.system.progression : [];
    const out = { mismatches: [], duplicates: [], orphans: [], irreversible: null, dialogs: [], errors: [] };
    dialogs.length = 0;
    const actor = await Actor.create({ name: `ZZ Audit ${cls.name}`, type: "character", system: { identity: { xp: { value: 10000 } } } });
    try {
      await actor.createEmbeddedDocuments("Item", [cls.toObject()]);
      await settle(actor);
      const firstUp = actor.items.map(itemKey).sort();
      const grantLevel = new Map();
      for (let L = 1; L <= top; L++) {
        if (L > 1) { await actor.update({ "system.identity.xp.value": L * 10000 }); await settle(actor); }
        const s = actor.system, row = rows.find((r) => Number(r.level) === L);
        if (s.identity.level !== L) out.mismatches.push(`L${L}: identity.level reads ${s.identity.level}`);
        if (row) {
          const want = { bab: row.bab, bdb: row.bdb, fortitude: row.fortitude, reflex: row.reflex, will: row.will };
          const got = { bab: s.combat.bab?.classTable, bdb: s.combat.bdb?.classTable,
            fortitude: s.combat.saves?.fortitude?.class, reflex: s.combat.saves?.reflex?.class, will: s.combat.saves?.will?.class };
          for (const k of Object.keys(want)) if (want[k] != null && Number(got[k]) !== Number(want[k])) out.mismatches.push(`L${L} ${k}: table ${want[k]}, actor ${got[k]}`);
          if (row.casterLevel != null && Number(s.progression?.casterLevel) !== Number(row.casterLevel)) out.mismatches.push(`L${L} casterLevel: table ${row.casterLevel}, actor ${s.progression?.casterLevel}`);
          if (row.pp != null && Number(s.progression?.pp) !== Number(row.pp)) out.mismatches.push(`L${L} pp: table ${row.pp}, actor ${s.progression?.pp}`);
        }
        const counts = {};
        for (const i of actor.items) counts[itemKey(i)] = (counts[itemKey(i)] ?? 0) + 1;
        for (const [k, n] of Object.entries(counts)) {
          if (!grantLevel.has(k)) grantLevel.set(k, L);
          if (n > 1 && !/^(weapon|armour|gear|consumable|ammunition):/.test(k)) out.duplicates.push(`L${L} ${k} x${n}`);
        }
      }
      for (let L = top - 1; L >= 1; L--) {
        await actor.update({ "system.identity.xp.value": L * 10000 }); await settle(actor);
        for (const i of actor.items) {
          const g = grantLevel.get(itemKey(i));
          if (g && g > L && i.flags?.["trg-prime"]?.grantedBy) out.orphans.push(`back at L${L}: ${itemKey(i)} (granted at L${g})`);
        }
      }
      const firstDown = actor.items.map(itemKey).sort();
      const added = firstDown.filter((k) => !firstUp.includes(k)), lost = firstUp.filter((k) => !firstDown.includes(k));
      out.irreversible = added.length || lost.length ? { added, lost } : null;
      out.itemsAtTop = [...grantLevel.entries()].filter(([, l]) => l > 1).map(([k, l]) => `${l}:${k}`);
    } catch (e) {
      out.errors.push(String(e?.stack ?? e).slice(0, 500));
    } finally {
      out.dialogs = [...new Set(dialogs)];
      out.orphans = [...new Set(out.orphans)];
      await actor.delete();
    }
    report[cls.name] = out;
  }
  return report;
};
