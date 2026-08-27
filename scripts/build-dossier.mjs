// scripts/build-dossier.mjs
// Generates public/dossier.json for the Observer Terminal (public/immersive.html).
//
// The right-hand page is a professional "dossier": a typed header data-grid
// (DAMAGE TYPE / WEAKNESS / CLASS / RACE), a typed SUMMARY and BACKGROUND, and a
// handwritten NOTES block (observed traits + redactions + a red Directive).
//
// Data sources (src/data/):
//   witches.json        -> name, class, damage/weakness, rarity, title
//   tier_synergy.json   -> role_tags, synergy_note (archetype), interference
//   dossier_lore.json   -> race + background per witch (YOU fill this in;
//                          empty strings render an "awaiting capture" state)
//
// RACE and BACKGROUND are not present anywhere in the game-data exports for
// playable witches (only enemies/bosses carry race). They live in the lore stub
// so they can be captured from in-game screens and dropped in without code changes.
//
// Run from repo root:  node scripts/build-dossier.mjs   (or `npm run dossier`)

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'src', 'data');
const OUT  = join(__dirname, '..', 'public', 'dossier.json');
const read = (f) => JSON.parse(readFileSync(join(DATA, f), 'utf8'));
const readOpt = (f) => (existsSync(join(DATA, f)) ? read(f) : {});

const witches = read('witches.json');
const tierRaw = read('tier_synergy.json');
const tier = Object.fromEntries((tierRaw.witches || tierRaw).map((w) => [w.witch_id, w]));
const lore = readOpt('dossier_lore.json');

