/**
 * AN AURA SWITCHED ON FOR A WHILE (3.658.0; Fiends & Fables 3.0 block 25 R6 —
 * Graham, 17 October 2026: "Go with your recommendation").
 *
 * The Soul Shade's Soul Eclipse: "10 minutes … blot out the sun … for 1 hour.
 * All creatures in the darkness … at the beginning of their turn must make a
 * Fortitude save". Every other Codex aura is always on; this one is on only
 * after its ability is used, and for the time it prints.
 *
 * Declared on the ability:
 *
 *   flags.trg-prime.creatureAbility.auraSwitch = { state: "soul-eclipse", seconds: 3600 }
 *
 * and on its aura, `emitterState: "soul-eclipse"` — the gate Mucus Cloud's
 * "submerged" already uses (creature-auras.mjs). The Use button lays an
 * effect on the creature carrying `{ state, until }`; the aura is live while
 * one is on it and its time has not run out. Pure.
 */

const SYSTEM_ID = "trg-prime";
export const AURA_SWITCH_FLAG = "auraSwitch";

/** An ability's switch, or null. */
export function auraSwitchOf(item) {
  const raw = item?.flags?.[SYSTEM_ID]?.creatureAbility?.auraSwitch;
  if (!raw || typeof raw !== "object") return null;
  const state = String(raw.state ?? "").trim().toLowerCase();
  const seconds = Math.max(0, Math.trunc(Number(raw.seconds) || 0));
  if (!state || !seconds) return null;
  return { state, seconds };
}

/** The flag the switch's effect carries, from the world time it is used. */
export function auraSwitchRecord(sw, now) {
  return { state: sw.state, until: Math.trunc(Number(now) || 0) + sw.seconds };
}

/** The states an emitter's effects switch on at this moment. */
export function auraSwitchStates(effects, now) {
  const t = Number(now) || 0;
  const out = [];
  for (const e of effects ?? []) {
    if (!e || e.disabled) continue;
    const rec = typeof e.getFlag === "function" ? e.getFlag(SYSTEM_ID, AURA_SWITCH_FLAG) : e.flags?.[SYSTEM_ID]?.[AURA_SWITCH_FLAG];
    if (!rec?.state || !(Number(rec.until) > t)) continue;
    if (!out.includes(rec.state)) out.push(String(rec.state));
  }
  return out;
}

/** "for 1 hour", "for 10 minutes", "for 30 seconds". */
export function auraSwitchSpan(seconds) {
  const s = Math.max(0, Math.trunc(Number(seconds) || 0));
  const unit = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  if (s && s % 3600 === 0) return unit(s / 3600, "hour");
  if (s && s % 60 === 0) return unit(s / 60, "minute");
  return unit(s, "second");
}
