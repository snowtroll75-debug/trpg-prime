import { ClassicLevel } from 'classic-level';
const [,, actorName, itemPat] = process.argv;
const db = new ClassicLevel('/root/ff30/module-src/fiends-and-fables-prime/packs/creatures', { valueEncoding: 'json' });
let aid=null, actor=null; for await (const [k, v] of db.iterator({gte:'!actors!',lt:'!actors!~'})) if (v.name===actorName) { aid=v._id; actor=v; }
if (!itemPat) { console.log(JSON.stringify({system:actor.system, flags:actor.flags}, null, 0).slice(0,3000)); }
for await (const [k, v] of db.iterator({gte:`!actors.items!${aid}.`,lt:`!actors.items!${aid}.~`})) {
  if (itemPat && new RegExp(itemPat,'i').test(v.name)) console.log(v.type, v.name, JSON.stringify({system:v.system, flags:v.flags}).slice(0,2500));
  if (!itemPat) console.log('  -', v.type, v.name);
}
await db.close();
