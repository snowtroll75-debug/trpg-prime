import { ClassicLevel } from 'classic-level';
const db = new ClassicLevel('/root/ff30/module-src/fiends-and-fables-prime/packs/creatures', { valueEncoding: 'json' });
const all=[]; for await (const [k, v] of db.iterator()) all.push([k,v]);
await db.close();
const ettin = all.find(([k,v])=>k.startsWith('!actors!') && v.name==='Ettin')[1];
const dm = all.find(([k,v])=>k.startsWith(`!actors.items!${ettin._id}.`) && v.name==='Dual Minds');
console.log(dm[0], JSON.stringify(dm[1].effects));
for (const [k,v] of all) if (k.startsWith(`!actors.items.effects!${ettin._id}.${dm[1]._id}.`)) console.log(k, JSON.stringify({name:v.name, changes:v.changes, transfer:v.transfer}));
// any other actors with ap/reactions effects
for (const [k,v] of all) if (k.startsWith('!actors.items.effects!') && (v.changes??[]).some(c=>/resources\.(ap|reactions)\.max/.test(c.key))) console.log('FX', k, v.name);
