// The public soak progress site: reads data/ (written by Tools/Workbench/soak_site.py in the game's repository) and
// shows each group's figures version by version, each version against the one before it, and single runs day by day.

const S = {index: null, progress: null, tab: 'progress', group: null, figure: 'deaths', runFigure: 'patients_in', picked: [], runs: {}, compares: {}, driftOnly: true};
const $ = s => document.querySelector(s);
const h = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v != null && v !== false) e.setAttribute(k, v === true ? '' : v); }
  for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(k)); return e; };
const getJSON = async path => { const r = await fetch(path); if (!r.ok) throw new Error(path + ': ' + r.status); return r.json(); };

// Plain names for the hospital figures (the soak's figure ids).
const FIGURES = {
  arrived: 'Arrivals a day', treated: 'Treated a day', nothing_found: 'Nothing found a day', walked_out: 'Walked out a day',
  referred_on: 'Referred on a day', service_missing: 'Turned away (no service) a day', joined_list: 'Joined the waiting list a day',
  went_elsewhere: 'Went elsewhere a day', left_waiting_list: 'Left the waiting list a day', deaths: 'Deaths a day',
  deaths_untreated: 'Deaths untreated a day', critical_patients: 'Critical patients a day', deaths_within_30_days: 'Deaths within 30 days, a day',
  deaths_at_home: 'Deaths at home a day', returned: 'Came back a day', misdiagnoses_found: 'Misdiagnoses found a day',
  complaints: 'Complaints a day', complainants: 'Complainants a day', time_in_hospital_avg: 'Time in hospital (minutes)',
  wait_total_avg: 'Total wait (minutes)', wait_reception_avg: 'Wait at reception (minutes)', wait_gp_avg: 'Wait for the GP (minutes)',
  wait_test_avg: 'Wait for tests (minutes)', wait_treatment_avg: 'Wait for treatment (minutes)', wait_longest: 'Longest wait (minutes)',
  checkin_avg: 'Check-in time (minutes)', patients_in: 'Patients in the hospital', beds_in_use: 'Beds in use', staff_on_duty: 'Staff on duty',
  satisfaction_avg: 'Satisfaction (0-100)', reputation: 'Reputation (stars)', money_in: 'Money in a day', money_out: 'Money out a day', funds: 'Funds at the end',
};
const HEADLINE = ['arrived', 'treated', 'deaths', 'wait_total_avg', 'satisfaction_avg', 'reputation', 'funds'];
const figName = id => FIGURES[id] || id.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
function fmt(v, kind) {
  if (v == null || isNaN(v)) return '–';
  if (kind === 'share') return (v * 100).toFixed(1) + '%';
  if (kind && kind.startsWith('money')) return (v < 0 ? '-£' : '£') + Math.round(Math.abs(v)).toLocaleString();
  const a = Math.abs(v);
  return a >= 1000 ? Math.round(v).toLocaleString() : a >= 10 ? v.toFixed(1) : v.toFixed(2);
}
const kindOf = id => (S.progress.figures.find(f => f.id === id) || {}).kind || '';
const seedColour = i => `var(--series-${(i % 6) + 1})`;

