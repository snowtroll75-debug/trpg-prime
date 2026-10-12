/**
 * Foundry's OWN shapes, as recorded from a running world.
 *
 * This system writes payloads into Foundry documents. Foundry validates
 * VALUES and silently discards unknown KEYS, so the one mistake it will
 * never report is a field name that does not exist — which is exactly
 * the mistake 3.267.1 shipped (`terrain.difficulty` for `difficulties`).
 * module/schema-guard.mjs compares a payload against these lists.
 *
 * WHY THIS IS A MODULE AND NOT A JSON FILE. It used to be
 * tools/foundry-schema-snapshot.json, which node could read and the
 * running game could not. That put the recorded shapes out of reach of
 * the one thing that can tell whether they are still true — the game
 * itself. Now both read the same export: the harness compares payloads
 * against it, and the "Verify Foundry Integration" macro compares it
 * against live Foundry and says so when they part company.
 *
 * A SNAPSHOT IS A FACT WITH A DATE ON IT. `foundry` records which build
 * it came from, and nothing here should be edited by hand: run the macro
 * and paste what it gives you.
 */

export const FOUNDRY_SCHEMA_SNAPSHOT = Object.freeze({
  foundry: "14.363",
  capturedFrom: "CONFIG.RegionBehavior.dataModels, walked to depth 3",
  capturedBy: "the 'Verify Foundry Integration' macro",
  schemas: Object.freeze({
    "RegionBehavior:adjustDarknessLevel": Object.freeze(["mode", "modifier"]),
    "RegionBehavior:applyActiveEffect": Object.freeze(["effects"]),
    "RegionBehavior:changeLevel": Object.freeze(["movementActions"]),
    "RegionBehavior:defineSurface": Object.freeze([
      "culling", "exposure", "light", "move", "occlusion", "placement", "sight", "sound"
    ]),
    "RegionBehavior:displayScrollingText": Object.freeze([
      "color", "events", "once", "text", "visibility"
    ]),
    "RegionBehavior:executeMacro": Object.freeze(["events", "everyone", "uuid"]),
    "RegionBehavior:executeScript": Object.freeze(["events", "source"]),
    "RegionBehavior:modifyMovementCost": Object.freeze([
      "difficulties", "difficulties.burrow", "difficulties.fly",
      "difficulties.swim", "difficulties.walk"
    ]),
    "RegionBehavior:pauseGame": Object.freeze(["once"]),
    "RegionBehavior:suppressWeather": Object.freeze([]),
    "RegionBehavior:teleportToken": Object.freeze([
      "choice", "destinations", "dialog", "dialog.revealed", "dialog.unrevealed",
      "placement", "revealed", "snap", "transition", "transition.duration", "transition.type"
    ]),
    "RegionBehavior:toggleBehavior": Object.freeze(["disable", "enable", "events"])
  })
});

/** How deep the capture walks. Recorded once so capture and check agree. */
export const SCHEMA_CAPTURE_DEPTH = 3;

/**
 * Every dotted path in one Foundry DataSchema, to a depth.
 *
 * Takes anything shaped like a SchemaField — an object with `.fields` —
 * so a harness can run it on a hand-built shape and the macro can run it
 * on Foundry's real one. That is the whole reason it takes the schema as
 * an argument instead of reaching for CONFIG itself.
 */
export function schemaPathsOf(schemaField, depth = SCHEMA_CAPTURE_DEPTH, prefix = "") {
  const fields = schemaField?.fields;
  if (!fields || typeof fields !== "object" || depth <= 0) return [];
  const out = [];
  for (const [name, field] of Object.entries(fields)) {
    const path = prefix ? `${prefix}.${name}` : name;
    out.push(path);
    out.push(...schemaPathsOf(field, depth - 1, path));
  }
  return out.sort();
}

/**
 * The live schemas, as the snapshot records them.
 *
 * @param {object} dataModels CONFIG.RegionBehavior.dataModels, or a stand-in.
 * @param {string} prefix The document name the types belong to.
 */
