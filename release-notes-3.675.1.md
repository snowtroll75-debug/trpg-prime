# TRG Prime 3.675.1

29 October 2026. One ruling from Graham: "Specialist skills should always have the recall knowledge action on their dropdown."

- **Install over 3.675.0.** Eldritch Arts 0.1.0 and Inner Tempest 1.0.3 run on it unchanged.
- **No migration prompt.**

## Changed

**Every specialist skill offers Recall Knowledge.**
- **Before:** clicking a specialist skill's roll opened "What are you doing?" with only Identify Power and Disable a Peril. Recalling knowledge through Dwarven Lore, Hunting or any other specialist skill meant a Generic Check with no action attached.
- **Now:** Recall Knowledge is in that dropdown for every specialist skill, Lore or not. The roll uses the specialist skill's own total and is named after it ("Recall Knowledge — Hunting").
- **Not gated.** Recall Knowledge is an untrained action, so no specialist skill is ever refused it.
- **What carries over:** anything keyed to Recall Knowledge applies to the specialist roll as well, such as the +2 to all Recall Knowledge checks, Questionable Source and rarity adjustments. A conditional scoped to a regular skill (Arcana, say) still does not match a specialist roll.
- **The card says so too.** Recall Knowledge's description now names the specialist route alongside the knowledge skills.
- **The book is silent here.** The page lists the knowledge skills that may Recall Knowledge and says nothing either way about specialist skills. This change rests on the ruling, and the source comment records that.

## Harness

- **`verify-chapter4`:** 144 checks. I1 now expects Identify Power, Recall Knowledge and Disable a Peril. New: I1c–I1g (the flag, the unchanged skill list, still untrained, the card, and the sheet's filter driven over Recall Knowledge and Research) and Z1 (3.675.1 or later).
- **`mutate-chapter4`:** 59 mutations, all caught. New: the flag switched off, the card sentence removed, Recall Knowledge made Trained, the version not raised.
- **`verify-ea-block1-core`:** its Z check was an exact pin on 3.675.0 and now reads "3.675.0 or later". Its mutation (lowering to 3.674.2) is still caught.
- **Re-pinned to 3.675.1:** the version anchors of the Block 6–10 core, EA Block 1, fix and release-link mutation files, and the download link in `system.json`.
- **Full sweep on the staged 3.675.1:** 655 harnesses. 653 passed. The other two were `verify-mutation-anchors` and its mutation pair: the new I1e mutation was anchored on `export const TRAINED_ACTION_KEYS`, and anchors may not lead with `export`. It now anchors on the Set's own General Skill Actions line. Both pass, and `mutate-chapter4` still catches all 59.
- **Packs:** unchanged. The 43 packs match 3.675.0 in content, and the release ships the 3.675.0 pack files byte for byte, so there was nothing to recompile.
- **A first sweep was cut off** at 30 minutes by the session's background limit, part-way through `mutate-light-sources`. The harness snapshot put back the one file that run had mutated. A full-tree diff against 3.675.0 then showed only this release's own edits.

## Live check, before packaging

World TRG V14, still running 3.675.0. The flag was applied in memory only, then reverted.
- Garran's **Hunting** row offered Generic Check, Identify Power, **Recall Knowledge**, Disable a Peril.
- Choosing it opened the Recall Knowledge check dialog. The card read "Recall Knowledge — Hunting" at +7, Hunting's own total.
- The two test messages were deleted and the action table was restored.
- **Not seen live:** the new card sentence, because the in-memory patch set only the flag. It is covered by I1f.

## Also checked this session: overcasting

Graham reported that overcasting did nothing, then confirmed it was his mistake. Driven live on Brother Ossric (limit 7) with a 9 PP probe:
- The gate appeared.
- The Casting DC rose by +4.
- A Partial failed with no PP lost and no save.
- A success spent 9 PP, rolled the Sacrifice Fortitude save at attack level 9 and applied Soul Drain 22.

The rig was restored. Four gaps were raised with Graham and are **not** changed here:
- the Essence Critical is announced but never rolled;
- the Sacrifice save ignores Spellcraft penalties;
- a specialist spell's overcast DC is measured from caster level + 1 instead of character level;
- a Magic Ritual cast still pays the Sacrifice DC increase.
