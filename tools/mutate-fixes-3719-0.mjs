#!/usr/bin/env node
/**
 * mutate-fixes-3719-0 — can verify-fixes-3719-0 fail? NEW at 3.719.0.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const RELAY = path.join(SYSTEM_ROOT, "module", "combat", "target-relay.mjs");
const FX = path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs");
const LINKED = path.join(SYSTEM_ROOT, "module", "combat", "linked-conditions-workflow.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-fixes-3719-0.mjs");
const DH = path.join(SYSTEM_ROOT, "module", "description-html.mjs");
const ISHEET = path.join(SYSTEM_ROOT, "module", "sheets", "item-sheet.mjs");
const ITPL = path.join(SYSTEM_ROOT, "templates", "item", "item-sheet.hbs");
const ASHEET = path.join(SYSTEM_ROOT, "module", "sheets", "actor-sheet.mjs");
const ATPL = path.join(SYSTEM_ROOT, "templates", "actor", "actor-sheet.hbs");
const USES = path.join(SYSTEM_ROOT, "module", "uses-workflow.mjs");
const OIL = path.join(SYSTEM_ROOT, "module", "oil-workflow.mjs");
const CONS = path.join(SYSTEM_ROOT, "module", "consumable-use-workflow.mjs");
const MAGIC = path.join(SYSTEM_ROOT, "module", "magic-items-workflow.mjs");

const MUTATIONS = [
  { file: FX, name: "THE SHIPPED STATE: Writ of Restraint stamps the effect directly",
    from: "              await setEffectFlags(e, { fumbleNoReactions: true }).catch(() => {});",
    to: "              await e.setFlag(SYSTEM_ID, \"fumbleNoReactions\", true).catch(() => {});", breaks: "A4/A5" },
  { file: RELAY, name: "the GM refuses the no-Reactions stamp",
    from: "  \"fumbleNoReactions\"]);", to: "  ]);", breaks: "A1/A2" },
  { file: LINKED, name: "the follow-on carry writes directly",
    from: "await setEffectFlags(effect, { [flag]: value }).catch(() => {});",
    to: "await effect.setFlag(\"trg-prime\", flag, value).catch(() => {});", breaks: "A6" },
  { file: FX, name: "THE SHIPPED STATE: Restoration writes the once-a-day record directly",
    from: "            await setTargetFlag(target, RELIEF_FLAG,\n",
    to: "            await target.setFlag(SYSTEM_ID, RELIEF_FLAG,\n", breaks: "B4/B5" },
  { file: RELAY, name: "the GM refuses the once-a-day record",
    from: "  \"reliefUsedToday\"\n]);", to: "]);", breaks: "B1/B2" },
  // D. HTML descriptions (Graham: "also present on feats and other items").
  { file: ITPL, name: "THE SHIPPED STATE: the item sheet shows the description's source",
    from: "      {{#if rich.description}}", to: "      {{#if false}}", breaks: "D16" },
  { file: ISHEET, name: "the item sheet never asks for the HTML",
    from: "    context.rich = await richTextFields(this.item, { description: this.item.system?.description }, { secrets: this.item.isOwner });",
    to: "    context.rich = {};", breaks: "D15" },
  { file: ATPL, name: "the haunts' biography shows its source",
    from: "{{#if rich.biography}}", to: "{{#if false}}", breaks: "D18" },
  { file: ASHEET, name: "the actor sheet drops the GM's secret notes from the editor",
    from: " treasure: system.gm?.treasure, gmNotes: system.gm?.notes", to: " treasure: system.gm?.treasure", breaks: "D17" },
  { file: DH, name: "a plain description with a < reads as HTML",
    from: "HTML_TAG = /<\\/?[a-z][a-z0-9]*\\b[^>]*>/i;", to: "HTML_TAG = /</;", breaks: "D2" },
  { file: DH, name: "a closing list tag is left at the start of the next block",
    from: "const BLOCK_OPEN = /^\\s*(<\\/?(p|", to: "const BLOCK_OPEN = /^\\s*(<(p|", breaks: "D5" },
  { file: DH, name: "table cells run together",
    from: "    .replace(/<\\/(td|th)>/gi, \" \")\n", to: "", breaks: "D7" },
  { file: DH, name: "the card nests HTML inside a <p>",
    from: "  if (isHtmlDescription(raw)) return `<div class=\"trg-card-description\" style=\"margin:2px 0\">${raw}</div>`;\n", to: "", breaks: "D10/D13" },
  { file: DH, name: "every field goes to the editor",
    from: "    if (!isHtmlDescription(raw)) continue;\n", to: "", breaks: "D14" },
  { file: USES, name: "a feat's use prints its description raw again",
    from: "    return postCard(actor, item.name, [cardDescription(item.system.description || \"Used.\")]);",
    to: "    return postCard(actor, item.name, [line(item.system.description || \"Used.\")]);", breaks: "D19/D20" },
  { file: OIL, name: "THE SHIPPED STATE: the oil card escapes an HTML description",
    from: "    lines.push(cardDescription(item.system?.description ?? \"\", { escape: esc }));",
    to: "    lines.push(line(esc(item.system?.description ?? \"\")));", breaks: "D19/D20" },
  { file: CONS, name: "a text-only consumable prints its description in a <p>",
    from: "    lines.push(cardDescription(item.system?.description || \"No effect is recorded on this item.\"));",
    to: "    lines.push(line(item.system?.description || \"No effect is recorded on this item.\"));", breaks: "D19" },
  { file: MAGIC, name: "a magic item's activation prints its description in a <p>",
    from: "    cardDescription(system.description || \"No activation details recorded on this item yet.\")",
    to: "    line(system.description || \"No activation details recorded on this item yet.\")", breaks: "D19" }
];

function run() {
  try {
    execFileSync(process.execPath, [CHECK], { stdio: ["ignore", "pipe", "pipe"] });
    return true;
  } catch {
    return false;
  }
}

const guard = guardFiles([RELAY, FX, LINKED, CHECK, DH, ISHEET, ITPL, ASHEET, ATPL, USES, OIL, CONS, MAGIC]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-fixes-3719-0: verify already fails on an unmodified tree.\n");
    guard.release();
    process.exit(2);
  }
  for (const m of MUTATIONS) {
    const original = fs.readFileSync(m.file, "utf8");
    const at = original.indexOf(m.from);
    if (at < 0 || original.indexOf(m.from, at + 1) >= 0) { results.push({ m, state: at < 0 ? "UNMATCHED" : "AMBIGUOUS" }); continue; }
    fs.writeFileSync(m.file, original.slice(0, at) + m.to + original.slice(at + m.from.length));
    try { results.push({ m, state: run() ? "SURVIVED" : "caught" }); } finally { fs.writeFileSync(m.file, original); }
  }
} finally {
  guard.restore();
  guard.release();
}
for (const r of results) process.stdout.write(`  ${r.state.padEnd(9)} ${r.m.name}\n`);
const bad = results.filter((r) => r.state !== "caught");
if (bad.length) { process.stderr.write(`\nmutate-fixes-3719-0: ${bad.length} of ${results.length} not caught.\n`); process.exit(1); }
process.stdout.write(`\nmutate-fixes-3719-0: OK — all ${results.length} mutations caught, tree restored.\n`);
