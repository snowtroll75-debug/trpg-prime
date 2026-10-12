/**
 * Does this payload use keys Foundry actually has?
 *
 * WHY THIS EXISTS. On 11 Aug 2026 three consecutive releases each
 * shipped a defect in the same place — not in a rule, but in how this
 * system talks to Foundry. The worst of them:
 *
 *     system: { terrain: { difficulty: 2 } }
 *
 * Foundry's key is `difficulties`, keyed by movement type. The wrong key
 * was NOT an error. The behaviour was created, every difficulty defaulted
 * to 1, and moving through a whirlwind cost exactly normal. It looked
 * right in the code, in the logs, and in 1,300 green checks. The only way
 * to see it was to read the document Foundry had created.
 *
 * That is the shape this guards: a key Foundry silently discards. Foundry
 * validates VALUES and drops unknown KEYS, so the one thing it will never
 * tell you is that you spelled the field wrong.
 *
 * The comparison is pure and takes the allowed paths as data, so the
 * harness can run it in node against a recorded snapshot of Foundry's own
 * schemas (module/foundry-schemas.mjs). The snapshot is checked
 * against the live game by the "Verify Foundry Integration" macro, so a
 * Foundry upgrade that renames a field is caught rather than assumed away.
 */

/** Every dotted path in a payload, leaves and branches alike. */
export function payloadPaths(payload, prefix = "") {
  const out = [];
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return out;
  for (const [key, value] of Object.entries(payload)) {
    const path = prefix ? `${prefix}.${key}` : key;
    out.push(path);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      out.push(...payloadPaths(value, path));
    }
  }
  return out;
}

/**
 * The paths in `payload` that `allowed` does not contain.
 *
 * A `*` segment in an allowed path matches any single segment, which is
 * how Foundry's array-of-schema fields are recorded.
 */
export function unknownPaths(payload, allowed = []) {
  const patterns = allowed.map((p) => new RegExp(`^${p.split(".").map((s) => (s === "*" ? "[^.]+" : s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).join("\\.")}$`));
  return payloadPaths(payload).filter((path) => !patterns.some((re) => re.test(path)));
}

/**
 * Check a payload against a named schema from the snapshot.
 *
 * Returns a list of complaints — empty means every key exists. An UNKNOWN
 * schema name is itself a complaint: silently passing a payload nobody
 * has a schema for would defeat the purpose.
 */
export function schemaProblems(payload, schemaName, snapshot) {
  const allowed = snapshot?.schemas?.[schemaName];
  if (!allowed) return [`no recorded schema for "${schemaName}" — capture it before writing to it`];
  const unknown = unknownPaths(payload, allowed);
  return unknown.map((path) =>
    `"${path}" is not a field of ${schemaName} — Foundry will discard it silently. Known: ${allowed.join(", ") || "(none)"}`);
}