/* ---------------- one chart for all three views: lines over a numeric or named x axis, with a hover readout ---------------- */
function niceTicks(lo, hi, n) {
  if (lo === hi) hi = lo + 1;
  const span = hi - lo, mag = Math.pow(10, Math.floor(Math.log10(span / n)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => span / s <= n) || 10 * mag;
  const out = [];
  for (let v = Math.floor(lo / step) * step; out.length < 2 || out[out.length - 1] < hi - step * 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}
// lines: [{label, colour, width, points: [[x, y]]}]; opts: {xLabels (names for x = 0, 1, ...), xName (x -> label), yFmt}
function lineChart(box, lines, opts) {
  const W = Math.max(320, box.clientWidth), H = 300, m = {l: 64, r: 16, t: 12, b: 34};
  const pts = lines.flatMap(l => l.points);
  if (!pts.length) { box.textContent = 'No readings for this figure.'; return; }
  const xs = [...new Set(pts.map(p => p[0]))].sort((a, b) => a - b), ys = pts.map(p => p[1]);
  const x0 = xs[0], x1 = xs[xs.length - 1];
  const yt = niceTicks(Math.min(0, ...ys), Math.max(...ys), 4), y0 = yt[0], y1 = yt[yt.length - 1];
  const X = x => m.l + (x1 === x0 ? 0.5 : (x - x0) / (x1 - x0)) * (W - m.l - m.r);
  const Y = v => H - m.b - (y1 === y0 ? 0.5 : (v - y0) / (y1 - y0)) * (H - m.t - m.b);
  const ns = 'http://www.w3.org/2000/svg', el = (t, a) => { const e = document.createElementNS(ns, t); for (const k in a) e.setAttribute(k, a[k]); return e; };
  const svg = el('svg', {width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opts.title || 'Chart'});
  for (const t of yt) { svg.append(el('line', {x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t), class: 'grid'})); const tx = el('text', {x: m.l - 8, y: Y(t) + 4, 'text-anchor': 'end', class: 'tick'}); tx.textContent = opts.yFmt(t); svg.append(tx); }
  // X labels placed by the room they take: the first starts at its point and the last ends at its own (so neither is
  // clipped), and a label in between is drawn only when it clears the one before it and the last, with a gap.
  const GAP = 10, labelWidth = text => text.length * 6.6;  // 11px Nunito digits and points, a little generous
  const span = (x, i) => {
    const text = opts.xName(x), w = labelWidth(text);
    const anchor = xs.length === 1 ? 'middle' : i === 0 ? 'start' : i === xs.length - 1 ? 'end' : 'middle';
    const left = anchor === 'start' ? X(x) : anchor === 'end' ? X(x) - w : X(x) - w / 2;
    return {x, text, anchor, left, right: left + w};
  };
  const last = span(xs[xs.length - 1], xs.length - 1), kept = [];
  xs.slice(0, -1).forEach((x, i) => {
    const s = span(x, i);
    if ((kept.length && s.left < kept[kept.length - 1].right + GAP) || s.right + GAP > last.left) return;
    kept.push(s);
  });
  for (const s of [...kept, last]) { const tx = el('text', {x: X(s.x), y: H - 12, 'text-anchor': s.anchor, class: 'tick'}); tx.textContent = s.text; svg.append(tx); }
  for (const l of lines) {
    if (!l.points.length) continue;
    svg.append(el('path', {d: l.points.map((p, k) => (k ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join(' '), fill: 'none', stroke: l.colour, 'stroke-width': l.width || 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'stroke-dasharray': l.dash || null}));
    if (l.points.length < 25) for (const p of l.points) svg.append(el('circle', {cx: X(p[0]), cy: Y(p[1]), r: l.width > 2 ? 4 : 3, fill: l.colour, stroke: 'var(--panel)', 'stroke-width': 1.5}));
  }
  const cross = el('line', {y1: m.t, y2: H - m.b, class: 'cross', visibility: 'hidden'}); svg.append(cross);
  const tip = h('div', {class: 'tip', hidden: true});
  const hit = el('rect', {x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: 'transparent'}); svg.append(hit);
  hit.addEventListener('mousemove', e => {
    const px = e.clientX - svg.getBoundingClientRect().left;
    const x = xs.reduce((a, b) => Math.abs(X(b) - px) < Math.abs(X(a) - px) ? b : a);
    cross.setAttribute('x1', X(x)); cross.setAttribute('x2', X(x)); cross.setAttribute('visibility', 'visible');
    tip.innerHTML = ''; tip.append(h('b', {}, opts.xName(x)));
    for (const l of lines) { const p = l.points.find(q => q[0] === x); tip.append(h('div', {class: 'tiprow'}, h('span', {class: 'sw', style: `background:${l.colour}`}), h('span', {}, l.label), h('b', {}, p ? opts.yFmt(p[1]) : '–'))); }
    tip.hidden = false; tip.style.left = Math.min(X(x) + 14, W - 190) + 'px'; tip.style.top = m.t + 'px';
  });
  hit.addEventListener('mouseleave', () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); });
  box.innerHTML = ''; box.append(svg, tip);
}
function legend(lines) { return h('div', {class: 'legend'}, lines.map(l => h('span', {class: 'key'}, h('span', {class: 'sw', style: `background:${l.colour}`}), l.label))); }
function figureSelect(value, onPick, ids) {
  const s = h('select', {'aria-label': 'Figure'});
  for (const id of ids) s.append(h('option', {value: id, selected: id === value}, figName(id)));
  s.addEventListener('change', () => onPick(s.value));
  return s;
}
function groupChips() {
  return h('div', {class: 'chips', role: 'group', 'aria-label': 'Hospital'}, S.index.groups.map(g => h('button', {class: 'chip', type: 'button', 'aria-pressed': S.group === g.id ? 'true' : 'false',
    onclick: () => { S.group = g.id; S.picked = []; render(); }}, g.label, ` · ${g.versions.length} versions`)));
}
const grp = () => S.index.groups.find(g => g.id === S.group);

/* ---------------- Progress ---------------- */
function progressView() {
  const g = grp(), prog = S.progress.groups[g.id] || {};
  const ids = Object.keys(FIGURES).filter(id => prog[id]);
  if (!prog[S.figure]) S.figure = ids[0];
  const kind = kindOf(S.figure), vals = prog[S.figure] || {};
  const lines = g.seeds.map((seed, i) => ({label: 'Seed ' + seed, colour: seedColour(i), width: 1.5,
    points: g.versions.map((v, k) => [k, vals[v] && vals[v][seed]]).filter(p => p[1] != null)}));
  const mean = {label: 'Mean of the seeds', colour: 'var(--ink)', width: 3, points: g.versions.map((v, k) => {
    const xs = Object.values(vals[v] || {}); return [k, xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null]; }).filter(p => p[1] != null)};
  const box = h('div', {class: 'chart'});
  requestAnimationFrame(() => lineChart(box, [...lines, mean], {xName: k => g.versions[k], yFmt: v => fmt(v, kind), title: figName(S.figure) + ' by version'}));
  const stepFor = v => S.index.steps.find(s => s.group === g.id && s.to === v);
  const table = h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Version'), HEADLINE.filter(f => prog[f]).map(f => h('th', {class: 'num'}, figName(f))), h('th', {class: 'num'}, 'Seeds'), h('th', {}, 'Against the one before'))),
    h('tbody', {}, [...g.versions].reverse().map(v => { const st = stepFor(v);
      return h('tr', {}, h('td', {}, h('b', {}, v)), HEADLINE.filter(f => prog[f]).map(f => { const xs = Object.values((prog[f] || {})[v] || {}); return h('td', {class: 'num'}, xs.length ? fmt(xs.reduce((a, b) => a + b, 0) / xs.length, kindOf(f)) : '–'); }),
        h('td', {class: 'num'}, (S.index.seedsByVersion[g.id] || {})[v] ? (S.index.seedsByVersion[g.id][v]).length : '–'),
        h('td', {}, st ? h('button', {class: 'chip', type: 'button', onclick: () => { S.openStep = st.id; go('versions'); }},
          `${st.drifted} drifted`, st.problems ? ` · ${st.problems} run problem${st.problems > 1 ? 's' : ''}` : '') : h('span', {class: 'hint'}, v === g.versions[0] ? 'First version' : 'No seed in common with the one before'))); })));
  return [h('div', {class: 'panel'}, groupChips(), h('p', {class: 'muted', style: 'margin:0'}, `${g.seeds.length} seeds, ${g.versions.length} versions. ${g.replay ? 'Admissions are replayed from a recording, so every version sees the same patients. ' : ''}${g.designChanged ? 'The hospital\'s rooms or staff changed between some versions, so part of a change is the design rather than the game.' : ''}`)),
    h('div', {class: 'panel'}, h('div', {class: 'bar'}, h('h2', {}, 'Version by version'), figureSelect(S.figure, f => { S.figure = f; render(); }, ids)), legend([...lines, mean]), box,
      h('p', {class: 'hint', style: 'margin:0'}, 'Each dot is one run of the reference hospital; the thick line is the mean of the seeds. Per-day figures are totals divided by the days run.')),
    h('div', {class: 'panel'}, h('h2', {}, 'At a glance'), h('p', {class: 'hint', style: 'margin:0'}, 'Means of the seeds. "Drifted values" counts the hospital, money and condition values that moved by more than the larger of 15% and a floor for their kind, against the version before, seed by seed.'), h('div', {class: 'tbl'}, table))];
}

