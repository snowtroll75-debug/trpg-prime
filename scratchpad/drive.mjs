// Drive stampRowDurations over every affected row with a stub Foundry.
globalThis.game = { combat: { round: 4 }, time: { worldTime: 1000 } };
globalThis.Roll = class { constructor(f){ this.formula=f; } async evaluate(){ this.total = 3; return this; } };
const { stampRowDurations } = await import("../module/combat/linked-conditions-workflow.mjs");
const { CRITICAL_TABLES } = await import("../module/data/critical-tables.mjs");
const { resolveEffectiveConditions, selectArmourClause } = await import("../module/effect-parser.mjs");

const armours = [
  ["bare",   { armoured: false, rigid: false, metal: false }],
  ["leather",{ armoured: true,  rigid: false, metal: false }],
  ["plate",  { armoured: true,  rigid: true,  metal: true  }]
];
let rows = 0, stamped = 0;
for (const [t, list] of Object.entries(CRITICAL_TABLES)) {
  for (const r of list) {
    for (const [name, armour] of armours) {
      const tags = resolveEffectiveConditions(r, armour);
      const clause = selectArmourClause(r, armour);
      const res = await stampRowDurations(tags, `${r.effect} ${clause?.text ?? ""}`, { persistenceRounds: r.persistence === "D" ? 7 : r.persistence === "M" ? 1 : null });
      rows++;
      if (!res.timed.length) continue;
      stamped++;
      if (name !== "bare") continue;
      console.log(`${t} ${r.min}-${r.max}  ${res.timed.map(x =>
        `${x.key}${x.value===null?"":":"+x.value}{${[
          x.expiresRound!==undefined?`r=${x.expiresRound}`:"",
          x.endsWith?`~${x.endsWith}`:"",
          x.expiresTime!==undefined&&x.expiresTime!==null?`t=${x.expiresTime}`:"",
          x.followOn?`fo=${x.followOn.tags.map(g=>g.key).join("+")}/${x.followOn.rounds}r`:""
        ].filter(Boolean).join(",")}}`).join(" ")}  | plain=${res.plain.map(p=>p.key).join("+")||"-"}`);
    }
  }
}
console.log(`\ndrove ${rows} row×armour combinations, ${stamped} produced timed tags`);
