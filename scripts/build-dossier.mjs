// scripts/build-dossier.mjs
// Generates public/dossier.json for the Observer Terminal (public/immersive.html).
// Reads src/data/*.json and writes one noir "field report" per witch:
//   - class / damage / weakness woven in as observed traits
//   - synergy_note rephrased as surveillance prose
//   - 4 plate captions driven by real role_tags
//   - a Directive line derived from the witch's role
// Static + self-contained: immersive.html fetches the emitted JSON at runtime.
//
// Run from the repo root:  node scripts/build-dossier.mjs
// (Also runs automatically via `npm run build` — see package.json.)

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'src', 'data');
const OUT  = join(__dirname, '..', 'public', 'dossier.json');

const read = (f) => JSON.parse(readFileSync(join(DATA, f), 'utf8'));

const witches = read('witches.json');
const tierRaw = read('tier_synergy.json');
const tier = Object.fromEntries((tierRaw.witches || tierRaw).map((w) => [w.witch_id, w]));

// ---- role_tag → surveillance vocabulary ---------------------------------
// plate: short caption for a footage plate (kept tight for the small label)
// note:  a line of field-report prose
// dir:   candidate Directive line (first matching tag by priority wins)
const TAGS = {
  'tank':            { plate: 'HELD LINE',   note: 'Absorbs fire without breaking formation.',           dir: 'hold position; do not advance past subject.' },
  'taunt':           { plate: 'DRAWS FIRE',  note: 'Pulls hostile attention onto itself, deliberately.', dir: 'let subject take point; it wants the aggro.' },
  'block-counter':   { plate: 'GUARD/RIPOSTE', note: 'Blocks, then answers in the same motion.',         dir: 'do not strike first; it feeds on the return.' },
  'dodge-counter':   { plate: 'EVADE/RIPOSTE', note: 'Evasions convert into stacking retaliation.',       dir: 'do not tail alone; every miss compounds.' },
  'stagger':         { plate: 'STAGGER',     note: 'Reliably breaks enemy stance on contact.',            dir: 'expect the target to be off-balance nearby.' },
  'debuff-shred':    { plate: 'ARMOR SHRED', note: 'Strips defenses; readings degrade in its presence.',  dir: 'expect degraded readings around subject.' },
  'debuff':          { plate: 'DEBUFF',      note: 'Leaves lingering impairments on contact.',            dir: 'log any anomalous stat drops after contact.' },
  'weakness-exploit':{ plate: 'WEAK-POINT',  note: 'Seeks and works the target’s weak point.',            dir: 'shield exposed flanks; it finds them.' },
  'downer':          { plate: 'SUPPRESS',    note: 'Suppresses enemy output over time.',                  dir: 'assume reduced hostile pressure near subject.' },
  'extreme-battery': { plate: 'CHARGE SPIKE', note: 'Cycles its Extreme far faster than baseline.',       dir: 'watch for sudden charge spikes.' },
  'battery':         { plate: 'CHARGE FEED', note: 'Feeds charge to the wider cell.',                     dir: 'track energy flow to adjacent units.' },
  'buffer':          { plate: 'UPLIFT',      note: 'Elevates allied output around it.',                   dir: 'nearby readings will run hot; discount them.' },
  'healer':          { plate: 'MEND',        note: 'Restores allied condition mid-engagement.',           dir: 'damage may not stick; account for recovery.' },
  'sustain':         { plate: 'SUSTAIN',     note: 'Keeps the cell standing past attrition.',             dir: 'do not count subject out on attrition alone.' },
  'crit':            { plate: 'CRIT WINDOW', note: 'Opens sharp critical windows on cue.',                dir: 'flag the moments it lands clean.' },
  'burst':           { plate: 'BURST',       note: 'Delivers damage in concentrated windows.',            dir: 'clear the area during its burst.' },
  'salvo:normal':    { plate: 'SALVO',       note: 'Damage rides its normal-attack salvo.',               dir: 'count the rhythm of its basic strikes.' },
  'summon':          { plate: 'SUMMON',      note: 'Fields additional entities in the frame.',            dir: 'confirm the count; there may be more than one.' },
  'zoner':           { plate: 'ZONE CTRL',   note: 'Controls space; denies clean approach.',              dir: 'do not approach head-on.' },
};