export function captureSchemas(dataModels = {}, prefix = "RegionBehavior") {
  const out = {};
  for (const [type, model] of Object.entries(dataModels ?? {})) {
    out[`${prefix}:${type}`] = schemaPathsOf(model?.schema ?? model?.defineSchema?.() ?? null);
  }
  return out;
}

/**
 * Is this schema a MODULE's rather than Foundry's?
 *
 * Foundry namespaces a subtype registered by a module as
 * `module-id.typeName`; core's own types are bare. Found on the live
 * suite's first real run, which failed on
 * `RegionBehavior:monks-active-tiles.triggerTile` — a type belonging to
 * Monk's Active Tile Triggers, in Graham's world, and no business of
 * this system's at all.
 *
 * It matters in two directions, and getting either wrong makes the suite
 * useless:
 *
 *   - a module type must not FAIL the drift check. Which modules are
 *     installed varies per world and per week, so a check that fails on
 *     them fails always, and a check that always fails is a check nobody
 *     reads.
 *   - a module type must not be RECORDED into the snapshot. The snapshot
 *     ships in the system, to every world; baking one world's modules
 *     into it would have this system's guard silently approving payloads
 *     against schemas most installs do not have.
 */
export function isModuleProvided(schemaName) {
  return String(schemaName).split(":").slice(1).join(":").includes(".");
}

/** Only the schemas Foundry itself defines. */
export function coreSchemasOnly(captured = {}) {
  return Object.fromEntries(Object.entries(captured).filter(([name]) => !isModuleProvided(name)));
}

/** Only the ones a module added, for reporting rather than recording. */
export function moduleSchemaNames(captured = {}) {
  return Object.keys(captured).filter(isModuleProvided).sort();
}

/**
 * How a capture differs from what was recorded.
 *
 * Deliberately asymmetric, because the two directions mean opposite
 * things:
 *
 *   GONE — a schema or field this system was told about no longer
 *          exists. Anything written to it is now discarded silently.
 *          This is the failure the node harness structurally cannot see.
 *   NEW  — Foundry grew a field. Nothing breaks; the snapshot is merely
 *          behind, and should be re-recorded so a future payload can use
 *          it without being wrongly refused.
 *
 * Pure, and takes both sides as arguments, so every case below is
 * testable without a running game.
 */
export function snapshotDrift(captured = {}, recorded = FOUNDRY_SCHEMA_SNAPSHOT.schemas) {
  const gone = [];
  const grew = [];
  for (const [name, paths] of Object.entries(recorded ?? {})) {
    const live = captured?.[name];
    if (!live) { gone.push({ schema: name, fields: null }); continue; }
    const missing = [...paths].filter((p) => !live.includes(p));
    if (missing.length) gone.push({ schema: name, fields: missing });
  }
  for (const [name, paths] of Object.entries(captured ?? {})) {
    const known = recorded?.[name];
    if (!known) { grew.push({ schema: name, fields: null }); continue; }
    const extra = [...paths].filter((p) => !known.includes(p));
    if (extra.length) grew.push({ schema: name, fields: extra });
  }
  return { gone, grew };
}

/**
 * The drift, in sentences — and only the ones worth reading.
 *
 * `gone` entries are failures: something the system writes to has moved.
 * `grew` entries are notes. Returning them separately rather than as one
 * list is what lets the macro fail on the first and merely mention the
 * second.
 */
export function driftProblems(drift) {
  return (drift?.gone ?? []).map(({ schema, fields }) => (fields === null
    ? `${schema} no longer exists in Foundry — anything written to it is discarded`
    : `${schema} no longer has ${fields.join(", ")} — writing ${fields.length === 1 ? "it is" : "them is"} now a silent no-op`));
}

export function driftNotes(drift) {
  return (drift?.grew ?? []).map(({ schema, fields }) => (fields === null
    ? `${schema} is new in this Foundry and is not recorded`
    : `${schema} has gained ${fields.join(", ")}`));
}
