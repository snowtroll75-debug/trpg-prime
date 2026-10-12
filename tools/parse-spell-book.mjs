import fs from "node:fs";

/*
 * FIELDS ARE BOUNDED BY THEIR PARAGRAPH, which the first version of this
 * got wrong: it let a field run "to the next known label", and since the
 * description follows the last stat line with no label at all, every
 * entry's final field swallowed a sentence of prose. Glitterdust came
 * back with save="Reflex A cloud of glittering particles erupts…".
 *
 * So: split the entry into <p> elements, keep only those that OPEN with a
 * known field label, and match within each.
 */

const F = process.argv[2];
const html = fs.readFileSync(F, "utf8");

const strip = (s) => s
  .replace(/<[^>]*>/g, " ")
  .replace(/&#39;|&rsquo;|&#8217;/g, "'").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ")
  .replace(/&ldquo;|&rdquo;/g, '"').replace(/&hellip;/g, "…")
  // &emsp; and friends are SPACES, not text. Left undecoded, "DRAINING
  // BURST &emsp;" keyed as a different spell from the pack's "Draining
  // Burst" and reported as missing from the pack.
  .replace(/&emsp;|&ensp;|&thinsp;|&#8195;|&#8194;/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const LABELS = ["Tradition", "Cast", "Range", "Area", "Targets", "Target", "Duration", "Saving Throw", "Base Damage"];
const LABEL_RE = LABELS.join("|");

/*
 * `<h3` WITH ANY ATTRIBUTES, not `<h3>` exactly.
 *
 * Core 3.7 (29 Aug 2026) added anchor ids to every spell heading —
 * `<h3 id="s10-glitterdust">` — and this regex, which had matched the
 * bare tag, found ONE entry in the whole book. It did not fail: it
 * reported "parsed 1 entries" and then listed 691 spells as NOT FOUND,
 * which reads exactly like a book that lost its contents. A pattern
 * tied to a tag's exact spelling is tied to the export settings of
 * whoever produced the file.
 */
const HEAD = /<h3\b[^>]*>((?:(?!<\/h3>)[\s\S])*?)<\/h3>/g;
const heads = [];
let m;
while ((m = HEAD.exec(html)) !== null) {
  const text = strip(m[1]);
  // MOST HEADINGS END IN THE PP COST. Nexus Of Elemental Energy does not:
  // its trait line is inside the SAME <h3> as the name and cost
  // ("NEXUS OF ELEMENTAL ENERGY PP 10 INVOCATION SAVE") where every other
  // entry puts traits in a following <h3>. Requiring the line to END in
  // digits skipped it, and its whole entry was absorbed into the previous
  // spell's description. Anything after the cost is taken as trailing
  // traits rather than being a reason to reject the heading.
  const pp = text.match(/^(.*?)\s*PP\s*([\d\s]+?)\s*([A-Z][A-Z\s]*)?$/);
  if (!pp) continue;
  const name = pp[1].replace(/\s+/g, " ").trim();
  if (!name || name.length > 60) continue;
  // THE CHAPTER EXPLAINS ITS OWN FORMAT using a worked template — two
  // headings, "SPELL NAME" and "SPELL", whose "tradition" field reads
  // "This entry lists the applicable tradition for the spell". They are
  // documentation, not spells, and the looser heading match above picks
  // them up. Named here rather than filtered by a heuristic, because a
  // heuristic that excluded them would eventually exclude a real spell.
  if (["SPELL", "SPELL NAME"].includes(name.toUpperCase())) continue;
  heads.push({ name, pp: Number(String(pp[2]).replace(/\s+/g, "")), at: m.index, end: HEAD.lastIndex });
}

const out = [];
for (let i = 0; i < heads.length; i += 1) {
  const from = heads[i].end;
  const to = i + 1 < heads.length ? heads[i + 1].at : Math.min(html.length, from + 8000);
  const raw = html.slice(from, to);

  const fields = {};
  for (const pm of raw.matchAll(/<p>([\s\S]*?)<\/p>/g)) {
    const text = strip(pm[1]);
    if (!new RegExp(`^(${LABEL_RE})\\b`, "i").test(text)) continue;   // a stat line, not prose
    // Several fields can share one paragraph: "Range 120 feet; Area 10-foot radius".
    // CASE-SENSITIVE, and any separator. The book uses "; " almost always,
    // but Colour Spray writes "Range 30 feet Area 15-foot cone" with a bare
    // space and Freedom uses a colon. Case is what keeps prose out: the
    // labels are capitalised, "cast this spell" and "in range" are not.
    const parts = [...text.matchAll(new RegExp(`\\b(${LABEL_RE})\\b\\s*[:;]?\\s*`, "g"))];
    for (let j = 0; j < parts.length; j += 1) {
      const label = parts[j][1].toLowerCase();
      const start = parts[j].index + parts[j][0].length;
      const stop = j + 1 < parts.length ? parts[j + 1].index : text.length;
      const value = text.slice(start, stop).replace(/^[\s;:]+|[\s;:.]+$/g, "").trim();
      if (value && !fields[label]) fields[label] = value;
    }
  }

  const traitLine = strip(raw.match(/^\s*<h3\b[^>]*>[\s\S]*?<\/h3>/)?.[0] ?? "");
  out.push({
    name: heads[i].name,
    pp: heads[i].pp,
    traits: traitLine,
    tradition: fields.tradition ?? "",
    cast: fields.cast ?? "",
    range: fields.range ?? "",
    area: fields.area ?? "",
    targets: fields.targets ?? fields.target ?? "",
    duration: fields.duration ?? "",
    save: fields["saving throw"] ?? "",
    baseDamage: fields["base damage"] ?? "",
    // WHAT THE PROSE SAYS ABOUT A BASIC SAVE (3.442.0).
    //
    // Graham ruled on 29 August 2026 that Surge Of The Tempest is a basic
    // save because its BODY says so, even though its header does not —
    // and the word decides whether damage scales by degree at all. That
    // ruling is about a SHAPE, and a shape needs a field the harness can
    // read, or it is three names somebody happened to find.
    //
    // Recorded from the entry's own bounded text, which is what makes it
    // trustworthy: the first sweep for this used a fixed-width window,
    // read into neighbouring entries, and reported 91 spells where the
    // real answer was three.
    proseBasicSave: (strip(raw).match(/\bbasic\s+(reflex|fortitude|will)\b/i)?.[1] ?? "").toLowerCase()
  });
}

const seen = new Map();
for (const s of out) {
  const k = s.name.toUpperCase().replace(/[^A-Z]/g, "");
  if (!seen.has(k)) seen.set(k, s);
}
const spells = [...seen.values()];
fs.writeFileSync("/tmp/book-spells.json", JSON.stringify(spells, null, 1));

process.stdout.write(`parsed ${out.length} entries, ${spells.length} distinct\n\n`);
for (const n of ["GLITTERDUST", "GLOBE OF CANCELLATION", "ARC OF FIRE", "GUST", "GEAS", "BLINDNESS"]) {
  const s = spells.find((x) => x.name.toUpperCase() === n);
  if (!s) { process.stdout.write(`${n}: NOT FOUND\n\n`); continue; }
  process.stdout.write(`${s.name}  PP ${s.pp}\n`
    + `  tradition="${s.tradition}"  cast="${s.cast}"\n`
    + `  range="${s.range}"  area="${s.area}"  targets="${s.targets}"\n`
    + `  duration="${s.duration}"  save="${s.save}"  baseDamage="${s.baseDamage}"\n\n`);
}