/* ---------------- Versions ---------------- */
function versionsView() {
  const g = grp(), steps = S.index.steps.filter(s => s.group === g.id).reverse();
  const out = [h('div', {class: 'panel'}, groupChips(), h('p', {class: 'muted', style: 'margin:0'}, `Each version against the one before it, seed by seed, with soak_compare.py's rules: a value drifted when it moved by more than the larger of ${Math.round(S.index.rules.rel * 100)}% and a floor for its kind, and a condition's value counts only with ${S.index.rules.minStays} stays behind it in both runs.`))];
  if (!steps.length) out.push(h('div', {class: 'panel muted'}, 'Only one version so far.'));
  for (const st of steps) {
    const d = h('details', {class: 'step', open: S.openStep === st.id || null}, h('summary', {}, `${st.from} → ${st.to}`,
      h('span', {class: 'tag ' + (st.problems ? 'bad' : st.drifted ? 'warn' : 'good')}, st.problems ? `${st.problems} run problem${st.problems > 1 ? 's' : ''}` : st.drifted ? `${st.drifted} drifted values` : 'No drift'),
      h('span', {class: 'hint'}, `${st.seeds} seed${st.seeds > 1 ? 's' : ''}`)));
    const body = h('div', {style: 'display:grid;gap:10px'});
    d.append(body);
    const fill = async () => { if (body.childElementCount) return; body.append(h('div', {class: 'bar'}, h('span', {class: 'spin'}), 'Loading…'));
      try { const c = S.compares[st.id] || (S.compares[st.id] = await getJSON(`data/compare/${st.id}.json`)); body.innerHTML = ''; body.append(...stepBody(c)); } catch (e) { body.textContent = 'Could not load: ' + e.message; } };
    d.addEventListener('toggle', () => { if (d.open) { S.openStep = st.id; fill(); } });
    if (d.open) fill();
    out.push(d);
  }
  return out;
}
function stepBody(c) {
  const out = c.pairs.map(p => h('div', {class: 'seed'}, h('div', {class: 'bar'}, h('b', {}, 'Seed ' + p.seed),
    p.error ? h('span', {class: 'tag bad'}, 'Not comparable') : h('span', {class: 'tag ' + (p.bad ? 'bad' : p.drifted ? 'warn' : 'good')}, p.bad ? 'Run problem' : `${p.drifted} of ${p.values} drifted`)),
    p.error ? h('span', {}, p.error) : null, (p.problems || []).length ? h('span', {}, p.problems.join('; ') + '.') : null,
    p.rulesChanged ? h('span', {class: 'hint'}, 'The game\'s data files changed between these versions.') : null,
    (p.settingsChanged || []).length ? h('span', {class: 'hint'}, 'Soak settings changed too: ' + p.settingsChanged.join(', ') + '. Part of the difference is the setup, not the game.') : null,
    (p.notes || []).filter(n => !/Errors rose|did not finish/.test(n)).map(n => h('span', {class: 'hint'}, n))));
  const pairs = c.pairs.filter(p => p.rows);
  if (!pairs.length) return out;
  const merged = new Map();
  pairs.forEach((p, k) => p.rows.forEach(r => { const key = r.section + '|' + r.what; const m = merged.get(key) || {section: r.section, what: r.what, cells: []}; m.cells[k] = r; merged.set(key, m); }));
  const rows = [...merged.values()].filter(m => !S.driftOnly || m.cells.some(x => x && x.drift));
  out.push(h('div', {class: 'bar'}, h('button', {class: 'chip', type: 'button', 'aria-pressed': S.driftOnly ? 'true' : 'false', onclick: () => { S.driftOnly = !S.driftOnly; render(); }}, 'Drifted only')),
    h('div', {class: 'tbl'}, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Section'), h('th', {}, 'Value'), pairs.map(p => h('th', {class: 'num'}, 'Seed ' + p.seed)))),
      h('tbody', {}, rows.slice(0, 500).map(m => h('tr', {}, h('td', {class: 'hint'}, m.section), h('td', {}, m.what),
        pairs.map((_, k) => { const x = m.cells[k]; return x ? h('td', {class: 'num' + (x.drift ? ' drift' : '')}, x.baseText, ' → ', x.newText, h('span', {class: 'chg'}, x.change), x.drift ? h('span', {class: 'dl'}, 'drift') : null) : h('td', {class: 'num hint'}, '–'); })))))),
    rows.length > 500 ? h('p', {class: 'hint'}, `First 500 of ${rows.length}.`) : null, !rows.length ? h('p', {class: 'muted'}, 'Nothing drifted.') : null);
  return out;
}

