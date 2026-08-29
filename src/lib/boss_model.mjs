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
    const ex = base.exec, cls = {}, el = {};
    for (const t of team) { const w = byId(t); cls[w.cls] = (cls[w.cls] || 0) + 1; el[w.el] = (el[w.el] || 0) + 1; }
    let mult = 1;
    if ((cls.Arcanist || 0) >= 2 && laws.arc > 0) {
      const m = 1 + (1 - ex) * (critMul(st, L('arc', laws.arc)) - 1);
      mult *= m; why.push(`2\u00d7 Arcanist crit \u2192 \u00d7${m.toFixed(2)}`);
    }
    if ((cls.Vanguard || 0) >= 2 && laws.van > 0) {
      const m = 1 + base.normal * L('van', laws.van);
      mult *= m; why.push(`2\u00d7 Vanguard speed \u2192 \u00d7${m.toFixed(2)}`);
    }
    if ((el.mental || 0) >= 2 && laws.men2 > 0 && boss.kd > 0) {
      const m = 1 + L('men2', laws.men2) * boss.kd;
      mult *= m; why.push(`2\u00d7 Mental KD-dmg \u2192 \u00d7${m.toFixed(2)}`);
    }
    if ((el[cw.el] || 0) === 4) {
      let td = 0, trig = '';
      if (cw.el === 'physical' && laws.phy4 > 0) { td = L('phy4', laws.phy4) * EFF10; trig = 'counter'; }
      if (cw.el === 'magic' && laws.mag4 > 0) { td = L('mag4', laws.mag4) * EFF10; trig = 'extreme'; }
      if (cw.el === 'mental' && laws.men4 > 0) { td = L('men4', laws.men4) * EFF3; trig = 'execution'; }
      if (td > 0) { const m = 1 + td; mult *= m; why.push(`4\u00d7 ${cap(cw.el)} dmg (${trig}) \u2192 \u00d7${m.toFixed(2)}`); }
    }
    // 2x Physical law is OFFENSIVE for dodge-counter carries: +dodge -> more of the carry's OWN counters (self-boost)
    if (cw.dodgeCounter && (el.physical || 0) >= 2 && laws.phy2 > 0) {
      const m = 1 + Math.min(0.15, L('phy2', laws.phy2));   // calibrated to the ~15% Yun-team read (self-dodge only)
      mult *= m; why.push(`2\u00d7 Physical self-dodge \u2192 \u00d7${m.toFixed(2)}`);
    }
    // Yuhong/Alice passive: ally DODGES grant crit (+4%/stack, max 10). Fed by teammates' real dodge rates —
    // dodgePot = (dodgeVal/100)/dodgeCd (validated stats), scaled by exposure. Blockers (dodgeVal 0) feed nothing.
    // Magnitude K is still an estimate pending a clean Alice+carry measurement.
    if (cw.dodgeCounter) {
      const aoe = boss.aoe || 0; let feed = 0;
      for (const t of team) { if (t === carry) continue; const w = byId(t);
        const dodgePot = (w.dodgeVal || 0) / 100 / (w.dodgeCd || 4);
        const exposure = aoe + (1 - aoe) * (w.engage ?? 0.5);
        feed += dodgePot * exposure; }
      const stacks = Math.min(10, 10 * feed);   // K=10 for the real-stat scale; raise once measured
      if (stacks > 0.2) { const m = 1 + (1 - ex) * (critMul(st, stacks * 0.04) - 1);
        mult *= m; why.push(`passive: ally dodges (~${stacks.toFixed(1)} stk crit) \u2192 \u00d7${m.toFixed(2)}`); }
    }
    let cf = 0;
    if (laws.charge && cls.Supporter && cls.Arcanist && cls.Vanguard) cf += 0.20;
    if ((el.magic || 0) >= 2 && laws.mag2 > 0) cf += L('mag2', laws.mag2);
    if (cf > 0 || laws.start120) {
      const rate = 10 * (1 + cf), start = laws.start120 ? 120 : 0, freq = (start + rate * 180) / 1800;
      const m = 1 + base.extreme * (freq - 1);
      if (m > 1.001) { mult *= m; why.push(`charge \u2192 \u00d7${m.toFixed(2)}`); }
    }
    if (team.includes('W005')) { const m = 1 + base.extreme * 0.15; if (m > 1.001) { mult *= m; why.push(`Peseshet +Extreme dmg \u2192 \u00d7${m.toFixed(2)}`); } }
    if (boss.kd > 0) {
      const kd = (1 + 1.0 * st.cd) / (1 + st.cr * st.cd), blend = (1 - boss.kd) + boss.kd * kd, m = 1 + (1 - ex) * (blend - 1);
      if (m > 1.001) { mult *= m; why.push(`knockdown guaranteed-crit \u2192 \u00d7${m.toFixed(2)}`); }
    }
    return { mult, why };
  }
  const hasHealer = team => team.some(t => byId(t).cls === 'Supporter');

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
              if (iMult > 1.001) iWhy = `interference: ${avail.map(p => p.label).join(' + ')} \u2192 \u00d7${iMult.toFixed(2)}`;
            }
            const stk = teamStacks(team, boss, laws), redux = 1 - 0.06 * stk;
            let sWhy = null;
            if (stk > 0.05) sWhy = `boss dmg-reduction: ~${stk.toFixed(1)} stacks \u2192 \u00d7${redux.toFixed(2)}`;
            const eff = base.total * weak * mult * iMult * redux;
            const allWhy = [...why]; if (iWhy) allWhy.push(iWhy); if (sWhy) allWhy.push(sWhy);
            if (!best || eff > best.eff) best = { eff, team, why: allWhy, weak, stk };
          } } }
      if (best) rows.push({ carry, ...best });
    }
    rows.sort((a, b) => b.eff - a.eff);
    return rows;
  }

  return { defUnit, statsFor, timeline, critMul, combineIntf, intfMult, chargeRate, teamStacks, lawMult, hasHealer, board };
}
