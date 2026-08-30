// src/lib/boss_model.mjs
// Single source of truth for the MAJO boss-damage model.
// Imported at BUILD TIME by tier.astro (Node) and bundled CLIENT-SIDE by solver.astro.
// Pure logic only — no DOM, no file reads. Each caller supplies the witch map + laws.

export const MAX_STATS = {
  Arcanist_SR:  { atk: 2499, cr: 0.3698, cd: 1.8488, ed: 0.0174 },
  Arcanist_SSR: { atk: 3483, cr: 0.3978, cd: 1.9888, ed: 0.0759 },
  Vanguard_SR:  { atk: 2264, cr: 0.20, cd: 2.5968, ed: 0.0143 },
  Vanguard_SSR: { atk: 3118, cr: 0.20, cd: 1.8768, ed: 0.0728 },
  Defender_SR:  { atk: 1170, cr: 0.20, cd: 1.00, ed: 0.0141 },
  Defender_SSR: { atk: 1618, cr: 0.20, cd: 1.00, ed: 0.0141 },
  Defender_UR:  { atk: 1672, cr: 0.20, cd: 1.00, ed: 0.0141 },
  Supporter_SR: { atk: 1637, cr: 0.20, cd: 1.00, ed: 0.0145 },
  Supporter_SSR:{ atk: 2300, cr: 0.20, cd: 1.00, ed: 0.0145 },
};

export const RES = {
  arc: [14, 17, 20], van: [13, 19, 25],
  mag2: [6, 8, 10], phy2: [9, 12, 15], men2: [13, 19, 25], sup2: [16, 23, 30],
  mag4: [4, 5, 6], men4: [20, 25, 30], phy4: [4, 5, 6],
};

export const DEFAULT_LAWS = {
  charge: false, stagger: false, start120: false,
  arc: 0, van: 0, mag2: 0, phy2: 0, men2: 0, sup2: 0, mag4: 0, men4: 0, phy4: 0,
};
export const MAXED_LAWS = {
  charge: true, stagger: true, start120: true,
  arc: 3, van: 3, mag2: 3, phy2: 3, men2: 3, sup2: 3, mag4: 3, men4: 3, phy4: 3,
};

const T = 180, EFF10 = 7, EFF3 = 1.5;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s);

