#!/usr/bin/env node
/** mutate-conviction-now — the mutation half of verify-conviction-now. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const CN = m("dice", "conviction-now-workflow.mjs"), CK = m("dice", "check.mjs"), BOOT = path.join(SYSTEM_ROOT, "scripts", "trg-prime.mjs");
const MUTATIONS = [
  { name: "THE COMPLAINT: the card prints the DB", file: CN, from: "    + `<p style=\"margin:2px 0\">Rolled <strong>${esc(diceTotal)}</strong> on the dice: total <strong>${esc(total)}</strong>.</p>`", to: "    + `<p style=\"margin:2px 0\">Rolled <strong>${esc(diceTotal)}</strong> on the dice: total <strong>${esc(total)}</strong> against DB 14, which hits.</p>`", breaks: "A2" },
  { name: "the card hides the total", file: CN, from: "on the dice: total <strong>${esc(total)}</strong>.</p>`", to: "on the dice.</p>`", breaks: "A1" },
  { name: "the card has no No", file: CN, from: "    + `<button type=\"button\" data-action=\"convictionNowPass\" class=\"small-button\">No</button>`\n", to: "", breaks: "A3" },
  { name: "names are not escaped", file: CN, from: "<span class=\"check-actor\">${esc(actorName)}</span><h3>${esc(label)}</h3></div></header>`\n    + `<p style=\"margin:2px 0\">Rolled", to: "<span class=\"check-actor\">${actorName}</span><h3>${esc(label)}</h3></div></header>`\n    + `<p style=\"margin:2px 0\">Rolled", breaks: "A4" },
  { name: "the decided card forgets the die", file: CN, from: "    ? `Conviction spent: +1d6 rolled <strong>${esc(die)}</strong> — total <strong>${esc(total)}</strong> → <strong>${esc(newTotal)}</strong>.`", to: "    ? `Conviction spent.`", breaks: "A5" },
  { name: "anyone may answer", file: CN, from: "  return Boolean(isGM || isOwner);", to: "  return true;", breaks: "A7" },
  { name: "THE OLD WAY: a dialog that does not wait for the card", file: CK, from: "  const { spend, message } = await askConvictionOnCard(check, state);", to: "  const spend = await foundry.applications.api.DialogV2.confirm({ content: \"\" }); const message = null;", breaks: "B1" },
  { name: "the bonus is never offered", file: CK, from: "    if (check.actor && !check.flat) await offerConvictionBonusNow(check);\n", to: "", breaks: "B2" },
  { name: "a spent point is not checked again", file: CK, from: "  if (!getConvictionState(check.actor).ok) {\n    await settleConvictionCard(message, { ...card, spent: false });\n    return;\n  }\n", to: "", breaks: "B3" },
  { name: "THE DIE DOES NOT CHANGE THE RESULT", file: CK, from: "  check.applyExtraModifier({ label: \"Conviction (+1d6)\", value: roll.total, type: \"untyped\" });\n  check.convictionBonusSpent = true;", to: "  check.convictionBonusSpent = true;", breaks: "B3" },
  { name: "a No leaves the card waiting", file: CK, from: "  if (!spend) { await settleConvictionCard(message, { ...card, spent: false }); return; }", to: "  if (!spend) return;", breaks: "B4" },
  { name: "the roll does not wait", file: CN, from: "  const spend = Boolean(await answer);", to: "  const spend = false;", breaks: "B5" },
  { name: "a private roll asks in public", file: CN, from: "  applyMessageMode(data, check.rollMode);\n", to: "", breaks: "B6" },
  { name: "a press on another screen is lost", file: CN, from: "  game.socket?.emit(SOCKET, { action: ANSWER, requestId: flag.requestId, userId: flag.askerId, spend });", to: "", breaks: "C1" },
  { name: "every screen hears every answer", file: CN, from: "    if (data?.action !== ANSWER || data.userId !== game.user?.id) return;", to: "    if (data?.action !== ANSWER) return;", breaks: "C2" },
  { name: "a decided card binds its buttons again", file: CN, from: "    if (!flag || flag.decided) return;\n    const actor = flag.actorUuid ? await fromUuid(flag.actorUuid) : null;\n    const allowed", to: "    if (!flag) return;\n    const actor = flag.actorUuid ? await fromUuid(flag.actorUuid) : null;\n    const allowed", breaks: "C3" },
  { name: "the buttons are shown to everyone", file: CN, from: "      if (!allowed) { button.style.display = \"none\"; continue; }\n", to: "", breaks: "C3" },
  { name: "the listener is never registered", file: BOOT, from: "  registerConvictionNow();\n", to: "", breaks: "C5" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-conviction-now.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-conviction-now: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
  for (const mu of MUTATIONS) {
    const original = fs.readFileSync(mu.file, "utf8");
    const n = original.split(mu.from).length - 1;
    if (n !== 1) { results.push({ name: mu.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR AMBIGUOUS (${n})` }); continue; }
    fs.writeFileSync(mu.file, original.replace(mu.from, mu.to));
    const survived = run();
    fs.writeFileSync(mu.file, original);
    results.push({ name: mu.name, state: survived ? "SURVIVED" : "caught", breaks: mu.breaks });
  }
} finally { guard.restore(); guard.release(); }
const bad = results.filter((r) => r.state !== "caught");
for (const r of results) { process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`); if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`); }
process.stdout.write(bad.length ? `\nmutate-conviction-now: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-conviction-now: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
