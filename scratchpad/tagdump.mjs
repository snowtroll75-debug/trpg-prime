import { CRITICAL_TABLES } from "../module/data/critical-tables.mjs";
import { FUMBLE_TABLES } from "../module/data/fumble-tables.mjs";
import { extractConditionTags } from "../module/effect-parser.mjs";
const out = [];
const feed = (src, name) => {
  for (const [t, rows] of Object.entries(src)) {
    for (const r of rows) {
      const texts = [["effect", r.effect], ...(r.armourClauses ?? []).map(c => [c.kind, c.text])];
      for (const [kind, text] of texts) {
        const tags = extractConditionTags(text).map(g => `${g.key}${g.value === null ? "" : ":" + g.value}`).join("+");
        out.push(`${name}/${t}/${r.min}-${r.max}/${kind}\t${tags}`);
      }
    }
  }
};
feed(CRITICAL_TABLES, "crit");
feed(FUMBLE_TABLES, "fumble");
console.log(out.join("\n"));