// ---- role_tag -> surveillance vocabulary --------------------------------
const TAGS = {
  'tank':            { plate: 'HELD LINE',     note: 'Absorbs fire without breaking formation.',           dir: 'hold position; do not advance past subject.' },
  'taunt':           { plate: 'DRAWS FIRE',    note: 'Pulls hostile attention onto itself, deliberately.', dir: 'let subject take point; it wants the aggro.' },
  'block-counter':   { plate: 'GUARD/RIPOSTE', note: 'Blocks, then answers in the same motion.',           dir: 'do not strike first; it feeds on the return.' },
  'dodge-counter':   { plate: 'EVADE/RIPOSTE', note: 'Evasions convert into stacking retaliation.',         dir: 'do not tail alone; every miss compounds.' },
  'stagger':         { plate: 'STAGGER',       note: 'Reliably breaks enemy stance on contact.',            dir: 'expect the target to be off-balance nearby.' },
  'debuff-shred':    { plate: 'ARMOR SHRED',   note: 'Strips defenses; readings degrade in its presence.',  dir: 'expect degraded readings around subject.' },
  'debuff':          { plate: 'DEBUFF',        note: 'Leaves lingering impairments on contact.',            dir: 'log any anomalous stat drops after contact.' },
  'weakness-exploit':{ plate: 'WEAK-POINT',    note: 'Seeks and works the target\u2019s weak point.',       dir: 'shield exposed flanks; it finds them.' },
  'downer':          { plate: 'SUPPRESS',      note: 'Suppresses enemy output over time.',                  dir: 'assume reduced hostile pressure near subject.' },
  'extreme-battery': { plate: 'CHARGE SPIKE',  note: 'Cycles its Extreme far faster than baseline.',        dir: 'watch for sudden charge spikes.' },
  'battery':         { plate: 'CHARGE FEED',   note: 'Feeds charge to the wider cell.',                     dir: 'track energy flow to adjacent units.' },
  'buffer':          { plate: 'UPLIFT',        note: 'Elevates allied output around it.',                   dir: 'nearby readings will run hot; discount them.' },
  'healer':          { plate: 'MEND',          note: 'Restores allied condition mid-engagement.',           dir: 'damage may not stick; account for recovery.' },
  'sustain':         { plate: 'SUSTAIN',       note: 'Keeps the cell standing past attrition.',             dir: 'do not count subject out on attrition alone.' },
  'crit':            { plate: 'CRIT WINDOW',   note: 'Opens sharp critical windows on cue.',                dir: 'flag the moments it lands clean.' },
  'burst':           { plate: 'BURST',         note: 'Delivers damage in concentrated windows.',            dir: 'clear the area during its burst.' },
  'salvo:normal':    { plate: 'SALVO',         note: 'Damage rides its normal-attack salvo.',               dir: 'count the rhythm of its basic strikes.' },
  'summon':          { plate: 'SUMMON',        note: 'Fields additional entities in the frame.',            dir: 'confirm the count; there may be more than one.' },
  'zoner':           { plate: 'ZONE CTRL',     note: 'Controls space; denies clean approach.',              dir: 'do not approach head-on.' },
};
const prettyTag = (t) => t.replace(/[:_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 12).toUpperCase();
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function plateCaptions(roleTags) {
  const plates = [];
  for (const t of roleTags) {
    const label = TAGS[t]?.plate || prettyTag(t);
    if (!plates.includes(label)) plates.push(label);
    if (plates.length === 4) break;
  }
  const pad = ['NO IMAGE', 'PARTIAL'];
  let pi = 0;
  while (plates.length < 3) plates.push(pad[pi++] || 'PARTIAL');
  plates[3] = 'SURVEIL.';
  return plates.slice(0, 4);
}
function directive(roleTags) {
  const order = ['dodge-counter','taunt','block-counter','weakness-exploit','debuff-shred','zoner','burst','extreme-battery','tank','stagger'];
  for (const t of order) if (roleTags.includes(t) && TAGS[t]?.dir) return TAGS[t].dir;
  for (const t of roleTags) if (TAGS[t]?.dir) return TAGS[t].dir;
  return 'maintain distance; report anomalies.';
}

// analyst summary: archetype (same split the detail page uses) + one rephrased line
function archetype(note) {
  return (note && note.includes(':')) ? note.split(':')[0].trim() : null;
}
function surveil(note) {
  if (!note) return '';
  let s = note.replace(/\s+/g, ' ').trim();
  const body = note.includes(':') ? s.split(':').slice(1).join(':').trim() : s;
  let out = body
    .replace(/\b(her|his|its|their)\s+Passive\b/gi, 'its resting state')
    .replace(/\bPassive\b/g, 'its resting state')
    .replace(/\b(her|his|its|their)\s+Class\b/gi, 'its core habit')
    .replace(/\bClass\b/g, 'its core habit')
    .replace(/\b(her|his|its|their)\s+Extreme\b/gi, 'its heaviest move')
    .replace(/\bExtreme\b/g, 'its heaviest move')
    .replace(/\bBonus Damage\b/gi, 'compounding harm')
    .replace(/\bdamage-reduction\b/gi, 'hardening')
    .replace(/\bstacking\b/gi, 'accreting');
  // Keep the first clause only (sentence or semicolon), cap length for a tidy
  // typed summary, and normalise capitalisation.
  let first = out.split(/(?<=[.!?])\s|;\s/)[0] || out;
  first = first.trim().replace(/[;,]+$/, '');
  if (first.length > 150) first = first.slice(0, 147).replace(/\s+\S*$/, '') + '\u2026';
  first = first.charAt(0).toUpperCase() + first.slice(1);
  if (!/[.!?\u2026]$/.test(first)) first += '.';
  return first;
}

function notesBlock(roleTags, t) {
  const lines = [];
  const noted = roleTags.map((x) => TAGS[x]?.note).filter(Boolean);
  if (noted[0]) lines.push(noted[0]);
  lines.push('Repeat sightings logged: <span class="redact">xxxxx</span>.');
  if (noted[1]) lines.push(noted[1]);
  if (t?.interference?.name) lines.push(`Reported to lift others when seconded \u2014 "${t.interference.name}."`);
  lines.push('Calibration attempts: <span class="redact">xxxxxxxxx</span>.');
  return lines;
}

const dossier = {};
for (const base of witches) {
  const t = tier[base.witch_id];
  const roleTags = (t?.role_tags || []);
  const deals = t?.deals || base.damage_type;
  const weak  = t?.weak  || base.weakness_type;
  const arch  = archetype(t?.synergy_note);
  const summaryTail = surveil(t?.synergy_note);
  const l = lore[base.witch_id] || {};

  dossier[base.witch_id] = {
    id: base.witch_id,
    name: base.name,
    title: base.title || '',
    rarity: base.rarity,
    header: {
      damage: cap(deals),
      weakness: cap(weak),
      class: base.class,
      race: cap((l.race || '').trim()),   // display-cased; '' -> UI shows an awaiting-capture dash
    },
    // typed analyst summary, agrees with the detail page's archetype/verdict
    summary: [
      arch ? `${arch} \u2014 ${base.rarity} ${base.class}, ${cap(deals)} damage.` : `${base.rarity} ${base.class}, ${cap(deals)} damage.`,
      summaryTail,
    ].filter(Boolean).join(' '),
    background: (l.background || '').trim(),  // '' -> UI shows awaiting-capture state
    plates: plateCaptions(roleTags),
    notes: notesBlock(roleTags, t),
    directive: directive(roleTags),
  };
}

const loreFilled = Object.values(dossier).filter((d) => d.background).length;
const payload = {
  _meta: {
    generated: new Date().toISOString(),
    source: 'src/data/{witches,tier_synergy,dossier_lore}.json',
    count: Object.keys(dossier).length,
    lore_backgrounds_filled: `${loreFilled}/${Object.keys(dossier).length}`,
    note: 'Auto-generated for the Observer Terminal. Fill race/background in src/data/dossier_lore.json; do not hand-edit this file.',
  },
  witches: dossier,
};
writeFileSync(OUT, JSON.stringify(payload, null, 2));
console.log(`dossier.json: ${payload._meta.count} witches, backgrounds ${payload._meta.lore_backgrounds_filled} -> ${OUT}`);
