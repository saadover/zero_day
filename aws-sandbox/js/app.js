/* AWS Architecture Sandbox — user interface. */
(function () {
  'use strict';
  const S = window.AWSSIM;
  const SV = S.SERVICES;
  const NODE = S.NODE;
  const $ = (sel, el) => (el || document).querySelector(sel);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const STORE_KEY = 'aws-sandbox-v1';
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const state = {
    graph: { nodes: [], edges: [] },
    level: 'beginner',
    mode: 'question',
    scenarioRef: null,
    scenario: null,
    sel: null,
    result: null,
    resultStale: false,
    view: { x: 40, y: 30, k: 1 },
    tab: 'question',
    connectFrom: null,
    showedSample: false,
  };
  const undoStack = [], redoStack = [];

  // ---------- persistence ----------
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ graph: state.graph, level: state.level, mode: state.mode, scenarioRef: state.scenarioRef, view: state.view }));
    } catch (e) { /* storage unavailable */ }
  }
  let saveTimer = null;
  function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(save, 300); }
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return false;
      const d = JSON.parse(raw);
      if (d.graph && Array.isArray(d.graph.nodes)) state.graph = sanitizeGraph(d.graph);
      if (S.LEVELS.includes(d.level)) state.level = d.level;
      if (d.mode === 'free' || d.mode === 'question') state.mode = d.mode;
      if (d.scenarioRef) state.scenarioRef = d.scenarioRef;
      if (d.view && isFinite(d.view.k)) state.view = d.view;
      return true;
    } catch (e) { return false; }
  }
  function sanitizeGraph(g) {
    const nodes = (g.nodes || []).filter((n) => n && SV[n.svc]).map((n) => ({
      id: String(n.id), svc: n.svc, x: +n.x || 0, y: +n.y || 0,
      w: n.w ? +n.w : undefined, h: n.h ? +n.h : undefined,
      props: Object.assign(S.defaultProps(n.svc), n.props || {}),
    }));
    const ids = new Set(nodes.map((n) => n.id));
    const edges = (g.edges || []).filter((e) => e && ids.has(e.from) && ids.has(e.to)).map((e) => ({ id: String(e.id), from: String(e.from), to: String(e.to) }));
    return { nodes, edges };
  }

  // ---------- ids / history ----------
  let seq = 0;
  const uid = (p) => p + Date.now().toString(36) + (seq++).toString(36);
  function snapshot() {
    undoStack.push(JSON.stringify(state.graph));
    if (undoStack.length > 80) undoStack.shift();
    redoStack.length = 0;
  }
  function restore(json) { state.graph = JSON.parse(json); state.sel = null; changed(); }
  function undo() { if (!undoStack.length) return; redoStack.push(JSON.stringify(state.graph)); restore(undoStack.pop()); }
  function redo() { if (!redoStack.length) return; undoStack.push(JSON.stringify(state.graph)); restore(redoStack.pop()); }

  function changed() {
    if (state.result) state.resultStale = true;
    state.result && (state.result.liveEdges = null);
    render();
    saveSoon();
  }

  // ---------- scenario ----------
  function loadScenario(ref) {
    try {
      state.scenario = S.generateScenario(ref.level, ref.seed, ref.id);
      state.scenarioRef = { level: ref.level, seed: state.scenario.seed, id: state.scenario.id };
    } catch (e) { state.scenario = null; }
  }
  function newQuestion() {
    state.mode = 'question';
    loadScenario({ level: state.level, seed: null, id: null });
    state.result = null; state.showedSample = false;
    state.tab = 'question';
    renderPanel(); renderChrome(); saveSoon();
  }

  // ---------- icons ----------
  function iconHTML(svcId) {
    const sv = SV[svcId];
    const ref = sv.icon;
    const cls = ref[0] === 'r' ? 'res' : ref[0] === 'g' ? 'grp' : '';
    return '<span class="ico ' + cls + '" aria-hidden="true">' + (S.ICONS[ref] || '') + '</span>';
  }

  // ---------- palette ----------
  const OPEN_CATS = ['clients', 'groups', 'networking', 'compute', 'storage', 'database', 'integration'];
  function renderPalette(filter) {
    const list = $('#palList');
    const f = (filter || '').trim().toLowerCase();
    let html = '';
    Object.keys(S.CATS).forEach((cat) => {
      const items = S.SERVICE_LIST.filter((s) => s.cat === cat && (!f || (s.name + ' ' + s.short + ' ' + s.id + ' ' + s.desc + ' ' + s.tags.join(' ')).toLowerCase().includes(f)));
      if (!items.length) return;
      const open = f || OPEN_CATS.includes(cat);
      html += '<details class="pal-cat"' + (open ? ' open' : '') + '><summary><span class="dot" style="background:' + S.CATS[cat].color + '"></span>' + esc(S.CATS[cat].name) + '<span class="count">' + items.length + '</span></summary><div class="pal-grid">';
      items.forEach((s) => {
        html += '<button type="button" class="pal-item" data-svc="' + s.id + '">' + iconHTML(s.id) + '<span>' + esc(s.short) + '</span></button>';
      });
      html += '</div></details>';
    });
    list.innerHTML = html || '<p class="note" style="padding:12px">No service matches “' + esc(filter) + '”.</p>';
  }

  // ---------- view transform ----------
  const viewport = $('#viewport'), world = $('#world');
  function applyView() {
    const v = state.view;
    world.style.transform = 'translate(' + v.x + 'px,' + v.y + 'px) scale(' + v.k + ')';
    const g = 22 * v.k;
    viewport.style.backgroundSize = g + 'px ' + g + 'px';
    viewport.style.backgroundPosition = v.x + 'px ' + v.y + 'px';
    $('#zoomLabel').textContent = Math.round(v.k * 100) + '%';
  }
  function toWorld(clientX, clientY) {
    const r = viewport.getBoundingClientRect();
    return { x: (clientX - r.left - state.view.x) / state.view.k, y: (clientY - r.top - state.view.y) / state.view.k };
  }
  function zoomAt(factor, cx, cy) {
    const r = viewport.getBoundingClientRect();
    if (cx === undefined) { cx = r.left + r.width / 2; cy = r.top + r.height / 2; }
    const v = state.view;
    const k = Math.min(2, Math.max(0.25, v.k * factor));
    const px = cx - r.left, py = cy - r.top;
    v.x = px - (px - v.x) * (k / v.k);
    v.y = py - (py - v.y) * (k / v.k);
    v.k = k;
    applyView(); saveSoon();
  }
  function fitView() {
    const ns = state.graph.nodes;
    if (!ns.length) { state.view = { x: 40, y: 30, k: 1 }; applyView(); return; }
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    ns.forEach((n) => {
      const g = SV[n.svc].group;
      const w = g ? n.w : NODE.w, h = g ? n.h : NODE.h;
      x1 = Math.min(x1, n.x - (n.svc === 'igw' ? 0 : 0)); y1 = Math.min(y1, n.y); x2 = Math.max(x2, n.x + w); y2 = Math.max(y2, n.y + h);
    });
    const r = viewport.getBoundingClientRect();
    const pad = 50;
    const k = Math.min(1.2, Math.max(0.25, Math.min((r.width - pad * 2) / (x2 - x1 || 1), (r.height - pad * 2 - 40) / (y2 - y1 || 1))));
    state.view = { k, x: (r.width - (x2 - x1) * k) / 2 - x1 * k, y: (r.height - (y2 - y1) * k) / 2 - y1 * k + 10 };
    applyView(); saveSoon();
  }

  // ---------- rendering ----------
  function nodeSub(n) {
    const sv = SV[n.svc], p = n.props || {};
    const bits = [];
    if (n.svc === 'aurora') bits.push((p.azs || 1) === 1 ? 'writer only' : 'writer + ' + ((p.azs || 1) - 1) + ' replica' + ((p.azs || 1) > 2 ? 's' : ''));
    else if (sv.ha === 'azs') bits.push((p.azs || 1) + ' AZ');
    if (n.svc === 's3' && p.access !== 'private') bits.push(p.access === 'website' ? 'website' : 'presigned');
    if (n.svc === 'lambda' && p.functionUrl) bits.push('func URL');
    if (p.crossRegion) bits.push('global DB');
    if (p.globalTables) bits.push('global table');
    if (n.svc === 'ecs' && p.launch === 'ec2') bits.push('EC2 hosts');
    const pl = state.placement && state.placement[n.id];
    const reg = pl ? pl.region : p.region;
    if (reg && reg !== 'primary' && reg !== 'global') bits.push(S.REGIONS[reg].split(' ')[0]);
    return bits.join(' · ');
  }
  function issueFlags() {
    const err = new Set(), warn = new Set();
    if (state.result && !state.resultStale) {
      state.result.issues.forEach((i) => i.nodeIds.forEach((id) => (i.level === 'error' ? err : warn).add(id)));
    }
    return { err, warn };
  }

  function render() {
    state.placement = S.computePlacement(state.graph.nodes);
    const flags = issueFlags();
    // groups (largest first so smaller ones sit on top)
    const groups = state.graph.nodes.filter((n) => SV[n.svc].group).sort((a, b) => b.w * b.h - a.w * a.h);
    let gh = '';
    groups.forEach((n) => {
      const sv = SV[n.svc];
      const sel = state.sel && state.sel.type === 'node' && state.sel.id === n.id;
      const label = n.props.label || sv.name;
      const reg = n.svc === 'vpc' ? '<em>' + esc(S.REGIONS[n.props.region || 'primary'].split(' ')[0]) + '</em>' : '';
      gh += '<div class="group ' + n.svc + (sel ? ' selected' : '') + (flags.err.has(n.id) ? ' err' : '') + '" data-id="' + n.id + '" style="left:' + n.x + 'px;top:' + n.y + 'px;width:' + n.w + 'px;height:' + n.h + 'px">' +
        '<div class="group-head" data-drag="group">' + iconHTML(n.svc) + '<span>' + esc(label) + '</span>' + reg + '</div>' +
        '<div class="resize" data-drag="resize" title="Resize"></div></div>';
    });
    $('#groupLayer').innerHTML = gh;
    // nodes
    let nh = '';
    state.graph.nodes.filter((n) => !SV[n.svc].group).forEach((n) => {
      const sv = SV[n.svc];
      const sel = state.sel && state.sel.type === 'node' && state.sel.id === n.id;
      const cls = ['node', sel ? 'selected' : '', flags.err.has(n.id) ? 'err' : flags.warn.has(n.id) ? 'warnflag' : '', state.connectFrom && state.connectFrom !== n.id ? 'connect-target' : ''].join(' ');
      nh += '<div class="' + cls + '" data-id="' + n.id + '" style="left:' + n.x + 'px;top:' + n.y + 'px" title="' + esc(sv.name) + '">' +
        iconHTML(n.svc) + '<div class="name">' + esc(n.props.label || sv.short) + '</div><div class="sub">' + esc(nodeSub(n)) + '</div>' +
        '<div class="port" data-drag="port" title="Drag to connect"></div></div>';
    });
    $('#nodeLayer').innerHTML = nh;
    renderEdges();
    $('#canvasEmpty').hidden = state.graph.nodes.length > 0;
    renderPanel();
    renderChrome();
  }

  function nodeById(id) { return state.graph.nodes.find((n) => n.id === id); }
  function iconCenter(n) { return { x: n.x + NODE.w / 2, y: n.y + NODE.icon / 2 }; }
  function clipToBox(c, t, half) {
    const dx = t.x - c.x, dy = t.y - c.y;
    if (!dx && !dy) return { x: c.x, y: c.y };
    const s = Math.min(dx ? half / Math.abs(dx) : Infinity, dy ? half / Math.abs(dy) : Infinity);
    return { x: c.x + dx * s, y: c.y + dy * s };
  }
  function edgeGeom(e) {
    const a = nodeById(e.from), b = nodeById(e.to);
    if (!a || !b) return null;
    const ca = iconCenter(a), cb = iconCenter(b);
    const p1 = clipToBox(ca, cb, NODE.icon / 2 + 6), p2 = clipToBox(cb, ca, NODE.icon / 2 + 8);
    return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
  }
  function edgeStatus(e) {
    if (!state.result || state.resultStale) return '';
    if (state.animating && !state.animDone.has(e.id)) return '';
    const r = state.result.edgeRes[e.id];
    if (!r) return '';
    return r.ok ? (r.netWarn ? 'netwarn' : 'ok') : 'bad';
  }
  function renderEdges() {
    let h = '';
    state.graph.edges.forEach((e) => {
      const g = edgeGeom(e);
      if (!g) return;
      const st = edgeStatus(e);
      const sel = state.sel && state.sel.type === 'edge' && state.sel.id === e.id;
      const marker = sel ? 'sel' : st === 'ok' ? 'ok' : st === 'bad' ? 'bad' : st === 'netwarn' ? 'warn' : 'default';
      const d = 'M' + g.x1.toFixed(1) + ' ' + g.y1.toFixed(1) + 'L' + g.x2.toFixed(1) + ' ' + g.y2.toFixed(1);
      h += '<g class="edge ' + st + (sel ? ' sel' : '') + '" data-edge="' + e.id + '"><path class="hit" d="' + d + '"/><path class="line" d="' + d + '" marker-end="url(#arrow-' + marker + ')"/>';
      if (st === 'bad') {
        const mx = (g.x1 + g.x2) / 2, my = (g.y1 + g.y2) / 2;
        h += '<g class="badge" data-edge="' + e.id + '"><circle cx="' + mx + '" cy="' + my + '" r="10"/><text x="' + mx + '" y="' + my + '">!</text></g>';
      }
      h += '</g>';
    });
    if (state.tempLine) {
      const t = state.tempLine;
      h += '<path class="temp" d="M' + t.x1 + ' ' + t.y1 + 'L' + t.x2 + ' ' + t.y2 + '"/>';
    }
    $('#edgeLayer').innerHTML = h;
  }

  function renderChrome() {
    $('#levels').innerHTML = S.LEVELS.map((l) => '<button type="button" data-level="' + l + '" aria-pressed="' + (state.level === l) + '">' + S.LEVEL_NAMES[l] + '</button>').join('');
    const strict = state.level === 'associate' || state.level === 'professional';
    $('#modeChip').innerHTML = (state.mode === 'free' ? '<b>Free build</b>' : '<b>Question</b>') + ' · networking checks: <b>' + (state.level === 'beginner' ? 'off (default VPC)' : strict ? 'strict' : 'relaxed') + '</b>';
    $('#btnUndo').disabled = !undoStack.length;
    $('#btnRedo').disabled = !redoStack.length;
    const tabs = { question: '#tab-question', inspect: '#tab-inspect', results: '#tab-results' };
    Object.keys(tabs).forEach((k) => $(tabs[k]).setAttribute('aria-selected', String(state.tab === k)));
    const r = state.result;
    $('#tab-results').innerHTML = 'Results' + (r ? (r.passed ? ' <span class="pill ok">✓</span>' : ' <span class="pill bad">' + (r.errors + r.requirements.filter((x) => !x.ok).length) + '</span>') : '');
    $('#connectBanner').hidden = !state.connectFrom;
    if (state.connectFrom) {
      const n = nodeById(state.connectFrom);
      $('#connectText').textContent = 'Tap the service that ' + (n ? (n.props.label || SV[n.svc].short) : '') + ' should send to';
    }
  }

  // ---------- side panel ----------
  function renderPanel() {
    const p = $('#panel');
    if (state.tab === 'question') p.innerHTML = questionHTML();
    else if (state.tab === 'inspect') p.innerHTML = inspectHTML();
    else p.innerHTML = resultsHTML();
  }

  function questionHTML() {
    if (state.mode === 'free' || !state.scenario) {
      return '<p class="eyebrow">Free build</p><h2>Design anything</h2>' +
        '<p>No question is set. Build any architecture and press <b>Play</b>: every arrow, subnet and setting is checked, and you get suggestions for simpler or cheaper options.</p>' +
        '<p class="note">The difficulty buttons at the top also set how strict the networking checks are. Beginner skips them (everything runs in the default VPC), Intermediate only warns about missing VPCs, NAT gateways and endpoints, and Associate and Professional treat them as failures.</p>' +
        '<div class="row"><button class="btn primary" type="button" data-act="new">Give me a ' + esc(S.LEVEL_NAMES[state.level]) + ' question</button></div>' + howtoHTML();
    }
    const sc = state.scenario;
    const res = state.result && !state.resultStale ? state.result.requirements : null;
    let h = '<span class="lvl-chip">' + esc(S.LEVEL_NAMES[sc.level]) + '</span><h2>' + esc(sc.title) + '</h2><div class="story">' + sc.story.map((t) => '<p>' + esc(t) + '</p>').join('') + '</div>';
    h += '<h3>Your design must</h3><ul class="reqs">';
    sc.reqs.forEach((q, i) => {
      const st = res ? (res[i].ok ? 'ok' : 'no') : '';
      h += '<li class="' + st + '"><span class="mark">' + (st === 'ok' ? '✓' : st === 'no' ? '✗' : i + 1) + '</span><span>' + esc(q.text) +
        ((st === 'no' || (sc.level === 'beginner' && st !== 'ok')) && q.hint ? '<span class="hint">Hint: ' + esc(q.hint) + '</span>' : '') + '</span></li>';
    });
    h += '</ul>';
    if (!res) h += '<p class="note" style="margin-top:10px">' + (sc.level === 'beginner' ? 'Drag the services from the left, connect them with arrows, then press <b>Play</b>. At Beginner you don\'t need VPC boxes: servers and databases go in AWS\'s default network automatically.' : 'Build it on the canvas, then press <b>Play</b> to test it. Hints appear for anything that fails.') + '</p>';
    h += '<div class="row">' +
      '<button class="btn" type="button" data-act="sample" id="sampleBtn">Show a sample answer</button>' +
      '<button class="btn" type="button" data-act="new">Another question</button>' +
      '<button class="btn ghost" type="button" data-act="free">Free build</button></div>';
    if (state.showedSample) h += '<p class="note" style="margin-top:10px">This is one answer that passes. Other designs can pass too: press Play on your own version to check it.</p>';
    return h + howtoHTML();
  }
  function howtoHTML() {
    return '<h3>How it works</h3><ol class="howto">' +
      '<li>Drag services from the left panel onto the canvas.</li>' +
      (state.level === 'beginner' ? '<li>At Beginner you can skip networking: servers and databases run in AWS\'s default network. From Intermediate up, drag a <b>VPC</b> box with <b>public / private subnets</b> and drop them inside.</li>' :
      '<li>For servers, containers, databases and load balancers, first drag a <b>VPC</b> box and <b>public / private subnet</b> boxes, then drop the services inside the right subnet.</li>') +
      '<li>Drag from a service\'s blue dot to another service. The arrow means “sends requests or data to”.</li>' +
      '<li>Click a service to change its settings (Availability Zones, Multi-AZ, bucket access…).</li>' +
      '<li>Press <b>Play</b>. Traffic flows through your design; red arrows show what would fail, with the reason.</li></ol>' +
      '<div class="legend"><span><i class="n"></i>not tested yet</span><span><i></i>works</span><span><i class="w"></i>works only with NAT / endpoint</span><span><i class="b"></i>would fail</span></div>';
  }

  function inspectHTML() {
    const sel = state.sel;
    if (!sel) return '<p class="eyebrow">Inspector</p><h2>Nothing selected</h2><p>Click a service, a box or an arrow on the canvas to see what it does and change its settings.</p>' + howtoHTML();
    if (sel.type === 'edge') {
      const e = state.graph.edges.find((x) => x.id === sel.id);
      if (!e) return '';
      const a = nodeById(e.from), b = nodeById(e.to);
      const r = state.result && !state.resultStale ? state.result.edgeRes[e.id] : null;
      let h = '<p class="eyebrow">Connection</p><h2>' + esc(a.props.label || SV[a.svc].short) + ' → ' + esc(b.props.label || SV[b.svc].short) + '</h2>' +
        '<p class="note">' + esc(SV[a.svc].name) + ' sends requests, data or events to ' + esc(SV[b.svc].name) + '.</p>';
      if (r) {
        h += r.ok ? '<div class="edge-why ok"><b>Works.</b>' + (r.netWarn ? ' But see the Results tab: the private subnet needs a NAT gateway or endpoint for this.' : '') + '</div>'
          : '<div class="edge-why bad"><b>Fails.</b> ' + esc(r.reason) + (r.fix ? '<br><br><b>Fix:</b> ' + esc(r.fix) : '') + '</div>';
      } else h += '<p class="note">Press Play to test this connection.</p>';
      h += '<div class="row"><button class="btn" type="button" data-act="reverse">Reverse direction</button><button class="btn danger" type="button" data-act="delete">Delete arrow</button></div>';
      return h;
    }
    const n = nodeById(sel.id);
    if (!n) return '';
    const sv = SV[n.svc];
    const pl = state.placement[n.id] || {};
    let h = '<div class="insp-head">' + iconHTML(n.svc) + '<div><h2>' + esc(sv.name) + '</h2><div class="cat">' + esc(S.CATS[sv.cat].name) + '</div></div></div><p>' + esc(sv.desc) + '</p>';
    h += '<div class="field"><label for="f-label">Label</label><input type="text" id="f-label" data-prop="label" value="' + esc(n.props.label || '') + '" placeholder="' + esc(sv.short) + '"></div>';
    if (sv.group) {
      if (n.svc === 'vpc') h += selectField('f-region', 'Region', 'region', n.props.region || 'primary', Object.keys(S.REGIONS).map((k) => [k, S.REGIONS[k]]));
      h += '<p class="note" style="margin-top:12px">' + (n.svc === 'vpc' ? 'Drag subnets inside this box. Everything in it runs in the region above. Add an Internet Gateway on its edge if it has public subnets.' : 'Drop services inside this subnet. Drag the box by its title; resize from the corner. Use Availability Zone settings on each service for multi-AZ.') + '</p>';
      h += '<div class="row"><button class="btn danger" type="button" data-act="delete">Delete box (keeps services)</button></div>';
      return h;
    }
    if (sv.vpc || pl.vpc) {
      const where = pl.vpc ? ((nodeById(pl.vpc) || {}).props || {}).label || 'VPC' : null;
      h += '<div class="placebox">' + (pl.vpc ? esc(where) + ' › ' + (pl.subnet ? (pl.subnet === 'public' ? 'Public subnet' : 'Private subnet') : 'no subnet') : sv.vpc ? (state.level === 'beginner' ? 'Default VPC (Beginner mode: no VPC box needed)' : 'Not in a VPC yet: drag it into a subnet') : '') +
        (pl.region && pl.region !== 'global' ? ' · ' + esc(S.REGIONS[pl.region].split(' ')[0]) : '') + '</div>';
    }
    if (sv.ha === 'azs') {
      const isDb = n.svc === 'rds' || n.svc === 'aurora' || n.svc === 'documentdb' || n.svc === 'neptune';
      const opts = n.svc === 'aurora' ? [[1, 'Writer only (no replica)'], [2, 'Writer + 1 replica in another AZ'], [3, 'Writer + 2 replicas (3 AZs)']]
        : isDb ? [[1, 'Single-AZ'], [2, 'Multi-AZ (standby in a second AZ)'], [3, 'Multi-AZ cluster (3 AZs)']] : [[1, '1 AZ'], [2, '2 AZs'], [3, '3 AZs']];
      h += selectField('f-azs', n.svc === 'aurora' ? 'Instances' : isDb ? 'Deployment' : 'Availability Zones', 'azs', n.props.azs || 1, opts);
      if (n.svc === 'aurora') h += '<p class="note">Aurora storage always keeps 6 copies of your data across 3 AZs. This setting is about the database instances: with a replica in another AZ, failover takes about 30 seconds instead of about 10 minutes.</p>';
    }
    if (!sv.global && !sv.group && !sv.vpc && sv.cat !== 'clients' && !pl.vpc) {
      h += selectField('f-region', 'Region', 'region', n.props.region || 'primary', Object.keys(S.REGIONS).map((k) => [k, S.REGIONS[k]]));
    }
    if (n.svc === 's3') h += selectField('f-access', 'Access', 'access', n.props.access, [['private', 'Private (Block Public Access on)'], ['presigned', 'Presigned URL uploads / downloads'], ['website', 'Public static website']]);
    if (n.svc === 'lambda') {
      h += checkField('f-url', 'functionUrl', n.props.functionUrl, 'Function URL (public HTTPS endpoint)');
      h += '<p class="note">To let this function reach private resources (RDS, ElastiCache…), drag it into a private subnet.</p>';
    }
    if (n.svc === 'rds' || n.svc === 'aurora') h += checkField('f-xr', 'crossRegion', n.props.crossRegion, n.svc === 'aurora' ? 'Aurora Global Database (replica in another region)' : 'Cross-region read replica');
    if (n.svc === 'dynamodb') h += checkField('f-gt', 'globalTables', n.props.globalTables, 'Global tables (active-active in several regions)');
    if (n.svc === 'ecs') h += selectField('f-launch', 'Launch type', 'launch', n.props.launch, [['fargate', 'Fargate (serverless)'], ['ec2', 'EC2 instances you manage']]);
    const tt = S.typicalTargets(n.svc, 14);
    if (tt.length) h += '<h3>Usually sends to</h3><div class="chips">' + tt.map((x) => '<span>' + esc(x) + '</span>').join('') + '</div>';
    h += '<div class="row"><button class="btn" type="button" data-act="connect">Connect to…</button><button class="btn" type="button" data-act="duplicate">Duplicate</button><button class="btn danger" type="button" data-act="delete">Delete</button></div>';
    return h;
  }
  function selectField(id, label, prop, val, opts) {
    return '<div class="field"><label for="' + id + '">' + esc(label) + '</label><select id="' + id + '" data-prop="' + prop + '">' +
      opts.map(([v, t]) => '<option value="' + v + '"' + (String(v) === String(val) ? ' selected' : '') + '>' + esc(t) + '</option>').join('') + '</select></div>';
  }
  function checkField(id, prop, val, label) {
    return '<label class="check" for="' + id + '"><input type="checkbox" id="' + id + '" data-prop="' + prop + '"' + (val ? ' checked' : '') + '><span>' + esc(label) + '</span></label>';
  }

  function resultsHTML() {
    const r = state.result;
    if (!r) return '<p class="eyebrow">Results</p><h2>Not tested yet</h2><p>Press <b>Play</b> to send traffic through your design. You\'ll see what passes, what fails and why, plus suggestions for simpler or cheaper ways to do it.</p>';
    const reqFail = r.requirements.filter((x) => !x.ok).length;
    let h = '';
    if (state.resultStale) h += '<p class="note" style="margin-bottom:10px">You changed the design since the last run. Press Play again to update.</p>';
    h += '<div class="verdict ' + (r.passed ? 'pass' : 'fail') + '"><div class="big">' + (r.passed ? 'PASSED' : 'FAILED') + '</div><div class="stats">' +
      r.errors + ' problem' + (r.errors === 1 ? '' : 's') + ' · ' + r.warnings + ' warning' + (r.warnings === 1 ? '' : 's') +
      (r.requirements.length ? ' · ' + (r.requirements.length - reqFail) + '/' + r.requirements.length + ' requirements' : '') + '</div>' +
      '<div>' + (r.passed ? (r.warnings ? 'It would work. Look at the warnings and suggestions below to make it better.' : 'It would work as drawn.') : 'Fix the items below and press Play again.') + '</div></div>';
    if (r.requirements.length) {
      h += '<h3>Requirements</h3><ul class="reqs">' + r.requirements.map((q) => '<li class="' + (q.ok ? 'ok' : 'no') + '"><span class="mark">' + (q.ok ? '✓' : '✗') + '</span><span>' + esc(q.text) + (!q.ok && q.hint ? '<span class="hint">Hint: ' + esc(q.hint) + '</span>' : '') + '</span></li>').join('') + '</ul>';
    }
    const errs = r.issues.filter((i) => i.level === 'error'), warns = r.issues.filter((i) => i.level === 'warn');
    if (errs.length) h += '<h3>Why it fails</h3><ul class="issues">' + errs.map((i) => issueHTML(i, r.issues.indexOf(i))).join('') + '</ul>';
    if (warns.length) h += '<h3>Warnings</h3><ul class="issues">' + warns.map((i) => issueHTML(i, r.issues.indexOf(i))).join('') + '</ul>';
    if (r.suggestions.length) {
      h += '<h3>' + (r.passed ? 'It works, but you could…' : 'Also consider') + '</h3><ul class="issues">' +
        r.suggestions.map((s, i) => '<li class="issue tip" data-sug="' + i + '"><div class="t"><span class="lvl">tip</span><span>' + esc(s.title) + '</span></div><div class="d">' + esc(s.detail) + '</div></li>').join('') + '</ul>';
    }
    return h;
  }
  function issueHTML(i, idx) {
    return '<li class="issue ' + i.level + '" data-issue="' + idx + '"><div class="t"><span class="lvl">' + (i.level === 'error' ? 'fails' : 'warning') + '</span><span>' + esc(i.title) + '</span></div>' +
      '<div class="d">' + esc(i.detail) + '</div>' + (i.fix ? '<div class="f"><b>Fix:</b> ' + esc(i.fix) + '</div>' : '') + '</li>';
  }

  // ---------- mutations ----------
  function addNode(svcId, wx, wy) {
    const sv = SV[svcId];
    snapshot();
    const n = { id: uid('n'), svc: svcId, props: S.defaultProps(svcId) };
    if (sv.group) {
      n.w = svcId === 'vpc' ? 620 : 250; n.h = svcId === 'vpc' ? 380 : 290;
      n.x = Math.round(wx - 20); n.y = Math.round(wy - 14);
    } else {
      n.x = Math.round(wx - NODE.w / 2); n.y = Math.round(wy - NODE.icon / 2);
    }
    state.graph.nodes.push(n);
    state.sel = { type: 'node', id: n.id };
    if (state.tab !== 'question' || window.innerWidth < 900) state.tab = 'inspect';
    changed();
    return n;
  }
  function addEdge(from, to) {
    if (from === to) return;
    const a = nodeById(from), b = nodeById(to);
    if (!a || !b || SV[b.svc].group || SV[a.svc].group) return;
    if (state.graph.edges.some((e) => e.from === from && e.to === to)) return;
    snapshot();
    const rev = state.graph.edges.find((e) => e.from === to && e.to === from);
    const e = { id: uid('e'), from, to };
    state.graph.edges.push(e);
    state.sel = { type: 'edge', id: e.id };
    changed();
    if (rev) flashNote('There is already an arrow the other way. Arrows point from the caller to the service it calls.');
  }
  function deleteSelection() {
    const sel = state.sel;
    if (!sel) return;
    snapshot();
    if (sel.type === 'edge') state.graph.edges = state.graph.edges.filter((e) => e.id !== sel.id);
    else {
      state.graph.nodes = state.graph.nodes.filter((n) => n.id !== sel.id);
      state.graph.edges = state.graph.edges.filter((e) => e.from !== sel.id && e.to !== sel.id);
    }
    state.sel = null;
    changed();
  }
  function setProp(prop, value) {
    const n = state.sel && state.sel.type === 'node' && nodeById(state.sel.id);
    if (!n) return;
    snapshot();
    if (prop === 'label') { if (value.trim()) n.props.label = value.trim(); else delete n.props.label; }
    else n.props[prop] = value;
    if (state.result) state.resultStale = true;
    const keepTab = state.tab;
    render();
    state.tab = keepTab;
    saveSoon();
  }
  function membersOf(g) {
    const r = { x: g.x, y: g.y, w: g.w, h: g.h };
    return state.graph.nodes.filter((n) => {
      if (n.id === g.id) return false;
      if (SV[n.svc].group) return n.x >= r.x - 1 && n.y >= r.y - 1 && n.x + n.w <= r.x + r.w + 1 && n.y + n.h <= r.y + r.h + 1;
      const c = S.nodeCenter(n);
      const pad = n.svc === 'igw' && g.svc === 'vpc' ? 50 : 0;
      return c[0] >= r.x - pad && c[0] <= r.x + r.w + pad && c[1] >= r.y - pad && c[1] <= r.y + r.h + pad;
    });
  }

  // ---------- notes / toast ----------
  let toastTimer = null;
  function flashNote(text) {
    const t = $('#toast');
    t.className = 'verdict-toast';
    t.innerHTML = '<span>' + esc(text) + '</span>';
    t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 4200);
  }
  function showVerdict(r) {
    const t = $('#toast');
    const reqFail = r.requirements.filter((x) => !x.ok).length;
    let msg;
    if (r.passed) msg = r.requirements.length ? 'All ' + r.requirements.length + ' requirements met' + (r.suggestions.length ? ' · ' + r.suggestions.length + ' suggestion' + (r.suggestions.length === 1 ? '' : 's') : '') : 'Every connection works' + (r.warnings ? ' · ' + r.warnings + ' warning' + (r.warnings === 1 ? '' : 's') : '');
    else msg = [r.errors ? r.errors + ' problem' + (r.errors === 1 ? '' : 's') : '', reqFail ? reqFail + ' requirement' + (reqFail === 1 ? '' : 's') + ' not met' : ''].filter(Boolean).join(' · ');
    t.className = 'verdict-toast ' + (r.passed ? 'pass' : 'fail');
    t.innerHTML = '<span class="stamp">' + (r.passed ? 'PASSED' : 'FAILED') + '</span><span>' + esc(msg) + '</span>';
    t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 6000);
  }

  // ---------- play ----------
  function play() {
    if (state.animating) return;
    state.connectFrom = null;
    const strict = state.level === 'associate' || state.level === 'professional';
    const reqs = state.mode === 'question' && state.scenario ? state.scenario.reqs : [];
    const r = S.evaluate(state.graph, { strict, simple: state.level === 'beginner', requirements: reqs, level: state.level });
    state.result = r; state.resultStale = false;
    if (reduceMotion || !state.graph.edges.length) { finishPlay(); return; }
    state.animating = true; state.animDone = new Set();
    render();
    const layers = r.layers.slice();
    const pkt = $('#packetLayer');
    const step = () => {
      const layer = layers.shift();
      if (!layer) { state.animating = false; pkt.innerHTML = ''; finishPlay(); return; }
      const geoms = layer.map((id) => ({ id, g: edgeGeom(state.graph.edges.find((e) => e.id === id)), ok: r.edgeRes[id] && r.edgeRes[id].ok })).filter((x) => x.g);
      pkt.innerHTML = geoms.map((x) => '<circle class="packet" r="5" data-p="' + x.id + '"/>').join('');
      const els = [...pkt.querySelectorAll('circle')];
      const dur = 520; const t0 = performance.now();
      const frame = (now) => {
        const t = Math.min(1, (now - t0) / dur);
        geoms.forEach((x, i) => {
          const lim = x.ok ? 1 : 0.55;
          const tt = Math.min(t, lim) / 1;
          const px = x.g.x1 + (x.g.x2 - x.g.x1) * tt, py = x.g.y1 + (x.g.y2 - x.g.y1) * tt;
          els[i].setAttribute('cx', px); els[i].setAttribute('cy', py);
          if (!x.ok && t >= lim) els[i].setAttribute('class', 'packet bad');
        });
        if (t < 1) requestAnimationFrame(frame);
        else { layer.forEach((id) => state.animDone.add(id)); renderEdges(); setTimeout(step, 60); }
      };
      requestAnimationFrame(frame);
    };
    step();
  }
  function finishPlay() {
    state.tab = 'results';
    render();
    showVerdict(state.result);
  }

  // ---------- pointer interactions on canvas ----------
  let drag = null;
  const pointers = new Map();
  viewport.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0 && ev.pointerType === 'mouse' && ev.button !== 1) return;
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pointers.size === 2) { startPinch(); return; }
    const t = ev.target;
    const nodeEl = t.closest('.node'), groupEl = t.closest('.group'), edgeEl = t.closest('[data-edge]');
    const w = toWorld(ev.clientX, ev.clientY);
    hideTip();
    if (state.animating) return;
    if (ev.button === 1) { drag = { kind: 'pan', sx: ev.clientX, sy: ev.clientY, vx: state.view.x, vy: state.view.y, moved: false }; viewport.setPointerCapture(ev.pointerId); return; }
    if (nodeEl && state.connectFrom) {
      const id = nodeEl.dataset.id; const from = state.connectFrom;
      state.connectFrom = null;
      if (id !== from) addEdge(from, id); else render();
      return;
    }
    if (t.dataset.drag === 'port' && nodeEl) {
      const n = nodeById(nodeEl.dataset.id);
      const c = iconCenter(n);
      drag = { kind: 'connect', from: n.id, cx: c.x, cy: c.y };
      state.tempLine = { x1: c.x, y1: c.y, x2: w.x, y2: w.y };
      viewport.setPointerCapture(ev.pointerId);
      ev.preventDefault();
      return;
    }
    if (nodeEl) {
      const n = nodeById(nodeEl.dataset.id);
      drag = { kind: 'node', id: n.id, ox: w.x - n.x, oy: w.y - n.y, moved: false };
      selectItem({ type: 'node', id: n.id });
      viewport.setPointerCapture(ev.pointerId);
      return;
    }
    if (t.dataset.drag === 'resize' && groupEl) {
      const g = nodeById(groupEl.dataset.id);
      drag = { kind: 'resize', id: g.id, sx: w.x, sy: w.y, w0: g.w, h0: g.h, moved: false };
      viewport.setPointerCapture(ev.pointerId);
      return;
    }
    if (t.closest('.group-head') && groupEl) {
      const g = nodeById(groupEl.dataset.id);
      drag = { kind: 'group', id: g.id, sx: w.x, sy: w.y, members: membersOf(g).map((m) => ({ n: m, x: m.x, y: m.y })), x0: g.x, y0: g.y, moved: false };
      selectItem({ type: 'node', id: g.id });
      viewport.setPointerCapture(ev.pointerId);
      return;
    }
    if (edgeEl) {
      selectItem({ type: 'edge', id: edgeEl.dataset.edge });
      return;
    }
    drag = { kind: 'pan', sx: ev.clientX, sy: ev.clientY, vx: state.view.x, vy: state.view.y, moved: false };
    viewport.setPointerCapture(ev.pointerId);
  });
  viewport.addEventListener('pointermove', (ev) => {
    if (pointers.has(ev.pointerId)) pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pinch) { doPinch(); return; }
    if (!drag) return;
    const w = toWorld(ev.clientX, ev.clientY);
    if (drag.kind === 'pan') {
      const dx = ev.clientX - drag.sx, dy = ev.clientY - drag.sy;
      if (Math.abs(dx) + Math.abs(dy) > 3) { drag.moved = true; viewport.classList.add('panning'); }
      state.view.x = drag.vx + dx; state.view.y = drag.vy + dy; applyView();
    } else if (drag.kind === 'node') {
      const n = nodeById(drag.id);
      const nx = Math.round((w.x - drag.ox) / 4) * 4, ny = Math.round((w.y - drag.oy) / 4) * 4;
      if (!drag.moved && (Math.abs(nx - n.x) > 3 || Math.abs(ny - n.y) > 3)) { drag.moved = true; snapshot(); }
      if (!drag.moved) return;
      n.x = nx; n.y = ny;
      if (!drag.el || !drag.el.isConnected) drag.el = document.querySelector('#nodeLayer .node[data-id="' + drag.id + '"]');
      drag.el.style.left = nx + 'px'; drag.el.style.top = ny + 'px';
      renderEdges();
    } else if (drag.kind === 'group') {
      const dx = Math.round((w.x - drag.sx) / 4) * 4, dy = Math.round((w.y - drag.sy) / 4) * 4;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) > 3) { drag.moved = true; snapshot(); }
      if (!drag.moved) return;
      const g = nodeById(drag.id); g.x = drag.x0 + dx; g.y = drag.y0 + dy;
      drag.members.forEach((m) => { m.n.x = m.x + dx; m.n.y = m.y + dy; });
      fastPositions();
    } else if (drag.kind === 'resize') {
      const g = nodeById(drag.id);
      if (!drag.moved) { drag.moved = true; snapshot(); }
      g.w = Math.max(160, Math.round(drag.w0 + w.x - drag.sx)); g.h = Math.max(120, Math.round(drag.h0 + w.y - drag.sy));
      fastPositions();
    } else if (drag.kind === 'connect') {
      state.tempLine = { x1: drag.cx, y1: drag.cy, x2: w.x, y2: w.y };
      document.querySelectorAll('.node.connect-target').forEach((el) => el.classList.remove('connect-target'));
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const over = el && el.closest && el.closest('.node');
      if (over && over.dataset.id !== drag.from) over.classList.add('connect-target');
      renderEdges();
    }
  });
  function endPointer(ev) {
    pointers.delete(ev.pointerId);
    if (pinch) { if (pointers.size < 2) { pinch = null; saveSoon(); } return; }
    if (!drag) return;
    const d = drag; drag = null;
    viewport.classList.remove('panning');
    if (d.kind === 'pan') {
      if (!d.moved) { if (state.sel || state.connectFrom) { state.connectFrom = null; selectItem(null); } }
      saveSoon();
    } else if (d.kind === 'connect') {
      state.tempLine = null;
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const over = el && el.closest && el.closest('.node');
      if (over && over.dataset.id !== d.from) addEdge(d.from, over.dataset.id);
      else renderEdges();
      document.querySelectorAll('.node.connect-target').forEach((x) => x.classList.remove('connect-target'));
    } else if (d.moved) {
      changed();
    }
  }
  viewport.addEventListener('pointerup', endPointer);
  viewport.addEventListener('pointercancel', endPointer);
  function fastPositions() {
    document.querySelectorAll('#groupLayer .group').forEach((el) => {
      const g = nodeById(el.dataset.id); if (!g) return;
      el.style.left = g.x + 'px'; el.style.top = g.y + 'px'; el.style.width = g.w + 'px'; el.style.height = g.h + 'px';
    });
    document.querySelectorAll('#nodeLayer .node').forEach((el) => {
      const n = nodeById(el.dataset.id); if (!n) return;
      el.style.left = n.x + 'px'; el.style.top = n.y + 'px';
    });
    renderEdges();
  }
  let pinch = null;
  function startPinch() {
    drag = null; state.tempLine = null;
    const [a, b] = [...pointers.values()];
    pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y), k0: state.view.k, vx: state.view.x, vy: state.view.y, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
  }
  function doPinch() {
    const [a, b] = [...pointers.values()];
    if (!a || !b) return;
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    const r = viewport.getBoundingClientRect();
    const k = Math.min(2, Math.max(0.25, pinch.k0 * d / pinch.d0));
    const cx = (a.x + b.x) / 2 - r.left, cy = (a.y + b.y) / 2 - r.top;
    const pcx = pinch.cx - r.left, pcy = pinch.cy - r.top;
    state.view.k = k;
    state.view.x = cx - (pcx - pinch.vx) * (k / pinch.k0);
    state.view.y = cy - (pcy - pinch.vy) * (k / pinch.k0);
    applyView();
  }
  viewport.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    if (ev.ctrlKey || ev.metaKey) zoomAt(Math.exp(-ev.deltaY * 0.01), ev.clientX, ev.clientY);
    else { state.view.x -= ev.deltaX; state.view.y -= ev.deltaY; applyView(); saveSoon(); }
  }, { passive: false });

  function selectItem(sel) {
    state.sel = sel;
    if (sel) state.tab = 'inspect';
    render();
  }

  // ---------- palette drag ----------
  let palDrag = null;
  const palList = $('#palList');
  palList.addEventListener('pointerdown', (ev) => {
    const item = ev.target.closest('.pal-item');
    if (!item || ev.button !== 0) return;
    palDrag = { svc: item.dataset.svc, sx: ev.clientX, sy: ev.clientY, ghost: null, item, pointerType: ev.pointerType };
    item.setPointerCapture(ev.pointerId);
  });
  palList.addEventListener('pointermove', (ev) => {
    if (!palDrag) { showTipFor(ev); return; }
    const dist = Math.abs(ev.clientX - palDrag.sx) + Math.abs(ev.clientY - palDrag.sy);
    if (palDrag.pointerType !== 'mouse' && !palDrag.ghost && Math.abs(ev.clientY - palDrag.sy) > Math.abs(ev.clientX - palDrag.sx)) return; // vertical swipe = scroll
    if (!palDrag.ghost && dist > 8) {
      hideTip();
      const g = document.createElement('div');
      g.style.cssText = 'position:fixed;z-index:70;pointer-events:none;width:52px;height:52px;opacity:.9;filter:drop-shadow(0 6px 14px rgba(0,0,0,.25))';
      g.innerHTML = iconHTML(palDrag.svc).replace('class="ico', 'style="width:52px;height:52px" class="ico');
      document.body.appendChild(g);
      palDrag.ghost = g;
      if (window.innerWidth < 900) $('#palette').classList.remove('open');
    }
    if (palDrag.ghost) { palDrag.ghost.style.left = (ev.clientX - 26) + 'px'; palDrag.ghost.style.top = (ev.clientY - 26) + 'px'; }
  });
  function endPal(ev) {
    if (!palDrag) return;
    const d = palDrag; palDrag = null;
    if (d.ghost) {
      d.ghost.remove();
      const r = viewport.getBoundingClientRect();
      if (ev.type === 'pointerup' && ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) {
        const w = toWorld(ev.clientX, ev.clientY);
        addNode(d.svc, w.x, w.y);
      }
    } else if (ev.type === 'pointerup') {
      // tap: add in the middle of the visible canvas, nudged so repeated taps don't stack
      const r = viewport.getBoundingClientRect();
      const w = toWorld(r.left + r.width / 2, r.top + r.height / 2);
      const k = state.graph.nodes.length % 6;
      addNode(d.svc, w.x + (k - 2.5) * 30, w.y + (k - 2.5) * 22);
      if (window.innerWidth < 900) $('#palette').classList.remove('open');
    }
  }
  palList.addEventListener('pointerup', endPal);
  palList.addEventListener('pointercancel', endPal);
  palList.addEventListener('pointerleave', hideTip);
  palList.addEventListener('keydown', (ev) => {
    const item = ev.target.closest('.pal-item');
    if (item && (ev.key === 'Enter' || ev.key === ' ')) {
      ev.preventDefault();
      const r = viewport.getBoundingClientRect();
      const w = toWorld(r.left + r.width / 2, r.top + r.height / 2);
      addNode(item.dataset.svc, w.x, w.y);
    }
  });

  // tooltip
  const tip = $('#tooltip');
  function showTipFor(ev) {
    const item = ev.target.closest && ev.target.closest('.pal-item');
    if (!item || ev.pointerType !== 'mouse') { hideTip(); return; }
    const sv = SV[item.dataset.svc];
    tip.innerHTML = '<b>' + esc(sv.name) + '</b>' + esc(sv.desc);
    tip.hidden = false;
    const x = Math.min(ev.clientX + 16, window.innerWidth - 280);
    tip.style.left = x + 'px'; tip.style.top = (ev.clientY + 14) + 'px';
  }
  function hideTip() { tip.hidden = true; }

  // ---------- panel events ----------
  const panel = $('#panel');
  let sampleArmed = null;
  panel.addEventListener('click', (ev) => {
    const act = ev.target.closest('[data-act]');
    if (act) {
      const a = act.dataset.act;
      if (a === 'new') newQuestion();
      else if (a === 'free') { state.mode = 'free'; state.result = null; renderPanel(); renderChrome(); saveSoon(); }
      else if (a === 'sample') {
        if (state.graph.nodes.length && !sampleArmed) {
          act.textContent = 'Replace my diagram? Click again';
          act.classList.add('confirm');
          sampleArmed = setTimeout(() => { sampleArmed = null; if (act.isConnected) { act.textContent = 'Show a sample answer'; act.classList.remove('confirm'); } }, 3500);
          return;
        }
        clearTimeout(sampleArmed); sampleArmed = null;
        snapshot();
        state.graph = S.layoutSolution(state.scenario.sol);
        state.sel = null; state.result = null; state.showedSample = true;
        changed(); fitView();
      } else if (a === 'delete') deleteSelection();
      else if (a === 'reverse') {
        const e = state.graph.edges.find((x) => state.sel && x.id === state.sel.id);
        if (e) { snapshot(); const t = e.from; e.from = e.to; e.to = t; changed(); }
      } else if (a === 'connect') { state.connectFrom = state.sel.id; render(); }
      else if (a === 'duplicate') {
        const n = nodeById(state.sel.id);
        if (n) { const c = addNode(n.svc, n.x + NODE.w / 2 + 30, n.y + NODE.icon / 2 + 30); c.props = JSON.parse(JSON.stringify(n.props)); render(); }
      }
      return;
    }
    const iss = ev.target.closest('[data-issue]'), sug = ev.target.closest('[data-sug]');
    if ((iss || sug) && state.result) {
      const item = iss ? state.result.issues[+iss.dataset.issue] : state.result.suggestions[+sug.dataset.sug];
      highlight(item.nodeIds || [], item.edgeIds || []);
    }
  });
  panel.addEventListener('change', (ev) => {
    const el = ev.target;
    if (!el.dataset.prop) return;
    let v = el.type === 'checkbox' ? el.checked : el.value;
    if (el.dataset.prop === 'azs') v = +v;
    setProp(el.dataset.prop, v);
  });
  function highlight(nodeIds, edgeIds) {
    if (edgeIds.length) state.sel = { type: 'edge', id: edgeIds[0] };
    renderEdges();
    nodeIds.forEach((id) => {
      const el = document.querySelector('.node[data-id="' + id + '"]');
      if (el) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
    });
    // make sure the first one is visible
    const n = nodeById(nodeIds[0]);
    if (n) {
      const r = viewport.getBoundingClientRect();
      const sx = n.x * state.view.k + state.view.x, sy = n.y * state.view.k + state.view.y;
      if (sx < 0 || sy < 0 || sx > r.width - 60 || sy > r.height - 60) {
        state.view.x = r.width / 2 - (n.x + NODE.w / 2) * state.view.k; state.view.y = r.height / 2 - (n.y + 30) * state.view.k; applyView();
      }
    }
  }

  // ---------- top bar ----------
  $('#levels').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-level]');
    if (!b) return;
    state.level = b.dataset.level;
    if (state.mode === 'question') newQuestion();
    else { state.result = null; renderChrome(); renderPanel(); saveSoon(); }
  });
  $('#btnNew').addEventListener('click', newQuestion);
  $('#btnPlay').addEventListener('click', play);
  $('#btnUndo').addEventListener('click', undo);
  $('#btnRedo').addEventListener('click', redo);
  let clearArmed = null;
  $('#btnClear').addEventListener('click', (ev) => {
    const b = ev.currentTarget;
    if (!state.graph.nodes.length) return;
    if (!clearArmed) {
      flashNote('Click the bin again to clear the canvas (you can undo).');
      clearArmed = setTimeout(() => { clearArmed = null; }, 3500);
      return;
    }
    clearTimeout(clearArmed); clearArmed = null;
    snapshot(); state.graph = { nodes: [], edges: [] }; state.sel = null; state.result = null; changed();
    b.blur();
  });
  $('#btnExport').addEventListener('click', () => {
    const data = JSON.stringify({ app: 'aws-architecture-sandbox', version: 1, level: state.level, scenario: state.mode === 'question' ? state.scenarioRef : null, graph: state.graph }, null, 2);
    try {
      const blob = new Blob([data], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'architecture-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e) { /* ignore */ }
    if (navigator.clipboard) navigator.clipboard.writeText(data).then(() => flashNote('Diagram saved as a file and copied to the clipboard.'), () => flashNote('Diagram saved as a file.'));
  });
  $('#btnImport').addEventListener('click', () => $('#fileInput').click());
  $('#fileInput').addEventListener('change', (ev) => {
    const f = ev.target.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const d = JSON.parse(rd.result);
        snapshot();
        state.graph = sanitizeGraph(d.graph || d);
        if (d.scenario && d.scenario.id) { state.mode = 'question'; state.level = d.scenario.level; loadScenario(d.scenario); }
        state.sel = null; state.result = null;
        changed(); fitView();
        flashNote('Opened ' + f.name + '.');
      } catch (e) { flashNote('That file isn\'t a saved diagram from this app.'); }
    };
    rd.readAsText(f);
    ev.target.value = '';
  });
  $('#zoomIn').addEventListener('click', () => zoomAt(1.2));
  $('#zoomOut').addEventListener('click', () => zoomAt(1 / 1.2));
  $('#zoomFit').addEventListener('click', fitView);
  $('#connectCancel').addEventListener('click', () => { state.connectFrom = null; render(); });
  $('#btnAddFab').addEventListener('click', () => $('#palette').classList.toggle('open'));
  $('#btnExample').addEventListener('click', () => {
    snapshot();
    state.graph = sanitizeGraph({
      nodes: [
        { id: 'x1', svc: 'users', x: 40, y: 140 }, { id: 'x2', svc: 'route53', x: 220, y: 140 },
        { id: 'x3', svc: 'ec2', x: 420, y: 90 }, { id: 'x4', svc: 'rds', x: 640, y: 90 }, { id: 'x5', svc: 'elasticache', x: 640, y: 250 },
        { id: 'x6', svc: 's3', x: 420, y: 330, props: { label: 'Images' } },
      ],
      edges: [{ id: 'y1', from: 'x1', to: 'x2' }, { id: 'y2', from: 'x2', to: 'x3' }, { id: 'y3', from: 'x3', to: 'x5' }, { id: 'y4', from: 'x5', to: 'x4' }, { id: 'y5', from: 'x1', to: 'x6' }],
    });
    state.sel = null; state.result = null;
    changed(); fitView();
    flashNote('Press Play to see what\'s wrong with this design.');
  });
  $('#palSearch').addEventListener('input', (ev) => { renderPalette(ev.target.value); $('#palClear').hidden = !ev.target.value; });
  $('#palClear').addEventListener('click', () => { $('#palSearch').value = ''; renderPalette(''); $('#palClear').hidden = true; $('#palSearch').focus(); });
  ['question', 'inspect', 'results'].forEach((k) => $('#tab-' + k).addEventListener('click', () => { state.tab = k; renderPanel(); renderChrome(); }));

  document.addEventListener('keydown', (ev) => {
    const tag = (ev.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if ((ev.key === 'Delete' || ev.key === 'Backspace') && state.sel) { ev.preventDefault(); deleteSelection(); }
    else if (ev.key === 'Escape') { state.connectFrom = null; state.sel = null; render(); }
    else if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') { ev.preventDefault(); if (ev.shiftKey) redo(); else undo(); }
    else if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'y') { ev.preventDefault(); redo(); }
  });
  document.addEventListener('click', (ev) => {
    const pal = $('#palette');
    if (window.innerWidth < 900 && pal.classList.contains('open') && !pal.contains(ev.target) && !ev.target.closest('#btnAddFab')) pal.classList.remove('open');
  });

  // ---------- boot ----------
  $('#palSearch').placeholder = 'Search ' + S.SERVICE_LIST.length + ' services…';
  renderPalette('');
  const restored = load();
  if (state.mode === 'question') {
    if (state.scenarioRef) loadScenario(state.scenarioRef);
    else loadScenario({ level: state.level, seed: null, id: null });
  }
  applyView();
  render();
  if (!restored) setTimeout(fitView, 0);
  window.addEventListener('resize', () => applyView());
})();
