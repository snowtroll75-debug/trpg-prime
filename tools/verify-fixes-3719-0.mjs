#!/usr/bin/env node
/**
 * verify-fixes-3719-0 — what the companion-module spell sweep found.
 *
 * NEW at 3.719.0. Every module spell (Eldritch Arts 130, Pillars of Faith
 * 75, Inner Tempest 25) cast from the player's seat, 28 November 2026,
 * then the beneficial ones again on an ally that player does not own:
 *
 *   Writ of Restraint (Pillars of Faith) on the Judged Subject
 *       "User PC Tester lacks permission to update ActiveEffect" — the
 *       slowed landed, its "cannot use Reactions" stamp did not.
 *   Restoration (core; and Pillars of Faith's Nine-Herb Restorative, Soul
 *   Rebinding, Share Burden, which use the same row) on another player's
 *   character
 *       "lacks permission to update Actor" — the condition came down, the
 *       once-a-day record threw, and the cast posted no Result card.
 *
 * The narration half (HTML descriptions) is verify-spell-narration's B9–B18.
 *
 * AND THEN GRAHAM, the same night: "the HTML error that you have picked up
 * is also present on feats and other items, can you please fix them all."
 * Section D: every module item's description (1,855 of them are HTML,
 * across Eldritch Arts, Inner Tempest, Pillars of Faith and some core
 * packs) read as markup in the item sheet's textarea; the cards that print
 * an item's own words escaped it or nested it in a <p>; and two actor
 * packs (the Pillars of Faith haunts, the vehicles) carry HTML notes.
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { isHtmlDescription, htmlBlocks, blockText, descriptionPlainText, cardDescription, richTextFields } from "../module/description-html.mjs";
import { RELAY_ACTIONS, SPELL_RELAY_FLAGS, EFFECT_STAMP_FLAGS, handleRelayMessage, buildRelayRequest } from "../module/combat/target-relay.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const read = (p) => fs.readFileSync(path.join(SYSTEM_ROOT, p), "utf8");
const GM = { id: "gm1", isGM: true };

async function relay(action, payload) {
  const rec = { calls: [] };
  const target = { name: "Ally", uuid: "Actor.ally" };
  const effect = { id: "e1", flags: { "trg-prime": { spellEffect: true } } };
  const deps = {
    fromUuid: async (u) => (u === "Actor.ally" ? target : null),
    userOwns: () => true,
    setSpellFlag: async (...a) => { rec.calls.push(["flag", ...a]); },
    effectOf: (t, id) => (id === "e1" ? effect : null),
    isSpellEffect: (e) => e === effect,
    deleteEffect: async (e) => { rec.calls.push(["delete", e]); },
    stampEffect: async (e, f) => { rec.calls.push(["stamp", e, f]); },
    reply: (m) => { rec.reply = m; },
    acknowledge: () => {}
  };
  await handleRelayMessage(buildRelayRequest({ action, uuid: "Actor.ally", userId: "player1", requestId: "r1", payload }),
    { user: GM, activeGM: GM, deps });
  return { rec, target, effect };
}

/* A. Writ of Restraint's no-Reactions stamp -------------------------- */
ok("A1 fumbleNoReactions is a stamp the GM may set", EFFECT_STAMP_FLAGS.includes("fumbleNoReactions"));
{
  const { rec, effect } = await relay(RELAY_ACTIONS.EFFECT_STAMP, { effectId: "e1", flags: { fumbleNoReactions: true } });
  ok("A2 and the GM's client stamps it on the named effect",
    rec.reply?.ok === true && rec.calls[0]?.[0] === "stamp" && rec.calls[0]?.[1] === effect && rec.calls[0]?.[2]?.fumbleNoReactions === true,
    JSON.stringify(rec));
}
{
  const { rec } = await relay(RELAY_ACTIONS.EFFECT_STAMP, { effectId: "e1", flags: { fumbleNoReactions: true, changes: [] } });
  ok("A3 a stray key beside it is still refused", rec.reply?.ok === false && rec.calls.length === 0);
}
const effects = read("module/magic/spell-effects.mjs");
const noR = effects.slice(effects.indexOf("          if (effect.noReactions) {"), effects.indexOf("          if (effect.noReactions) {") + 900);
ok("A4 the cast stamps it through setEffectFlags", /await setEffectFlags\(e, \{ fumbleNoReactions: true \}\)/.test(noR), noR.slice(0, 200));
ok("A5 and no longer writes the effect directly", !/e\.setFlag\(SYSTEM_ID, "fumbleNoReactions"/.test(effects));
const linked = read("module/combat/linked-conditions-workflow.mjs");
ok("A6 the follow-on carry (Slowed 2 → Slowed 1) goes the same way",
  /await setEffectFlags\(effect, \{ \[flag\]: value \}\)/.test(linked) && !/effect\.setFlag\("trg-prime", flag, value\)/.test(linked));

/* B. Restoration's once-a-day record -------------------------------- */
ok("B1 reliefUsedToday is a record the GM may write", SPELL_RELAY_FLAGS.includes("reliefUsedToday"));
{
  const value = { restoration: true };
  const { rec, target } = await relay(RELAY_ACTIONS.SPELL_FLAG, { key: "reliefUsedToday", value });
  ok("B2 and the GM's client writes it on the fetched target",
    rec.reply?.ok === true && rec.calls[0]?.[1] === target && rec.calls[0]?.[2] === "reliefUsedToday" && rec.calls[0]?.[3] === value,
    JSON.stringify(rec));
}
{
  const { rec } = await relay(RELAY_ACTIONS.SPELL_FLAG, { key: "reliefUsedToday", value: "yes" });
  ok("B3 a record that is not an object is refused", rec.reply?.ok === false && rec.calls.length === 0);
}
const relief = effects.slice(effects.indexOf('case "conditionRelief": {'), effects.indexOf('case "conditionRelief": {') + 12000);
ok("B4 the relief row writes it through setTargetFlag",
  /await setTargetFlag\(target, RELIEF_FLAG,\s*markRelievedToday\(reliefRecord, reliefSpec\.oncePerDay\)\)/.test(relief));
ok("B5 and no longer writes the target directly", !/await target\.setFlag\(SYSTEM_ID, RELIEF_FLAG/.test(effects));

/* D. HTML descriptions on items, cards and actor sheets ---------------- */
ok("D1 a <p> description is HTML", isHtmlDescription("<p><strong>SPELLWARDEN</strong></p>"));
ok("D2 plain text with a < is not", !isHtmlDescription("Deals 1d6 if the roll is < 10 & the foe is prone."));
ok("D3 nor is a core description", !isHtmlDescription("You gain a +1 bonus.\n\nWarping Options:\n+1 PP: more."));
ok("D4 a self-closing <br/> counts", isHtmlDescription("One<br/>Two"));
{
  const blocks = htmlBlocks("<p><strong>A</strong></p>\n<p>B &amp; C</p><ul><li>one</li><li>two</li></ul><table><tr><td>x</td><td>y</td></tr></table>");
  ok("D5 the blocks are its paragraphs, list items and rows", blocks.length === 5, JSON.stringify(blocks));
  ok("D6 a block's text drops the tags and decodes the entities", blockText(blocks[1]) === "B & C", blockText(blocks[1]));
  ok("D7 table cells do not run together", blockText(blocks[4]) === "x y", blockText(blocks[4]));
}
ok("D8 plain text comes back unchanged", descriptionPlainText("Line one.\nLine two < three.") === "Line one.\nLine two < three.");
ok("D9 HTML comes back one paragraph a line", descriptionPlainText("<p>One</p><p>Two</p>") === "One\nTwo");
{
  const html = cardDescription("<p><strong>Bold</strong> text</p><p>More</p>");
  ok("D10 a card keeps HTML as HTML, in a div and not inside a <p>",
    /^<div class="trg-card-description"[^>]*><p><strong>Bold<\/strong> text<\/p><p>More<\/p><\/div>$/.test(html), html);
  ok("D11 plain text is a card line, as before", cardDescription("Used.") === '<p style="margin:2px 0">Used.</p>');
  const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  ok("D12 a caller that escaped plain text still does", cardDescription("a < b", { escape: esc }) === '<p style="margin:2px 0">a &lt; b</p>');
  ok("D13 and its HTML is not escaped", !/&lt;/.test(cardDescription("<p>x</p>", { escape: esc })));
}
{
  const rich = await richTextFields(null, { a: "<p>x</p>", b: "plain", c: "", d: undefined });
  ok("D14 only the HTML fields are given to the editor", JSON.stringify(Object.keys(rich)) === JSON.stringify(["a"]), JSON.stringify(rich));
}
const itemSheet = read("module/sheets/item-sheet.mjs");
const itemTpl = read("templates/item/item-sheet.hbs");
ok("D15 the item sheet asks for its description's HTML",
  /context\.rich = await richTextFields\(this\.item, \{ description: this\.item\.system\?\.description \}/.test(itemSheet));
ok("D16 and shows HTML in the rich editor, with the textarea kept for plain text",
  /\{\{#if rich\.description\}\}\s*<prose-mirror class="chronicle" name="system\.description" value="\{\{system\.description\}\}" toggled\{\{#unless editable\}\} disabled\{\{\/unless\}\}>\{\{\{rich\.description\}\}\}<\/prose-mirror>\s*\{\{else\}\}\s*<textarea\s+class="chronicle"\s+name="system\.description"/.test(itemTpl));
const actorSheet = read("module/sheets/actor-sheet.mjs");
const actorTpl = read("templates/actor/actor-sheet.hbs");
const ACTOR_FIELDS = { notes: "system.details.notes", magicNotes: "system.magic.notes", biography: "system.details.biography",
  appearance: "system.details.appearance", personality: "system.details.personality", treasure: "system.gm.treasure", gmNotes: "system.gm.notes" };
for (const [key, name] of Object.entries(ACTOR_FIELDS)) {
  const field = name.replace(/\.(?=[a-z]+$)/i, "?.");
  ok(`D17 the actor sheet reads ${name} for the editor`, actorSheet.includes(`${key}: ${field}`), field);
  const esc = name.replace(/\./g, "\\.");
  ok(`D18 and its template switches ${name} on rich.${key}`,
    new RegExp(`\\{\\{#if rich\\.${key}\\}\\}\\s*<prose-mirror[^>]*name="${esc}" value="\\{\\{${esc}\\}\\}" toggled[^>]*>\\{\\{\\{rich\\.${key}\\}\\}\\}<\\/prose-mirror>\\s*\\{\\{else\\}\\}\\s*<textarea[^>]*name="${esc}"`).test(actorTpl));
}
for (const [file, re, label] of [
  ["module/uses-workflow.mjs", /\[cardDescription\(item\.system\.description \|\| "Used\."\)\]/, "a feat's use with no tracked uses"],
  ["module/uses-workflow.mjs", /\.\.\.\(item\.system\.description \? \[cardDescription\(item\.system\.description\)\] : \[\]\)\n\s*\]\);\n\s*\}/, "an unlimited feat's use"],
  ["module/magic-items-workflow.mjs", /cardDescription\(system\.description \|\| "No activation details/, "a magic item's activation"],
  ["module/consumable-use-workflow.mjs", /cardDescription\(item\.system\?\.description \|\| "No effect is recorded on this item yet/, "a consumable read out"],
  ["module/consumable-use-workflow.mjs", /cardDescription\(item\.system\?\.description \|\| "No effect is recorded on this item\."\)/, "a text-only consumable"],
  ["module/oil-workflow.mjs", /cardDescription\(item\.system\?\.description \?\? "", \{ escape: esc \}\)/, "an oil's vapours"]
]) ok(`D19 ${label} prints the item's words through cardDescription`, re.test(read(file)));
ok("D20 no card prints a description through line() any more",
  !/line\((esc\()?(item\.)?system\??\.description/.test(["module/uses-workflow.mjs", "module/magic-items-workflow.mjs", "module/consumable-use-workflow.mjs", "module/oil-workflow.mjs"].map(read).join("\n")));
const narration = read("module/magic/spell-narration.mjs");
ok("D21 the spell card's narration reads the same blocks", /from "\.\.\/description-html\.mjs"/.test(narration) && /for \(const inner of htmlBlocks\(html\)\)/.test(narration));

/* C. The release -------------------------------------------------------- */
const sys = JSON.parse(read("system.json"));
ok("C1 the system is 3.719.0 or later (now 3.719.1)", sys.version === "3.719.1", sys.version);

if (failures.length) {
  process.stderr.write(`verify-fixes-3719-0: FAILED ${failures.length} of ${checks}\n  ${failures.join("\n  ")}\n`);
  process.exit(1);
}
process.stdout.write(`verify-fixes-3719-0: OK — ${checks} checks.\n`);