/* ---------------- Runs ---------------- */
function runsView() {
  const g = grp();
  const order = new Map(g.versions.map((v, i) => [v, i]));  // the export's version order (alpha, beta, release)
  const runs = S.index.runs.filter(r => r.group === g.id).sort((a, b) => (order.get(b.version) ?? -1) - (order.get(a.version) ?? -1) || a.seed - b.seed);
  if (!S.picked.length && runs.length) S.picked = [runs[0].id];
  const out = [h('div', {class: 'panel'}, groupChips(), h('p', {class: 'muted', style: 'margin:0'}, 'Pick up to six runs to see their figures day by day.'),
    h('div', {class: 'runs'}, runs.map(r => { const i = S.picked.indexOf(r.id);
      return h('button', {class: 'chip', type: 'button', 'aria-pressed': i >= 0 ? 'true' : 'false', style: i >= 0 ? `background:${seedColour(i)};color:#fff` : null,
        onclick: async () => { if (i >= 0) S.picked.splice(i, 1); else if (S.picked.length < 6) S.picked.push(r.id); render(); }}, `${r.version} · seed ${r.seed}`); })))];
  const missing = S.picked.filter(id => !S.runs[id]);
  if (missing.length) { Promise.all(missing.map(async id => { S.runs[id] = await getJSON(`data/runs/${id}.json`); })).then(render, e => { $('#view').prepend(h('div', {class: 'panel'}, 'Could not load: ' + e.message)); }); out.push(h('div', {class: 'panel'}, h('div', {class: 'bar'}, h('span', {class: 'spin'}), 'Loading…'))); return out; }
  const picked = S.picked.map(id => S.runs[id]);
  if (!picked.length) return out;
  const ids = Object.keys(picked[0].series).filter(id => picked.some(r => r.series[id]));
  if (!ids.includes(S.runFigure)) S.runFigure = ids.includes('patients_in') ? 'patients_in' : ids[0];
  const kind = (picked[0].totals[S.runFigure] || {}).kind || '';
  const lines = picked.map((r, i) => ({label: `${r.run.version} · seed ${r.run.seed}`, colour: seedColour(i), width: 2,
    points: r.days.map((d, k) => [d, r.series[S.runFigure] ? r.series[S.runFigure].values[k] : null]).filter(p => p[1] != null)}));
  const box = h('div', {class: 'chart'});
  requestAnimationFrame(() => lineChart(box, lines, {xName: d => 'Day ' + d, yFmt: v => fmt(v, kind), title: figName(S.runFigure) + ' by day'}));
  out.push(h('div', {class: 'panel'}, h('div', {class: 'bar'}, h('h2', {}, 'Day by day'), figureSelect(S.runFigure, f => { S.runFigure = f; render(); }, ids)), legend(lines), box),
    h('div', {class: 'cards'}, picked.map((r, i) => h('div', {class: 'card'}, h('div', {class: 'bar'}, h('span', {class: 'sw', style: `background:${seedColour(i)}`}), h('b', {}, `${r.run.version} · seed ${r.run.seed}`), h('span', {class: 'hint'}, r.run.date)),
      h('div', {class: 'hint'}, `${r.run.hospital} hospital: ${r.run.beds} beds, ${r.run.staffTotal} staff; ${r.run.daysRun} days${r.run.intakeMode ? '; ' + r.run.intakeMode : ''}. Commit ${r.run.commit}.`),
      r.run.versionNote ? h('div', {class: 'hint'}, 'Shown as ' + r.run.version + ': ' + r.run.versionNote) : null,
      h('div', {class: 'bar'}, h('span', {class: 'tag ' + (r.run.finished ? 'good' : 'warn')}, r.run.finished ? 'Finished' : 'Unfinished'),
        h('span', {class: 'tag ' + (r.errorCount ? 'bad' : '')}, `${r.errorCount} errors`), h('span', {class: 'tag'}, `${r.stallCount} stalls`), h('span', {class: 'tag'}, `${r.secondsPerDay} s a game day`))))));
  return out;
}

