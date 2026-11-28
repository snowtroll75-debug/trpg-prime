/**
 * AN ITEM'S DESCRIPTION MAY BE PLAIN TEXT OR HTML (3.719.0).
 *
 * Every description in the core packs is plain text, written in a
 * textarea and read back as paragraphs split on newlines. The companion
 * modules ship theirs as HTML: all of Eldritch Arts and Inner Tempest,
 * paragraph by paragraph, with bold labels, tables and lists. Graham,
 * 28 November 2026, after the module spell sweep found three spell cards
 * printing escaped markup: "the HTML error is also present on feats and
 * other items, can you please fix them all."
 *
 * It showed in two ways:
 *
 *   - THE ITEM SHEET. The description is a plain textarea, so a module
 *     feat opened to `<p><strong>SPELLWARDEN</strong></p><p><strong>
 *     Prerequisites</strong> Level 10…` — the source, not the text.
 *   - THE CARDS. A card that prints an item's own words (a feat's use, a
 *     consumable read out, a magic item activated, an oil's vapours)
 *     either escaped it (the oil) or wrapped a block of `<p>`s inside a
 *     `<p>`, which the browser breaks apart and the card's spacing with it.
 *
 * ONE QUESTION, ONE PLACE. Whether a description is HTML is decided here
 * and nowhere else, and so is turning one into text: the spell card's
 * narration (spell-narration.mjs) reads the same paragraphs.
 *
 * Plain text is left exactly as it was everywhere — no core description
 * changes how it is shown.
 */

/** A real tag: `<p>`, `</strong>`, `<br/>`, `<td class="x">`. Not "a < b". */
const HTML_TAG = /<\/?[a-z][a-z0-9]*\b[^>]*>/i;

/** Is this description markup rather than plain text? */
export function isHtmlDescription(text) {
  return HTML_TAG.test(String(text ?? ""));
}

const BLOCK_END = /<\/p>|<br\s*\/?>|<\/li>|<\/h[1-6]>|<\/div>|<\/tr>|<\/blockquote>/i;
// Leading block tags, opening or closing: a list or table that ended at the
// start of the next block leaves its `</ul>` or `</table>` there.
const BLOCK_OPEN = /^\s*(<\/?(p|li|h[1-6]|div|ul|ol|table|tbody|thead|tr|blockquote)\b[^>]*>\s*)+/i;
const ENTITIES = { "&lt;": "<", "&gt;": ">", "&quot;": "\"", "&#39;": "'", "&apos;": "'", "&nbsp;": " ", "&amp;": "&" };

/**
 * The blocks an HTML description is made of, each as its inner HTML with
 * the opening block tags removed. Empty blocks are dropped.
 *
 * @param {string} html
 * @returns {string[]}
 */
export function htmlBlocks(html) {
  return String(html ?? "").split(new RegExp(BLOCK_END.source, "gi"))
    .map((chunk) => chunk.replace(BLOCK_OPEN, "").trim())
    .filter(Boolean);
}

/**
 * One block as plain text: tags removed (a table cell's end becomes a
 * space, so cells do not run together), the common entities decoded,
 * whitespace collapsed.
 *
 * @param {string} inner
 * @returns {string}
 */
export function blockText(inner) {
  return String(inner ?? "")
    .replace(/<\/(td|th)>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&(lt|gt|quot|#39|apos|nbsp|amp);/g, (m) => ENTITIES[m])
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A description as plain text, one paragraph per line. Plain text comes
 * back unchanged.
 *
 * @param {string} text
 * @returns {string}
 */
export function descriptionPlainText(text) {
  const raw = String(text ?? "");
  if (!isHtmlDescription(raw)) return raw;
  return htmlBlocks(raw).map(blockText).filter(Boolean).join("\n");
}

/**
 * An item's own words as a card line.
 *
 * HTML is kept as HTML — its bold labels and tables are the book's — but
 * in a `<div>`, never inside the card's `<p>`, where a block of paragraphs
 * is invalid and the browser splits it apart. Plain text is wrapped as
 * every card line is; `escape` is for the callers that escaped it before
 * (the oil card), so their plain text is shown exactly as it was.
 *
 * @param {string} text
 * @param {object} [options]
 * @param {(s: string) => string} [options.escape] the caller's own escaper
 * @returns {string} HTML for the card
 */
export function cardDescription(text, { escape = null } = {}) {
  const raw = String(text ?? "");
  if (isHtmlDescription(raw)) return `<div class="trg-card-description" style="margin:2px 0">${raw}</div>`;
  return `<p style="margin:2px 0">${escape ? escape(raw) : raw}</p>`;
}

/**
 * The HTML fields of a document, enriched for a sheet's rich-text editor.
 *
 * Answers `{ key: enrichedHTML }` for each named field that holds HTML and
 * nothing for one that holds plain text, so a template asks `{{#if
 * rich.key}}` and keeps its textarea otherwise. Used by the item sheet's
 * description and the actor sheet's notes, biography and GM fields (the
 * Pillars of Faith haunts' biography and secret notes, the vehicles'
 * notes, are HTML).
 *
 * @param {Document} doc the item or actor, for the enricher's links
 * @param {Record<string, string>} fields key → the field's value
 * @param {object} [options]
 * @param {boolean} [options.secrets] show secret blocks
 * @returns {Promise<Record<string, string>>}
 */
export async function richTextFields(doc, fields, { secrets = false } = {}) {
  const out = {};
  const enricher = globalThis.foundry?.applications?.ux?.TextEditor?.implementation;
  for (const [key, value] of Object.entries(fields ?? {})) {
    const raw = String(value ?? "");
    if (!isHtmlDescription(raw)) continue;
    out[key] = enricher ? await enricher.enrichHTML(raw, { secrets, relativeTo: doc, rollData: {} }) : raw;
  }
  return out;
}