// witches: map id -> engine witch { cls, rar, el, weak, amp, maxrank, skills[], intf, echarge, estacks, selfbuff }
// opts.units: optional map id -> custom {rank, atk, cr, cd, ed, lv} (solver's per-carry overrides)
export function createModel(witches, opts = {}) {
  const units = opts.units || {};
  const byId = id => witches[id];
  const MAXLV = w => (w.rar === 'SR' ? 7 : 10);
  const lvCap = (w, R) => Math.min(MAXLV(w), R + 1);
  const L = (k, lvl) => RES[k][lvl - 1] / 100;

  const defUnit = w => {
    const R = w.maxrank, lv = {};
    for (const s of w.skills) lv[s.slot] = Math.min(s.maxlv, R + 1);
    return { rank: R, ...MAX_STATS[`${w.cls}_${w.rar}`], lv };
  };
  const statsFor = id => units[id] || defUnit(byId(id));

  function timeline(id) {
    const w = byId(id), st = statsFor(id), R = st.rank ?? w.maxrank;
    const kn = st.atk * (1 + st.cr * st.cd) * (1 + st.ed);
    const ke = st.atk * (1 + 1.0 * st.cd) * (1 + st.ed);
    const sb = w.selfbuff;
    const spd = 1 + (sb?.speed || 0) * (sb?.uptime || 0);   // rotation-wide attack speed: shrinks all animations
    let ext = [], rest = [], normal = null;
    for (const s of w.skills) {
      if (!s.score || R < s.req) continue;
      const [A, B] = (s.plus_star && R >= s.plus_star) ? s.plus : s.base;
      const lv = clamp((st.lv && st.lv[s.slot]) || lvCap(w, R), 1, lvCap(w, R));
      const csum = (A + B * (lv - 1)) / 100;
      if (csum <= 0) continue;
      const D = (s.exec ? ke : kn) * csum, n = T / s.cad, anim = s.anim / spd;
      if (s.slot === 'normal') normal = [D, anim];
      else if (s.slot === 'extreme') ext.push([D, anim, n, s.exec]);
      else rest.push([D, anim, n, s.exec]);
    }
    const eo = ext.reduce((a, x) => a + x[2] * x[1], 0);
    let extDmg = 0, execDmg = 0;
    for (const [D, an, n, e] of ext) { extDmg += n * D; if (e) execDmg += n * D; }
    const R1 = Math.max(0, T - eo), rd = rest.reduce((a, x) => a + x[2] * x[1], 0);
    const sc = rd ? Math.min(1, R1 / rd) : 1, restOcc = Math.min(rd, R1);
    let restDmg = 0;
    for (const [D, an, n, e] of rest) { const c = n * sc * D; restDmg += c; if (e) execDmg += c; }
    const left = Math.max(0, T - eo - restOcc);
    const nDmg = normal ? left / normal[1] * normal[0] : 0;   // normal[1] already sped up
    const amp = w.amp || 1;
    const extA = extDmg * amp, nA = nDmg * amp, exA = execDmg * amp;
    const pre = (extDmg + restDmg + nDmg) * amp || 1;
    const shares = { extreme: extA / pre, normal: nA / pre, exec: exA / pre };
    let total = (extDmg + restDmg + nDmg) * amp;
    if (sb && sb.crit && total) { const cm = (1 + (st.cr + sb.crit) * st.cd) / (1 + st.cr * st.cd); total += (pre - exA) * sb.uptime * (cm - 1); }
    return { total, ...shares };
  }
  const critMul = (st, add) => (1 + (st.cr + add) * st.cd) / (1 + st.cr * st.cd);

  const INTF_KEYS = ['cr', 'cd', 'crEx', 'atk', 'spd', 'ex', 'nrm', 'glob', 'mental', 'physweak'];
  function combineIntf(providerIds) {
    const d = Object.fromEntries(INTF_KEYS.map(k => [k, 0]));
    for (const pid of providerIds) { const I = byId(pid).intf || {}; for (const k of INTF_KEYS) d[k] += I[k] || 0; }
    return d;
  }
  function intfMult(carry, st, base, boss, d) {
    const cw = byId(carry); let m = 1;
    if (d.atk)  m *= 1 + d.atk / 100;
    if (d.cr)   m *= 1 + (1 - base.exec) * (critMul(st, d.cr / 100) - 1);
    if (d.crEx) m *= 1 + base.extreme * (critMul(st, d.crEx / 100) - 1);
    if (d.cd) { const cd2 = st.cd + d.cd / 100;
      const nonEx = (1 + st.cr * cd2) / (1 + st.cr * st.cd), exF = (1 + cd2) / (1 + st.cd);
      m *= (1 - base.exec) * nonEx + base.exec * exF; }
    if (d.spd)  m *= 1 + base.normal * (d.spd / 100);
    if (d.ex)   m *= 1 + base.extreme * (d.ex / 100);
    if (d.nrm)  m *= 1 + base.normal * (d.nrm / 100);
    let glob = d.glob;
    if (d.mental && cw.el === 'mental') glob += d.mental;
    if (d.physweak && boss.weak === 'physical' && cw.el === 'physical') glob += d.physweak * 0.6;
    if (glob) m *= 1 + glob / 100;
    return m;
  }

  function chargeRate(laws, cls, el) {
    let cf = 0;
    if (laws.charge && cls.Supporter && cls.Arcanist && cls.Vanguard) cf += 0.20;
    if ((el.magic || 0) >= 2 && laws.mag2 > 0) cf += L('mag2', laws.mag2);
    return 10 * (1 + cf);
  }
  function teamStacks(team, boss, laws) {
    if (!boss.stackCap) return 0;
    const cls = {}, el = {};
    for (const t of team) { const w = byId(t); cls[w.cls] = (cls[w.cls] || 0) + 1; el[w.el] = (el[w.el] || 0) + 1; }
    const rate = chargeRate(laws, cls, el);
    let s = 0;
    for (const t of team) { const w = byId(t); if (w.estacks > 0 && w.echarge > 0) s += w.estacks * 20 * rate / w.echarge; }
    return Math.min(boss.stackCap, s);
  }
  function lawMult(carry, team, boss, base, laws) {
    const cw = byId(carry), st = statsFor(carry), why = [];
    const nm = cw.name || 'the carry';
    const ex = base.exec, cls = {}, el = {};
    const kdFrac = deriveKd(team, boss);   // team-stagger-derived knockdown fraction
    const P = m => (m >= 1 ? '+' : '\u2212') + Math.round(Math.abs(m - 1) * 100) + '%';
    for (const t of team) { const w = byId(t); cls[w.cls] = (cls[w.cls] || 0) + 1; el[w.el] = (el[w.el] || 0) + 1; }
    let mult = 1;
    if ((cls.Arcanist || 0) >= 2 && laws.arc > 0) {
      const m = 1 + (1 - ex) * (critMul(st, L('arc', laws.arc)) - 1);
      mult *= m; why.push(`Two Arcanists share the crit-rate resonance (${P(m)} damage).`);
    }
    if ((cls.Vanguard || 0) >= 2 && laws.van > 0) {
      const m = 1 + base.normal * L('van', laws.van);
      mult *= m; why.push(`Two Vanguards add team attack speed (${P(m)}).`);
    }
    if ((el.mental || 0) >= 2 && laws.men2 > 0 && kdFrac > 0) {
      const m = 1 + L('men2', laws.men2) * kdFrac;
      mult *= m; why.push(`The Mental resonance boosts damage while the boss is knocked down (${P(m)}).`);
    }
    if ((el[cw.el] || 0) === 4) {
      let td = 0, trig = '', held = '';
      if (cw.el === 'physical' && laws.phy4 > 0) { td = L('phy4', laws.phy4) * EFF10; trig = 'counters'; held = '~7 of 10'; }
      if (cw.el === 'magic' && laws.mag4 > 0) { td = L('mag4', laws.mag4) * EFF10; trig = 'Extremes'; held = '~7 of 10'; }
      if (cw.el === 'mental' && laws.men4 > 0) { td = L('men4', laws.men4) * EFF3; trig = 'executions'; held = '~2 of 3'; }
      if (td > 0) { const m = 1 + td; mult *= m;
        why.push(`All four units are ${cap(cw.el)}: modeling the full fight, the 4-${cap(cw.el)} resonance holds ${held} stacks (built on ${trig}), adding ${P(m)} ${cw.el} damage.`); }
    }
    // 2x Physical law is OFFENSIVE for dodge-counter carries: +dodge -> more of the carry's OWN counters (self-boost)
    if (cw.dodgeCounter && (el.physical || 0) >= 2 && laws.phy2 > 0) {
      const m = 1 + L('phy2', laws.phy2) / 3;
      mult *= m; why.push(`The 2-Physical dodge bonus lets ${nm} dodge and counter more often (${P(m)}).`);
    }
    // Yuhong/Alice passive: ally dodges feed crit. Fed by teammates' real dodge rates (blockers feed nothing).
    if (cw.dodgeCounter) {
      const aoe = boss.aoe || 0; let feed = 0;
      for (const t of team) { if (t === carry) continue; const w = byId(t);
        const dodgePot = (w.dodgeVal || 0) / 100 / (w.dodgeCd || 4);
        const exposure = aoe + (1 - aoe) * (w.engage ?? 0.5);
        feed += dodgePot * exposure; }
      const stacks = Math.min(10, 3 * feed);
      if (stacks > 0.2) { const m = 1 + (1 - ex) * (critMul(st, stacks * 0.04) - 1);
        mult *= m; why.push(`Dodging teammates feed ${nm}'s crit passive (~${stacks.toFixed(1)} of 10 stacks, ${P(m)}).`); }
    }
    let cf = 0;
    if (laws.charge && cls.Supporter && cls.Arcanist && cls.Vanguard) cf += 0.20;
    if ((el.magic || 0) >= 2 && laws.mag2 > 0) cf += L('mag2', laws.mag2);
    if (cf > 0 || laws.start120) {
      const rate = 10 * (1 + cf), start = laws.start120 ? 120 : 0, freq = (start + rate * 180) / 1800;
      const m = 1 + base.extreme * (freq - 1);
      if (m > 1.001) { mult *= m; why.push(`Faster Extreme charge lets ${nm} fire her Extreme more often (${P(m)}).`); }
    }
    if (team.includes('W005')) { const m = 1 + base.extreme * 0.15; if (m > 1.001) { mult *= m; why.push(`Peseshet's team Extreme-damage buff adds ${P(m)}.`); } }
    if (kdFrac > 0) {
      const kd = (1 + 1.0 * st.cd) / (1 + st.cr * st.cd), blend = (1 - kdFrac) + kdFrac * kd, m = 1 + (1 - ex) * (blend - 1);
      if (m > 1.001) { mult *= m; why.push(`This team staggers the boss down ~${Math.round(kdFrac * 100)}% of the fight; guaranteed crits in that window add ${P(m)}.`); }
    }
    return { mult, why };
  }
  const hasHealer = team => team.some(t => byId(t).cls === 'Supporter');

  // Team knockdown fraction: derived from the team's stagger output vs the boss's stagger wall.
  // Stagger-heavy comps knock the boss down more; a comp with no staggerers barely dents a resistant boss.
  function deriveKd(team, boss) {
    if (!boss.staggerThreshold) return boss.kd || 0;   // fallback: flat kd (e.g. neutral dummy)
    const cls = {}; for (const t of team) { const w = byId(t); cls[w.cls] = (cls[w.cls] || 0) + 1; }
    const savLaw = ((cls.Supporter || 0) + (cls.Arcanist || 0) + (cls.Vanguard || 0)) >= 2 ? 1.5 : 1;
    let rate = 0; for (const t of team) rate += byId(t).staggerRate || 0;
    rate *= savLaw;
    if (rate <= 0) return 0;
    const dur = boss.kdDur || 8, fill = boss.staggerThreshold / rate;
    const knockdowns = 180 / (fill + dur);
    return Math.min(0.9, knockdowns * dur / 180);
  }

  // Rank each carry in `carriesToRank` by its best legal team drawn from `pool`.
  function board({ boss, laws, carriesToRank, pool }) {
    const bases = new Map(pool.map(id => [id, timeline(id)]));
    const rows = [];
    for (const carry of carriesToRank) {
      const cw = byId(carry), st = statsFor(carry), weak = cw.el === boss.weak ? 1 : 0.75;
      const base = bases.get(carry) || timeline(carry);
      const prov = pool.filter(id => id !== carry && byId(id).cls === cw.cls)
        .map(pid => ({ pid, m: intfMult(carry, st, base, boss, combineIntf([pid])), label: byId(pid).intf?.label || pid }))
        .sort((a, b) => b.m - a.m);
      let best = null;
      for (let i = 0; i < pool.length; i++) { if (pool[i] === carry) continue;
        for (let j = i + 1; j < pool.length; j++) { if (pool[j] === carry) continue;
          for (let k = j + 1; k < pool.length; k++) { if (pool[k] === carry) continue;
            const team = [carry, pool[i], pool[j], pool[k]];
            if (!hasHealer(team)) continue;
            const { mult, why } = lawMult(carry, team, boss, base, laws);
            const avail = prov.filter(p => !team.includes(p.pid)).slice(0, 2);
            let iMult = 1, iWhy = null;
            if (avail.length) {
              iMult = intfMult(carry, st, base, boss, combineIntf(avail.map(p => p.pid)));
              if (iMult > 1.001) iWhy = `The two off-field ${cw.cls} interference units add +${Math.round((iMult - 1) * 100)}% to ${cw.name || 'the carry'}.`;
            }
            const stk = teamStacks(team, boss, laws), redux = 1 - 0.06 * stk;
            let sWhy = null;
            if (stk > 0.05) sWhy = `Firing Extremes raises the boss's stacking damage-reduction to ~${stk.toFixed(1)} of ${boss.stackCap} stacks here (\u2212${Math.round((1 - redux) * 100)}%); a cleaner rotation would keep it lower.`;
            const eff = base.total * weak * mult * iMult * redux;
            const allWhy = [...why]; if (iWhy) allWhy.push(iWhy); if (sWhy) allWhy.push(sWhy);
            if (!best || eff > best.eff) best = { eff, team, why: allWhy, weak, stk, intf: avail.map(p => p.pid) };
          } } }
      if (best) rows.push({ carry, ...best });
    }
    rows.sort((a, b) => b.eff - a.eff);
    return rows;
  }

  return { defUnit, statsFor, timeline, critMul, combineIntf, intfMult, chargeRate, teamStacks, lawMult, hasHealer, board };
}