/* ---------------- frame ---------------- */
const TABS = [['progress', 'Progress', progressView], ['versions', 'Version by version', versionsView], ['runs', 'Runs', runsView]];
function render() {
  const tabs = $('#tabs'); tabs.innerHTML = '';
  TABS.forEach(([id, label]) => tabs.append(h('button', {class: 'tab', role: 'tab', type: 'button', 'aria-selected': S.tab === id ? 'true' : 'false', onclick: () => go(id)}, label)));
  const view = $('#view'); view.innerHTML = '';
  if (!S.index.groups.length) { view.append(h('div', {class: 'panel muted'}, 'No soak runs have been published yet.')); return; }
  view.append(...TABS.find(t => t[0] === S.tab)[2]());
}
function go(tab) { S.tab = tab; if (location.hash.slice(1) !== tab) history.replaceState(null, '', '#' + tab); render(); }
function route() { const id = location.hash.slice(1); S.tab = TABS.some(t => t[0] === id) ? id : 'progress'; if (S.index) render(); }
window.addEventListener('hashchange', route);
let resizeT; window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => S.index && render(), 200); });

const SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
function isDark() { const t = document.documentElement.dataset.theme; return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; }
function showTheme() { const b = $('#theme'); b.innerHTML = isDark() ? SUN : MOON; b.title = isDark() ? 'Switch to light' : 'Switch to dark'; }
try { const t = localStorage.getItem('soaks-theme'); if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; } catch (e) {}
$('#theme').addEventListener('click', () => { const t = isDark() ? 'light' : 'dark'; document.documentElement.dataset.theme = t; try { localStorage.setItem('soaks-theme', t); } catch (e) {} showTheme(); });
showTheme();

(async () => {
  try {
    [S.index, S.progress] = await Promise.all([getJSON('data/index.json'), getJSON('data/progress.json')]);
    $('#title').textContent = S.index.title; document.title = S.index.title;
    $('#intro').textContent = S.index.intro;
    $('#meta').append(h('span', {class: 'pill'}, 'Newest version ' + S.index.newest), h('span', {class: 'pill'}, `${S.index.runs.length} runs`), h('span', {class: 'pill'}, 'Updated ' + S.index.exported));
    $('#foot').textContent = 'Built from the game\'s balance soaks by Tools/Workbench/soak_site.py. Figures are simulation results from development builds, not real hospital data.';
    S.group = S.index.groups.length ? S.index.groups[0].id : null;
    route(); render();
  } catch (e) { $('#view').innerHTML = ''; $('#view').append(h('div', {class: 'panel'}, 'Could not load the soak data: ' + e.message)); }
})();
