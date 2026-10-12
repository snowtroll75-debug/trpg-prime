#!/usr/bin/env node
/**
 * generate-foundry-globals — maintain tools/foundry-globals.json.
 *
 * The list it maintains must be MEASURED against a running Foundry
 * client, never guessed. This script cannot reach one on its own, so it
 * does the half it can do safely: it adds names you have confirmed, and
 * refuses to add anything silently.
 *
 * TO CONFIRM A NAME, paste this into the console of a running world and
 * read the answer:
 *
 *   ["TextEditor", "Dialog"].filter((n) => !(n in globalThis))
 *
 * Anything it returns does NOT exist and must not be added — that is the
 * check doing its job. Then:
 *
 *   node tools/generate-foundry-globals.mjs --add TextEditor Dialog \
 *     --build 363 --generation 14
 *
 * WHY NOT JUST DUMP ALL 1863 GLOBALS. Because most of them are DOM API
 * surface this system will never touch, and a list that large stops
 * being reviewable — nobody reads a 1863-line diff, so a wrong entry
 * would slip in unnoticed. The intersection is small enough that adding
 * to it is a visible, deliberate act. The cost of that choice is written
 * into foundry-globals.json under "_scope"; read it before widening.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const FILE = path.join(SYSTEM_ROOT, "tools", "foundry-globals.json");

function parseArgs(argv) {
  const out = { add: [], build: null, generation: null, systemVersion: null };
  let mode = null;
  for (const arg of argv) {
    if (arg.startsWith("--")) {
      mode = arg.slice(2);
      continue;
    }
    if (mode === "add") out.add.push(arg);
    else if (mode === "build") out.build = Number(arg);
    else if (mode === "generation") out.generation = Number(arg);
    else if (mode === "system-version") out.systemVersion = arg;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (!args.add.length) {
  process.stderr.write(
    "Nothing to add. Confirm the name exists in a live client first — see this file's header.\n" +
      "  node tools/generate-foundry-globals.mjs --add <name> [<name>...]\n"
  );
  process.exit(2);
}

const data = JSON.parse(fs.readFileSync(FILE, "utf8"));
const before = new Set(data.names);
const added = [];
for (const name of args.add) {
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) {
    process.stderr.write(`Refusing to add ${JSON.stringify(name)} — that is not an identifier.\n`);
    process.exit(2);
  }
  if (!before.has(name)) added.push(name);
}

if (!added.length) {
  process.stdout.write("Nothing new — every name given is already listed.\n");
  process.exit(0);
}

data.names = [...before, ...added].sort();
if (args.build !== null) data.foundryBuild = args.build;
if (args.generation !== null) data.foundryGeneration = args.generation;
if (args.generation !== null && args.build !== null) {
  data.foundryVersion = `${args.generation}.${args.build}`;
}
if (args.systemVersion) data.capturedAgainstSystemVersion = args.systemVersion;
data.capturedAt = new Date().toISOString().slice(0, 10);

fs.writeFileSync(FILE, `${JSON.stringify(data, null, 2)}\n`);
process.stdout.write(
  `Added ${added.length} name(s) to tools/foundry-globals.json: ${added.join(", ")}\n` +
    `The list is now ${data.names.length} long. Confirm each one exists in a live client if you have not.\n`
);
