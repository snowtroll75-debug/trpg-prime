import { ClassicLevel } from "classic-level";
// 1. Which of this block's named abilities exist in the abilities pack?
const ab = new ClassicLevel("packs/abilities", { valueEncoding: "json" });
await ab.open();
const have = [];
for await (const [, v] of ab.iterator()) have.push(v.name);
await ab.close();
for (const n of ["Nightvision", "Darkvision", "Regeneration", "Low-Light Vision"])
  console.log(`ability "${n}": ${have.some(x => x.toLowerCase() === n.toLowerCase()) ? "IN PACK" : "not in pack"}`);
console.log(`abilities pack holds ${have.length}`);
// 2. Which spells already use grantAbility / heldBonus / trait quality?
const db = new ClassicLevel("packs/spells", { valueEncoding: "json" });
await db.open();
const byKind = new Map();
for await (const [, v] of db.iterator())
  for (const e of v?.system?.effects ?? [])
    if (["grantAbility","heldBonus","conditional","ward"].includes(e.kind))
      byKind.set(e.kind, [...(byKind.get(e.kind) ?? []), v.name]);
await db.close();
for (const [k, list] of byKind) console.log(`${k}: ${list.length} spells, e.g. ${list.slice(0,4).join(", ")}`);