const prettyTag = (t) =>
  t.replace(/[:_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 12).toUpperCase();

function plateCaptions(roleTags) {
  const plates = [];
  for (const t of roleTags) {
    const label = TAGS[t]?.plate || prettyTag(t);
    if (!plates.includes(label)) plates.push(label);
    if (plates.length === 4) break;
  }
  // pad to 4 with generic surveillance labels (last one stays "SURVEIL.")
  const pad = ['NO IMAGE', 'PARTIAL', 'SURVEIL.'];
  let pi = 0;
  while (plates.length < 3) plates.push(pad[pi++] || 'PARTIAL');
  plates[3] = 'SURVEIL.';
  return plates.slice(0, 4);
}

function directive(roleTags) {
  const order = ['dodge-counter', 'taunt', 'block-counter', 'weakness-exploit',
                 'debuff-shred', 'zoner', 'burst', 'extreme-battery', 'tank', 'stagger'];
  for (const t of order) if (roleTags.includes(t) && TAGS[t]?.dir) return TAGS[t].dir;
  for (const t of roleTags) if (TAGS[t]?.dir) return TAGS[t].dir;
  return 'maintain distance; report anomalies.';
}

const RARITY_LINE = {
  UR:  'Clearance: QUEEN-tier. Handle only with authorization.',
  SSR: 'Clearance: high. Assign experienced handlers only.',
  SR:  'Clearance: standard. Rotate handlers per protocol.',
};

// noir-ify the synergy note: strip mechanic jargon into surveillance prose
function surveil(note) {
  if (!note) return 'Field notes incomplete; behavior still under study.';
  let s = note.replace(/\s+/g, ' ').trim();
  // Fold possessive + game-term into a single surveillance phrase so we never
  // emit "her its resting state". Order matters: possessive forms first.
  s = s.replace(/\b(her|his|its|their)\s+Passive\b/gi, 'its resting state')
       .replace(/\bPassive\b/g, 'its resting state')
       .replace(/\b(her|his|its|their)\s+Class\b/gi, 'its core habit')
       .replace(/\bClass\b/g, 'its core habit')
       .replace(/\b(her|his|its|their)\s+Extreme\b/gi, 'its heaviest move')
       .replace(/\bExtreme\b/g, 'its heaviest move')
       .replace(/\bBonus Damage\b/gi, 'compounding harm')
       .replace(/\bdamage-reduction\b/gi, 'hardening')
       .replace(/\bstacking\b/gi, 'accreting');
  // Keep the opening sentence; if it's very short, keep the next one too so the
  // sheet doesn't read as a stub.
  const parts = s.split(/(?<=[.!?])\s/);
  let out = parts[0] || s;
  if (out.length < 24 && parts[1]) out = out + ' ' + parts[1];
  return out;
}

const cls = (c) => (c || 'Unknown').toLowerCase();
const elem = (e) => (e || 'unknown');

function fieldReport(base, t) {
  const roleTags = (t?.role_tags || []).slice();
  const dealt = elem(t?.deals || base.damage_type);
  const weak  = elem(t?.weak  || base.weakness_type);
  const cl    = cls(base.class);

  const lines = [];
  lines.push(`Subject logged 03/--. Catalogued ${cl}; deals ${dealt}, exposed to ${weak}.`);

  // 1–2 observed-trait lines from role tags, with a redaction
  const noted = roleTags.map((t) => TAGS[t]?.note).filter(Boolean);
  if (noted[0]) lines.push(noted[0]);
  lines.push(`Repeat sightings logged: <span class="redact">xxxxx</span>.`);
  if (noted[1]) lines.push(noted[1]);

  // surveillance rephrase of the synergy note
  lines.push(surveil(t?.synergy_note));

  // interference (only fires as a support) — noted as second-hand rumor
  if (t?.interference?.name) {
    lines.push(`Reported to lift others when seconded — "${t.interference.name}."`);
  }

  lines.push(`Calibration attempts: <span class="redact">xxxxxxxxx</span>.`);
  return lines;
}

const dossier = {};
for (const base of witches) {
  const t = tier[base.witch_id];
  const roleTags = (t?.role_tags || []);
  dossier[base.witch_id] = {
    id: base.witch_id,
    name: base.name,
    title: base.title || '',
    cls: base.class,
    rarity: base.rarity,
    deals: t?.deals || base.damage_type,
    weak: t?.weak || base.weakness_type,
    plates: plateCaptions(roleTags),
    notes: fieldReport(base, t),
    directive: directive(roleTags),
    clearance: RARITY_LINE[base.rarity] || '',
  };
}

const payload = {
  _meta: {
    generated: new Date().toISOString(),
    source: 'src/data/{witches,tier_synergy}.json',
    count: Object.keys(dossier).length,
    note: 'Auto-generated field reports for the Observer Terminal. Do not hand-edit.',
  },
  witches: dossier,
};

writeFileSync(OUT, JSON.stringify(payload, null, 2));
console.log(`dossier.json written: ${payload._meta.count} witches -> ${OUT}`);
