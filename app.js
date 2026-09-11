// DATA lives in data.js, written by working/export_threads_payload.py

/* -- palette that holds on the dark plate in both themes -- */
// Colour comes from the EVIDENCE score. Nothing here is banded by a guess.
const BAND_STOPS = [
  [0.85, "#C9A227", "very high"],
  [0.70, "#4E8DC4", "high"],
  [0.55, "#7E8AA0", "medium"],
  [0.40, "#A45340", "low"],
  [0.00, "#6B4235", "very low"]
];
// Colour is now the count of INDEPENDENT witnesses, not a score. Raw references
// are the headline number because they are concrete and clickable; independence
// drives the colour because that is the thing the discount was ever about, and a
// colour keyed to raw counts would paint four copies of Mark as the brightest
// thing on the page.
function bandOf(unitOrScore, id){
  const w = witOf(id != null ? id : unitOrScore);
  const n = w ? (w.i != null ? w.i : 0) : 0;
  if (n >= 5) return {col: "#C9A227", label: "5 or more independent"};
  if (n >= 4) return {col: "#4E8DC4", label: "4 independent"};
  if (n >= 3) return {col: "#7E8AA0", label: "3 independent"};
  if (n >= 2) return {col: "#A45340", label: "2 independent"};
  return {col: "#6B4235", label: "1 independent"};
}
const PLATE_INK = "#E7E2D6", PLATE_DIM = "#9C9384";

/* == 1. force-directed evidence graph ================== */
(function(){
  // This block is the graph application. It now shares app.js with the About
  // page, which has the prose and the tables but no canvas -- so it must stand
  // down cleanly there instead of throwing on the first line and taking
  // everything after it with it.
  const cv = document.getElementById("g");
  if (!cv) return;
  const ctx = cv.getContext("2d");
  const readout = document.getElementById("readout");
  const countsEl = document.getElementById("counts");
  let lane = "teaching";
  let nodes = [], links = [], hot = null, selected = null, dpr = 1, W = 0, H = 0, alpha = 1;
  const view = { s: 1, cx: 0, cy: 0, init: false };
  const SHORT = {
    "Gospel of the Hebrews / Nazoreans / Ebionites": "Hebrews/Naz.",
    "Nag Hammadi Library": "Nag Hammadi",
    "Q hypothesis": "Q",
    "Pauline letters": "Paul",
    "Letter of James": "James",
    "Protoevangelium of James": "Protoev. James",
    "Infancy Gospel of Thomas": "Infancy Thomas",
    "Tacitus Annals": "Tacitus"
  };

  const workAtt = {};
  DATA.att.forEach(a => { workAtt[a.work_id] = (workAtt[a.work_id]||0) + 1; });

  function build(){
    const units = DATA.units.filter(u => lane === "all" || u.lane === lane);
    const keep = new Set(units.map(u => u.id));
    const att  = DATA.att.filter(a => keep.has(a.teaching_unit_id));
    const wids = [...new Set(att.map(a => a.work_id))];

    nodes = []; const idx = {};
    wids.forEach(wid => {
      const w = DATA.works[wid];
      const n = { key:"w"+wid, type:"work", label: SHORT[w.title] || w.title.replace(/^Gospel of /,""),
                  full:w, r: 6, x:0, y:0, vx:0, vy:0 };
      idx[n.key] = nodes.length; nodes.push(n);
    });
    units.forEach(u => {
      const n = { key:"u"+u.id, type:"unit", label:u.title, full:u,
                  r: 6, x:0, y:0, vx:0, vy:0 };
      idx[n.key] = nodes.length; nodes.push(n);
    });

    links = att.map(a => ({
      s: idx["u"+a.teaching_unit_id], t: idx["w"+a.work_id],
      w: a.independence_weight || 0.5
    })).filter(l => l.s !== undefined && l.t !== undefined);

    nodes.forEach(n => { n.deg = 0; });
    links.forEach(l => { nodes[l.s].deg++; nodes[l.t].deg++; });

    // Size is connections, on ONE scale for works and teachings alike. r grows with the
    // square root of degree, so the AREA of a circle is what tracks the count -- which is
    // what the eye actually reads. Note this no longer agrees with colour: colour is the
    // evidence score. A fat node is a well-connected one, not a well-attested one.
    nodes.forEach(n => { n.r = 3.2 + Math.sqrt(n.deg || 1) * 2.6; });

    // seed: works on a ring by attestation volume, units scattered around
    const nw = wids.length;
    nodes.forEach((n,i) => {
      if (n.type === "work"){
        const k = wids.indexOf(+n.key.slice(1)), a = (k/nw) * Math.PI * 2;
        n.x = Math.cos(a) * 150; n.y = Math.sin(a) * 110;
      } else {
        const a = (i * 2.399963);
        n.x = Math.cos(a) * (40 + (i % 90) * 3.1);
        n.y = Math.sin(a) * (30 + (i % 90) * 2.3);
      }
    });
    alpha = 1; view.init = false;
    countsEl.textContent = nodes.length + " nodes \u00b7 " + links.length + " edges";
  }

  function tick(){
    if (alpha > 0.004) alpha *= 0.9915;
    const k = alpha;
    // repulsion
    for (let i = 0; i < nodes.length; i++){
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++){
        const b = nodes[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        let d2 = dx*dx + dy*dy;
        if (d2 < 0.01){ dx = (Math.random()-0.5); dy = (Math.random()-0.5); d2 = 0.01; }
        const bothWork = a.type === "work" && b.type === "work";
        if (d2 > 90000 && !bothWork) continue;
        const d = Math.sqrt(d2);
        const rep = (bothWork ? 34000 : (a.type === "work" || b.type === "work" ? 1100 : 340)) / d2;
        const fx = dx/d*rep, fy = dy/d*rep;
        a.vx -= fx; a.vy -= fy; b.vx += fx; b.vy += fy;
      }
    }
    // springs
    for (const l of links){
      const a = nodes[l.s], b = nodes[l.t];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx,dy) || 0.01;
      const rest = 64 + (1 - l.w) * 42;
      const f = (d - rest) * 0.014;
      const fx = dx/d*f, fy = dy/d*f;
      a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
    }
    // gravity + integrate
    for (const n of nodes){
      n.vx -= n.x * 0.0022; n.vy -= n.y * 0.0034;
      n.vx *= 0.86; n.vy *= 0.86;
      n.x += n.vx * k * 1.9; n.y += n.vy * k * 1.9;
    }
  }

  function draw(){
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,W,H);
    // Normally fit everything. But once a node is selected, zoom to just that
    // teaching and the works that carry it -- otherwise it is a speck in a crowd.
    let fitSet = nodes;
    if (selected){
      const si = nodes.indexOf(selected), keep = new Set([si]);
      links.forEach(l => { if (l.s === si) keep.add(l.t); if (l.t === si) keep.add(l.s); });
      fitSet = nodes.filter((n,i) => keep.has(i));
    }
    let minX=1e9, maxX=-1e9, minY=1e9, maxY=-1e9;
    for (const n of fitSet){
      const pad = n.type === "work" ? n.r + 34 : n.r + 22;
      if (n.x-pad < minX) minX = n.x-pad;
      if (n.x+pad > maxX) maxX = n.x+pad;
      if (n.y-pad < minY) minY = n.y-pad;
      if (n.y+pad > maxY) maxY = n.y+pad;
    }
    const bw = Math.max(maxX-minX,1), bh = Math.max(maxY-minY,1), m = 14;
    const tS = Math.min((W-m*2)/bw, (H-m*2)/bh, selected ? 4.5 : 1.6);
    const tX = (minX+maxX)/2, tY = (minY+maxY)/2;
    if (!view.init){ view.s = tS; view.cx = tX; view.cy = tY; view.init = true; }
    else { view.s += (tS-view.s)*0.07; view.cx += (tX-view.cx)*0.07; view.cy += (tY-view.cy)*0.07; }

    ctx.save();
    ctx.translate(W/2, H/2);
    ctx.scale(view.s, view.s);
    ctx.translate(-view.cx, -view.cy);

    const focus = selected || hot;
    const hotIdx = focus ? nodes.indexOf(focus) : -1;
    const near = new Set();
    if (hotIdx >= 0) links.forEach(l => {
      if (l.s === hotIdx) near.add(l.t);
      if (l.t === hotIdx) near.add(l.s);
    });

    for (const l of links){
      const a = nodes[l.s], b = nodes[l.t];
      const lit = hotIdx < 0 || l.s === hotIdx || l.t === hotIdx;
      ctx.strokeStyle = lit
        ? "rgba(201,162,39," + (0.16 + l.w * 0.5) + ")"
        : "rgba(156,147,132,0.05)";
      ctx.lineWidth = lit ? 0.35 + l.w * 1.15 : 0.3;
      ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
    }

    for (let i = 0; i < nodes.length; i++){
      const n = nodes[i];
      const dim = hotIdx >= 0 && i !== hotIdx && !near.has(i);
      ctx.globalAlpha = dim ? 0.2 : 1;
      if (n.type === "work"){
        ctx.beginPath(); ctx.arc(n.x,n.y,n.r,0,6.2832);
        ctx.fillStyle = "#15120E"; ctx.fill();
        ctx.strokeStyle = PLATE_INK; ctx.lineWidth = 1.2; ctx.stroke();
      } else {
        const isSel = selected && n === selected;
        if (isSel){
          const k = 1 / Math.max(view.s, 0.001);   // keep the marker constant on screen
          ctx.globalAlpha = 1;
          ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 14*k, 0, 6.2832);
          ctx.fillStyle = "rgba(242,228,176,0.16)"; ctx.fill();
          ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 8*k, 0, 6.2832);
          ctx.strokeStyle = "#F2E4B0"; ctx.lineWidth = 2.5*k; ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(n.x, n.y, isSel ? n.r + 1.5 : n.r, 0, 6.2832);
        ctx.fillStyle = bandOf(n.full, n.full.id).col; ctx.fill();
        if (isSel){ ctx.strokeStyle = "#15120E"; ctx.lineWidth = 1.2; ctx.stroke(); }
        else if (i === hotIdx){ ctx.strokeStyle = PLATE_INK; ctx.lineWidth = 1.4; ctx.stroke(); }
      }
      ctx.globalAlpha = 1;
    }

    if (selected){
      const k = 1 / Math.max(view.s, 0.001);
      const lbl = selected.full.title.length > 30 ? selected.full.title.slice(0,29) + "\u2026" : selected.full.title;
      ctx.font = "600 " + (11*k).toFixed(1) + "px 'IBM Plex Sans', sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "bottom";
      const tw = ctx.measureText(lbl).width, ty = selected.y - selected.r - 17*k;
      ctx.fillStyle = "rgba(14,12,8,0.92)";
      ctx.fillRect(selected.x - tw/2 - 5*k, ty - 13*k, tw + 10*k, 15*k);
      ctx.fillStyle = "#F2E4B0"; ctx.fillText(lbl, selected.x, ty);
    }

    // work labels last, over the top, on a small backdrop so they stay legible
    const wk = selected ? 1 / Math.max(view.s, 0.001) : 1;
    ctx.font = "600 " + (8.5*wk).toFixed(1) + "px 'IBM Plex Sans', sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    for (let i = 0; i < nodes.length; i++){
      const n = nodes[i];
      if (n.type !== "work") continue;
      const dim = hotIdx >= 0 && i !== hotIdx && !near.has(i);
      ctx.globalAlpha = dim ? 0.28 : 1;
      const tw = ctx.measureText(n.label).width, ty = n.y + n.r + 3*wk;
      ctx.fillStyle = "rgba(14,12,8,0.82)";
      ctx.fillRect(n.x - tw/2 - 2*wk, ty - 1*wk, tw + 4*wk, 11*wk);
      ctx.fillStyle = dim ? PLATE_DIM : PLATE_INK;
      ctx.fillText(n.label, n.x, ty);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function pick(mx,my){
    const x = (mx - W/2)/view.s + view.cx, y = (my - H/2)/view.s + view.cy;
    let best = null, bd = (14/view.s)*(14/view.s);
    for (const n of nodes){
      const dx = n.x - x, dy = n.y - y, d = dx*dx + dy*dy;
      const rr = Math.max(n.r + 3, 6/view.s);
      if (d < rr*rr && d < bd){ bd = d; best = n; }
    }
    return best;
  }

  function show(n){
    if (!n){ readout.innerHTML = '<p class="hint">Hover a node to inspect it.</p>'; return; }
    if (n.type === "work"){
      const w = n.full;
      readout.innerHTML =
        '<h4>' + esc(w.title) + '</h4>' +
        '<p class="meta">' + w.date_min + '\u2013' + w.date_max + ' CE \u00b7 ' + esc(w.canonical_status) +
        ' \u00b7 ' + esc(w.tradition) + ' \u00b7 ' + (workAtt[+n.key.slice(1)]||0) + ' attestations</p>' +
        '<p class="body">' + esc(w.date_note || "") + '</p>';
    } else {
      const u = n.full;
      const drop = (u.rel != null) ? (u.rel - u.probability_score) : null;
      readout.innerHTML =
        '<h4>' + esc(u.title) + '</h4>' +
        '<p class="meta">' + witBy(u.id).replace(/<[^>]+>/g, "") + ' \u00b7 ' +
        esc(u.unit_type) +
        ' \u00b7 substrate ' + esc(u.substrate_confidence || "unreviewed") + '</p>' +
        '<p class="body">' + esc(u.core_content || u.historical_notes || "") + '</p>';
    }
  }

  cv.addEventListener("mousemove", e => {
    const r = cv.getBoundingClientRect();
    const n = pick(e.clientX - r.left, e.clientY - r.top);
    if (n !== hot){ hot = n; show(n); }
    cv.style.cursor = n ? "pointer" : "default";
  });
  cv.addEventListener("mouseleave", () => { hot = null; show(null); });
  cv.addEventListener("click", e => {
    const r = cv.getBoundingClientRect();
    const n = pick(e.clientX - r.left, e.clientY - r.top);
    if (n && n.type === "unit") openPanel(n.full.id);
  });
  cv.addEventListener("touchstart", e => {
    const r = cv.getBoundingClientRect(), t = e.touches[0];
    const n = pick(t.clientX - r.left, t.clientY - r.top);
    if (n){ hot = n; show(n); if (n.type === "unit") openPanel(n.full.id); }
  }, {passive:true});

  // ---- list view: the same set, read as a list ----
  function renderList(){
    const rowsEl = document.getElementById("lrows");
    const cnt = document.getElementById("lcount");
    const q = (document.getElementById("lsearch").value || "").toLowerCase().trim();
    let items = DATA.units.filter(u => lane === "all" || u.lane === lane);
    if (q) items = items.filter(u => {
      const t = DATA.detail[u.id] || {};
      const hay = [u.title, u.unit_type, t.streams, t.core,
                   (t.refs||[]).map(r => r.ref).join(" ")].join(" ").toLowerCase();
      return hay.includes(q);
    });
    items.sort((a,b) => (b.rel||0) - (a.rel||0));
    if (cnt) cnt.textContent = items.length + (items.length === 1 ? " teaching" : " teachings");
    rowsEl.innerHTML = items.map(u => {
      const det = DATA.detail[u.id] || {};
      const b = bandOf(u, u.id);
      const refs = (det.refs || []).map(r => r.ref).filter(Boolean);
      return '<button class="lrow" type="button" data-uid="' + u.id + '">' +
        '<span class="lt">' + esc(u.title) + '</span>' +
        '<span class="ls"><i style="background:' + b.col + '"></i>' +
          witBy(u.id) + '</span>' +
        (det.core ? '<span class="lc">' + esc(det.core) + '</span>' : '') +
        (refs.length ? '<span class="lref">' + esc(refs.join("  \u00b7  ")) + '</span>' : '') +
        '<span class="lm">' + esc(u.unit_type ? u.unit_type.replace(/_/g," ") : "") +
          (det.streams ? ' \u00b7 ' + esc(det.streams) : '') +
          (det.refs ? ' \u00b7 ' + det.refs.length + ' witness' + (det.refs.length===1?'':'es') : '') +
        '</span></button>';
    }).join("") || '<div style="padding:1.2rem;color:var(--plate-ink-2)">Nothing matches that.</div>';
  }
  document.getElementById("lrows").addEventListener("click", e => {
    const b = e.target.closest(".lrow");
    if (b && b.dataset.uid) openPanel(+b.dataset.uid);
  });
  document.getElementById("lsearch").addEventListener("input", renderList);
  document.querySelectorAll(".viewseg [data-view]").forEach(b => {
    b.addEventListener("click", () => {
      document.querySelectorAll(".viewseg [data-view]").forEach(o => o.setAttribute("aria-pressed", String(o === b)));
      const plate = document.querySelector(".plate");
      const v = b.dataset.view;
      plate.classList.toggle("aslist", v === "list");
      plate.classList.toggle("asthreads", v === "threads");
      plate.classList.toggle("ascontra", v === "contra");
      if (v === "list") renderList();
      else if (v === "threads"){ renderThreads(); tgBuild(); tgResize(); }
      else if (v === "contra") renderContra();
      else resize();
    });
  });
  window.refreshList = renderList;

  // Three views, named for what a reader wants rather than for how the page is
  // built. "Connected teachings" and "Contradictions" are the same graph in two
  // modes, which is why they were previously one tab plus a hidden toggle --
  // a control nobody found. They are now peers.
  function setV3(v){
    const plate = document.querySelector(".plate");
    if (!plate) return;
    document.querySelectorAll(".viewseg [data-v3]").forEach(o =>
      o.setAttribute("aria-pressed", String(o.dataset.v3 === v)));
    const threads = (v === "connected" || v === "contra");
    plate.classList.toggle("aslist", false);
    plate.classList.toggle("ascontra", false);
    plate.classList.toggle("asthreads", threads);
    if (threads){
      TG.mode = (v === "contra") ? "conf" : "conn";
      document.querySelectorAll('.thmode [data-tm]').forEach(o =>
        o.setAttribute("aria-pressed", String(o.dataset.tm === TG.mode)));
      TG.sel = null;
      renderThreads(); tgBuild(); tgResize();
      const f = document.getElementById("tgfoot");
      if (f) f.textContent = TG.mode === "conf"
        ? "Every pair that pulls against itself. Tap either end to light it up."
        : "Teachings that support, extend or depend on each other. Tap one to light it up.";
    } else {
      resize();
    }
  }
  document.querySelectorAll(".viewseg [data-v3]").forEach(b =>
    b.addEventListener("click", () => setV3(b.dataset.v3)));
  const alb = document.getElementById("aslist");
  if (alb) alb.addEventListener("click", () => {
    const plate = document.querySelector(".plate");
    const on = !plate.classList.contains("aslist");
    plate.classList.toggle("aslist", on);
    plate.classList.toggle("asthreads", false);
    alb.setAttribute("aria-pressed", String(on));
    alb.textContent = on ? "back to the graph" : "as a ranked list";
    if (on) renderList(); else setV3(
      document.querySelector('.viewseg [data-v3][aria-pressed="true"]').dataset.v3);
  });

  // ---- threads: how the teachings hold together, and where they do not ----
  // A thread is a tree, not a list: a teaching that illuminates another can
  // itself be illuminated by a third, and the `adds` line is the toll each
  // level pays -- a link that brings no new idea does not belong on the page.
  const LT = {illustrates:"illustrates", extends:"pushes further", presupposes:"only works if",
              qualifies:"qualifies", tensions_with:"pulls against",
              anchors:"keeps the Aramaic"};
  // What each relation is actually asserting, spelled out. The row shows the
  // short label because it has to fit; the panel has room to say what it means.
  const LTLONG = {
    illustrates:"The second makes the first concrete \u2014 the same point as a story, " +
      "an image or a case rather than a statement.",
    extends:"The second takes the first further than the first goes on its own.",
    presupposes:"The first does not make sense unless the second is true. Remove the " +
      "second and the first becomes unintelligible rather than merely harder.",
    qualifies:"The second narrows, conditions or complicates the first.",
    tensions_with:"The two pull against each other. This is not resolved here, by us " +
      "or by the sources.",
    anchors:"An untranslated Aramaic word survives inside this teaching. That is a " +
      "fact about how the text was carried, not a reading of what it means."};
  const STLONG = {
    textual:"Checkable. You can open the book and verify the claim without trusting us.",
    contested:"We assert this point is argued over among scholars \u2014 and you have " +
      "only our word for that. No citation in this database attaches to a link in " +
      "this layer.",
    ours:"Our own reading. Nothing behind it but judgement."};
  const LK = [];   // every rendered link, so a button can find its own data

  function lkRegister(a, b, l){
    LK.push({a: a, b: b, lt: l.lt, why: l.why, adds: l.adds, st: l.st,
             assoc: l.a, af: l.af, ab: l.ab, sev: l.sev});
    return LK.length - 1;
  }
  function lkButtons(i){
    return '<span class="lpacts">' +
      '<button type="button" class="lpbtn" data-li="' + i + '" data-mode="why">' +
        'Explain connection</button>' +
      '<button type="button" class="lpbtn" data-li="' + i + '" data-mode="quotes">' +
        'Show full quotes</button></span>';
  }

  function closeLinkPanel(){
    document.getElementById("linkpanel").classList.remove("open");
    const sc = document.getElementById("scrim");
    if (sc && !document.getElementById("nodepanel").classList.contains("open"))
      sc.classList.remove("open");
  }
  window.closeLinkPanel = closeLinkPanel;

  function lpHead(L){
    const A = DATA.detail[L.a] || {}, B = DATA.detail[L.b] || {};
    return '<span class="npnav"><button type="button" onclick="closeLinkPanel()">' +
        'close</button></span>' +
      '<h3 class="lph">' + esc(A.title || "") + '</h3>' +
      '<div class="lpvs">' + esc(LT[L.lt] || L.lt) + '</div>' +
      '<h3 class="lph">' + esc(B.title || "") + '</h3>' +
      '<p class="lpwho">' + witBy(L.a) + '<br>' + witBy(L.b) + '</p>';
  }

  function openLinkWhy(L){
    const A = DATA.detail[L.a] || {}, B = DATA.detail[L.b] || {};
    let s = lpHead(L) +
      '<div class="lpsec"><h4>What this relation claims</h4><p>' +
        esc(LTLONG[L.lt] || "") + '</p></div>' +
      '<div class="lpsec"><h4>Why</h4><p>' + esc(L.why || "") + '</p></div>' +
      (L.adds ? '<div class="lpsec"><h4>What it brings that its parent did not</h4><p>' +
        esc(L.adds) + '</p></div>' : '') +
      '<div class="lpsec"><h4>How much weight it carries</h4><p>' +
        esc(STLONG[L.st] || STLONG.ours) + '</p></div>';
    if (L.assoc != null){
      s += '<div class="lpsec"><h4>How far the leap is</h4>' +
        '<p><b>' + L.assoc + ' of 10</b> on the creative-association dial. ' +
        (L.assoc <= 5
          ? 'Computed, not assigned: ' + esc(L.ab || "") + '.'
          : 'Assigned by hand. Levels above 5 are ours \u2014 6 means no editor put ' +
            'these together, 8 that the link runs against the surface of one text, ' +
            '10 that it is a frankly modern reading.') +
        (L.af != null && L.assoc > L.af
          ? ' Raised from a computed floor of ' + L.af + '; judgement may raise this ' +
            'number and may never lower it.'
          : '') + '</p></div>';
    }
    if (L.lt === "tensions_with" && L.sev != null){
      const band = L.sev >= 7 ? "hard to escape" : L.sev >= 4 ? "real"
                 : "dissolves under doubt";
      s += '<div class="lpsec"><h4>How hard this contradiction is to escape</h4>' +
        '<p><b>' + esc(band) + '</b>. Severity comes from the evidence score of the ' +
        'weaker side, scaled by how close the two sit in the text \u2014 a ' +
        'contradiction is only as strong as its weaker half, because that is the ' +
        'half you doubt to make it go away.</p></div>';
    }
    s += '<div class="lpsec"><h4>Open either teaching in full</h4>' +
      '<p><button type="button" class="lpbtn" data-uid="' + L.a + '">' +
        esc(A.title || "") + '</button>' +
      '<button type="button" class="lpbtn" data-uid="' + L.b + '">' +
        esc(B.title || "") + '</button></p></div>';
    return s;
  }

  function lpQuotes(uid){
    const d = DATA.detail[uid] || {};
    const refs = d.refs || [];
    if (!refs.length)
      return '<p class="lpref">No passage text held here.</p>';
    return refs.map(r => {
      const body = (PANEL_LANG === "gr") ? r.gr : r.en;
      return '<div>' +
        '<p class="lpref">' + esc(r.work || "") + ' \u00b7 ' + esc(r.ref || "") + '</p>' +
        (body
          ? '<p class="lpq' + (PANEL_LANG === "gr" ? " grk" : "") + '">' + esc(body) + '</p>'
          : '<p class="lpref">' + (PANEL_LANG === "gr" && r.noGreek
              ? "Absent from the Greek \u2014 a later scribal addition, not in the critical text."
              : "Not held here.") + '</p>') +
      '</div>';
    }).join("");
  }

  function openLinkQuotes(L){
    const A = DATA.detail[L.a] || {}, B = DATA.detail[L.b] || {};
    return lpHead(L) +
      '<div class="lpsec"><h4>Read both sides</h4>' +
        '<div class="langbar"><span class="seg" role="group" aria-label="Language">' +
        '<button type="button" data-lplang="en" aria-pressed="' + (PANEL_LANG==="en") +
          '">English</button>' +
        '<button type="button" data-lplang="gr" aria-pressed="' + (PANEL_LANG==="gr") +
          '">Greek</button></span></div></div>' +
      '<div class="lpsec"><h4>' + esc(A.title || "") + '</h4>' +
        lpQuotes(L.a) + '</div>' +
      '<div class="lpsec"><h4>' + esc(B.title || "") + '</h4>' +
        lpQuotes(L.b) + '</div>';
  }

  let LP_LAST = null;
  function openLink(i, mode){
    const L = LK[i];
    if (!L) return;
    LP_LAST = [i, mode];
    const el = document.getElementById("lpi"), p = document.getElementById("linkpanel");
    el.innerHTML = (mode === "quotes") ? openLinkQuotes(L) : openLinkWhy(L);
    document.getElementById("nodepanel").classList.remove("open");
    p.classList.add("open");
    const sc = document.getElementById("scrim");
    if (sc) sc.classList.add("open");
    el.scrollTop = 0;
  }
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-li]");
    if (b){ openLink(+b.dataset.li, b.dataset.mode); return; }
    const lang = e.target.closest("[data-lplang]");
    if (lang && LP_LAST){
      PANEL_LANG = lang.dataset.lplang;
      openLink(LP_LAST[0], LP_LAST[1]);
      return;
    }
    const u = e.target.closest(".linkpanel [data-uid]");
    if (u){ closeLinkPanel(); openPanel(+u.dataset.uid); }
  });
  // How much weight a link can bear. "checkable" does not mean true -- it means
  // a reader can verify it without trusting us. The default is "our reading",
  // because understating our own authority is the safe failure here.
  // "contested" was printed as though this project knew of a scholarly dispute
  // from a source. It does not: all 96 citations in the database attach to method
  // rules, teaching units or variants, and NOT ONE attaches to a link in this
  // layer. The label now says what it actually is.
  const ST = {textual:"checkable", contested:"disputed \u2014 uncited",
              ours:"our reading"};
  let THSORT = "score";
  // The dial. Every value on it is currently COMPUTED, not assigned -- see the
  // note the page prints under the slider. Hiding a link hides its whole branch:
  // a child you reached through a hidden parent was never on your path.
  let THDIAL = 4;
  let THFOCUS = null;   // a teaching clicked in the graph, or null for all
  // Which works a reader is willing to count. A link is shown only if BOTH of
  // its teachings are carried by at least one selected work -- so switching off
  // John really does remove everything that depends on John, rather than hiding
  // the label and keeping the claim.
  const WORKS = ["Mark","Matthew","Luke","John","Q","Thomas","Paul","other"];
  let SRC = new Set(WORKS);
  function inSrc(uid){
    const w = (DATA.threads.works || {})[uid];
    if (!w || !w.length) return true;          // unscored anchors carry no work
    return w.some(x => SRC.has(x));
  }
  function buildSrcPicker(id, onchange){
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = '<span class="lbl">Count these sources</span>' +
      WORKS.map(w => '<button type="button" class="w" data-w="' + w +
        '" aria-pressed="true">' + w + '</button>').join("") +
      '<div class="note" id="' + id + 'note"></div>';
    el.addEventListener("click", e => {
      const b = e.target.closest("[data-w]"); if (!b) return;
      const on = b.getAttribute("aria-pressed") === "true";
      b.setAttribute("aria-pressed", String(!on));
      if (on) SRC.delete(b.dataset.w); else SRC.add(b.dataset.w);
      document.querySelectorAll('.srcpick [data-w="' + b.dataset.w + '"]')
        .forEach(o => o.setAttribute("aria-pressed", String(!on)));
      onchange();
    });
  }
  function srcNote(id, shown, total){
    const n = document.getElementById(id + "note");
    if (!n) return;
    n.innerHTML = SRC.size === WORKS.length
      ? "All sources counted. Switch one off and everything that depends on it goes " +
        "with it \u2014 both halves of a link have to survive the filter."
      : "<b>" + (WORKS.length - SRC.size) + " source" +
        (WORKS.length - SRC.size === 1 ? "" : "s") + " switched off.</b> Showing " +
        shown + " of " + total + ". A link needs both of its teachings carried by a " +
        "source you still count.";
  }
  // The list under the graph must obey the SAME mode the graph is in. It did
  // not: the toggle redrew the canvas with only tension edges and then called
  // renderThreads(), which pruned by dial and source and nothing else. So you
  // could sit in Contradictions, tap a red node, and get a thread whose first
  // child was "illustrates" -- a supporting connection, in the conflict view.
  // The graph and the list were two views of different things wearing one
  // control.
  function prune(list){
    if (!list) return [];
    // Symmetrical, because the toggle is a filter and says "Show". The graph
    // has always drawn tensions in one mode and everything else in the other;
    // the list now does the same. The strain never disappears from the page --
    // the thread header keeps printing the full "N pull against" count from the
    // unpruned data, so a reader in Supporting connections can still see that a
    // teaching is contested and is one tap from it.
    const conf = (typeof TG !== "undefined" && TG.mode === "conf");
    const wanted = lt => conf ? lt === "tensions_with" : lt !== "tensions_with";
    return list.filter(l => (l.a == null ? 5 : l.a) <= THDIAL && inSrc(l.id)
                            && wanted(l.lt))
               .map(l => Object.assign({}, l, {kids: prune(l.kids)}));
  }
  function countRows(list){
    return (list || []).reduce((n, l) => n + 1 + countRows(l.kids), 0);
  }

  function threadKids(list, depth, parent){
    if (!list || !list.length) return "";
    return '<div class="tkids">' + list.map(l =>
      '<div class="tlink ' + esc(l.lt) + '">' +
        '<span class="tk">' + esc(LT[l.lt] || l.lt) +
          '<span class="tst ' + esc(l.st || "ours") + '">' +
            esc(ST[l.st] || ST.ours) + '</span></span>' +
        '<span class="tn" data-uid="' + l.id + '">' + esc(l.title) +
          '<span class="ths" style="margin-left:.4rem">' + wit(l.refs, l.indep) +
          '</span></span>' +
        '<span class="tw">' + esc(l.why) + '</span>' +
        (l.adds ? '<span class="ta"><b>brings in</b>' + esc(l.adds) + '</span>' : '') +
        (l.ab ? '<span class="tab">association ' + l.a +
          (l.a > l.af ? ' \u2014 raised by hand from ' + l.af + ' (' + esc(l.ab) + ')'
                      : ' \u2014 ' + esc(l.ab)) + '</span>' : '') +
        lkButtons(lkRegister(parent, l.id, l)) +
        threadKids(l.kids, depth + 1, l.id) +
      '</div>').join("") + '</div>';
  }

  // The eleventh rung is NOT a higher association. It is a different category:
  // pairs the vocabulary offered, that were examined and thrown away. They live
  // in the register of verdicts, never in the link table, so they cannot be
  // counted among the 608, cannot enter the graph, and cannot register as a
  // contradiction. Wenzl asked for them because they are poetic, and they are --
  // which is exactly the danger, so each one is shown WITH the word that fooled
  // the search and the reason it means nothing.
  function renderCoincidences(el){
    const C = (DATA.threads && DATA.threads.coinc) || [];
    el.innerHTML =
      '<div class="conote"><b>These are not connections.</b> They are ' + C.length +
      ' pairs the search proposed because the two teachings share a rare word \u2014 ' +
      'and the word means something different in each place. Every one was examined ' +
      'and rejected. None is counted anywhere else on this page.<br><br>' +
      'They are here because a coincidence often reads better than a real finding, ' +
      'and that is worth seeing rather than hiding.</div>' +
      C.map(c =>
        '<div class="coinc">' +
          '<div class="coh"><span class="cot">' + esc(c.a) + '</span>' +
          '<span class="cox">&#8212;</span>' +
          '<span class="cot">' + esc(c.b) + '</span></div>' +
          '<div class="cow">' + esc(c.w) + '</div>' +
          (c.why ? '<div class="cowy">' + esc(c.why) + '</div>' : '') +
        '</div>').join("");
    const dc = document.getElementById("dialcnt");
    if (dc) dc.textContent = C.length + " coincidences \u00b7 0 links";
    const say = document.getElementById("dialsay");
    if (say) say.innerHTML = 'Past the end of the dial. Nothing here is a claim ' +
      'about the texts \u2014 these are the near-misses the method threw out, kept ' +
      'so the rejections are as visible as the findings.';
  }

  // Clicking a teaching in the graph opens its thread in the same bottom sheet
  // the rest of the page uses, instead of replacing the graph with a list. The
  // graph keeps its place and shows what was selected; the sheet carries the
  // reading. Wenzl asked for this after the old behaviour scrolled the canvas
  // off the screen, which made the graph look like it had disappeared.
  function tgClear(){
    TG.sel = null;
    tgDraw();
    const p = document.getElementById("linkpanel");
    if (p) p.classList.remove("open");
    const sc = document.getElementById("scrim");
    if (sc) sc.classList.remove("open");
    const f = document.getElementById("tgfoot");
    if (f) f.textContent = TG.mode === "conf"
      ? "Every pair that pulls against itself. Tap either end to light it up."
      : "Teachings that support, extend or depend on each other. Tap one to light it up.";
  }

  function openThreadSheet(uid, label){
    const T = DATA.threads;
    const root = (T.roots || []).find(r => r.id === uid);
    const el = document.getElementById("lpi"), p = document.getElementById("linkpanel");
    if (!el || !p) return;
    // the graph knows the label of whatever was clicked, which is the only
    // source that works for a node that is neither a root nor in a conflict
    const title = (root && root.title) || label ||
                  (T.contra || []).reduce((n, c) =>
                    n || (c.a === uid ? c.at : c.b === uid ? c.bt : null), null);
    const w = witOf(uid);
    const head =
      '<div class="lph"><span class="lpk">' +
        (TG.mode === "conf" ? "Contradictions" : "Supporting connections") +
      '</span><h3>' + esc(title || "This teaching") + '</h3>' +
      '<div class="lpw">' + wit(w && w.r, w && w.i) + '</div></div>';

    if (TG.mode === "conf"){
      // Conflicts do NOT live in the thread tree -- a teaching can appear in the
      // conflict graph and have no tension among its own children, which is why
      // this sheet came up empty the first time. The authoritative list is
      // DATA.threads.contra, which also carries the severity and both sides.
      const mine = (T.contra || []).filter(c => c.a === uid || c.b === uid);
      el.innerHTML = head + (mine.length
        ? mine.map(c => {
            const meA = c.a === uid;
            const ot = meA ? c.bt : c.at, oi = meA ? c.b : c.a;
            const ow = witOf(oi);
            return '<div class="cfrow">' +
              '<div class="cfh"><span class="cfs" style="background:' +
                (meA ? SIDE[1] : SIDE[2]) + '"></span>' +
              '<span class="cfn" data-uid="' + oi + '">' + esc(ot) + '</span>' +
              '<span class="cfw">' + wit(ow && ow.r, ow && ow.i) + '</span></div>' +
              '<p class="cfy">' + esc(c.why) + '</p>' +
              (c.adds ? '<p class="cfa">' + esc(c.adds) + '</p>' : '') +
              '<div class="cfm">' + esc(c.ab || "") +
                (c.sev != null ? ' \u00b7 severity ' + c.sev : '') + '</div>' +
            '</div>';
          }).join("")
        : '<div class="lph">No contradiction recorded for this teaching.</div>');
    } else {
      // A node in the graph is not necessarily a ROOT -- it can appear only as
      // somebody else's child, and asking T.roots for it then returns nothing.
      // That produced an empty sheet titled "This teaching". Walk every tree and
      // collect the edges that actually touch this teaching, in both directions.
      const out = root ? prune(root.links) : [];
      const inc = [];
      const seen = new Set();
      (function walk(list, parent, ptitle){
        (list || []).forEach(l => {
          if (l.id === uid && !seen.has(parent + ">" + l.lt)){
            seen.add(parent + ">" + l.lt);
            inc.push({id: parent, title: ptitle, lt: l.lt, st: l.st,
                      a: l.a, why: l.why, adds: l.adds});
          }
          walk(l.kids, l.id, l.title);
        });
      })(null, null, null);
      (T.roots || []).forEach(r => {
        (function walk(list, parent, ptitle){
          (list || []).forEach(l => {
            if (l.id === uid){
              const k = parent + ">" + l.lt;
              if (!seen.has(k)){ seen.add(k);
                inc.push({id: parent, title: ptitle, lt: l.lt, st: l.st, a: l.a}); }
            }
            walk(l.kids, l.id, l.title);
          });
        })(r.links, r.id, r.title);
      });
      const back = inc.filter(l => (l.a == null ? 5 : l.a) <= THDIAL
                                   && l.lt !== "tensions_with" && inSrc(l.id));
      el.innerHTML = head +
        (root && root.core ? '<p class="thc">' + esc(root.core) + '</p>' : '') +
        (out.length ? threadKids(out, 0, uid) : "") +
        (back.length
          ? '<div class="lpk" style="padding:.7rem 0 .2rem">Reached from</div>' +
            threadKids(back, 0, uid)
          : "") +
        ((out.length || back.length) ? ""
          : '<div class="lph">Nothing at this setting. Turn the dial up.</div>');
    }
    document.getElementById("nodepanel").classList.remove("open");
    p.classList.add("open");
    const sc = document.getElementById("scrim");
    if (sc) sc.classList.add("open");
    el.scrollTop = 0;
  }

  function renderThreads(){
    const el = document.getElementById("threadrows");
    const T = DATA.threads;
    if (!el || !T || !T.roots) return;
    if (THDIAL >= 11){ renderCoincidences(el); return; }
    const order = (THSORT === "conn") ? T.byConn : T.byScore;
    const byId = {}; T.roots.forEach(r => byId[r.id] = r);
    LK.length = 0;
    const shown = order.map(id => byId[id]).filter(Boolean)
      .filter(t => inSrc(t.id))
      .map(t => Object.assign({}, t, {links: prune(t.links)}))
      .filter(t => t.links.length);
    srcNote("thsrc", shown.length, T.roots.length);
    const focused = THFOCUS != null ? shown.filter(t => t.id === THFOCUS) : shown;
    el.innerHTML = (focused.length ? focused : shown).map(t =>
      '<div class="thread" data-root="' + t.id + '">' +
        '<div class="thh"><span class="ths">' + wit(t.refs, t.indep) + '</span>' +
          '<span class="tht" data-uid="' + t.id + '">' + esc(t.title) + '</span>' +
          '<span class="tdeg">' + t.deg + ' connection' + (t.deg === 1 ? '' : 's') +
            (t.reach > t.links.length ? ' \u00b7 ' + t.reach + ' teachings in this thread' : '') +
            (t.tens ? '<b class="tstr"> \u00b7 ' + t.tens + ' pull against</b>' : '') +
          '</span></div>' +
        (t.core ? '<p class="thc">' + esc(t.core) + '</p>' : '') +
        threadKids(t.links, 0, t.id) +
      '</div>').join("") ||
      '<div style="padding:1.2rem;color:var(--plate-ink-2)">' +
      ((typeof TG !== "undefined" && TG.mode === "conf")
        ? 'No contradictions at this setting. Turn the dial up, or switch to ' +
          'supporting connections.'
        : 'Nothing at this setting. Turn the dial up.') + '</div>';
    const rows = shown.reduce((n, t) => n + countRows(t.links), 0);
    const dc = document.getElementById("dialcnt");
    if (dc) dc.textContent = shown.length + " threads \u00b7 " + rows + " links";
    const n = document.getElementById("thn");
    if (n) n.textContent = T.roots.length + " threads";
    const say = document.getElementById("dialsay"), A = T.assoc || {};
    if (say){
      const upto = Object.keys(A).reduce(
        (s, k) => s + (+k <= THDIAL ? A[k] : 0), 0);
      say.innerHTML = 'Showing <b>' + upto + ' of ' + T.edges + '</b> links. ' +
        (THDIAL >= (T.maxAssoc + 1)
          ? 'Nothing exists above <b>' + T.maxAssoc + '</b> yet.'
          : '<b>' + (T.edges - (T.handRaised||0)) + ' of ' + T.edges +
            '</b> values here are <b>computed, not assigned</b> \u2014 verse ' +
            'distance, shared distinctive Greek, and form. ' +
            (T.handRaised ? 'The other ' + T.handRaised + ' were raised above their ' +
              'computed floor by hand. None has ever been lowered, and each row says ' +
              'which floor it overrode.'
             : 'No link has been moved by hand at all yet.')) +
        '<br><br><b>This dial was tested, and it held.</b> The constants behind it ' +
        '\u2014 what counts as adjacent, where the wording cutoffs sit \u2014 were ' +
        'chosen by judgement, so they were perturbed across seven alternatives to see ' +
        'whether the answers moved. Worst case, <b>84% of links kept their exact ' +
        'level and 97% kept their band</b>. The contradiction severity failed the same ' +
        'test at 54% and was reduced to three bands as a result. ' +
        '<b>Correction, one day later:</b> this page previously explained that ' +
        'difference by saying the dial rests on a discrete fact and discrete measures ' +
        'survive being nudged. That was a generalisation from two cases and the first ' +
        'time it was used to predict anything it was wrong. The real property is ' +
        'measurable: how much of the data sits near a decision boundary. Severity has ' +
        '<b>48%</b> of its values close enough to a band edge to fall either way; this ' +
        'dial has almost none, because adjacent passages are typically a verse apart ' +
        'and everything else is in a different chapter. That is a number you can ' +
        'compute before trusting a scale, rather than a category you assign after.' +
        '<br><br><b>The dial is easier on the canon.</b> Links between two canonical ' +
        'teachings average a floor of 0.9; links touching a non-canonical work average ' +
        '1.8. Some of that is real \u2014 two sayings in one gospel chapter can be ' +
        'adjacent and a Thomas saying never can. Some of it is not: works cited by ' +
        'section rather than by verse, with no Greek held here, are invisible to both ' +
        'measures, and those rows now say <i>cannot be measured</i> rather than ' +
        'claiming we looked and found nothing.' +
        (THDIAL >= 6 ? '<br><br>Above 5 the values are <b>assigned, not computed</b>, ' +
          'and each level states what it asks you to grant: <b>6</b> no editor put ' +
          'these together but they answer the same question &middot; <b>7</b> you must ' +
          'accept a reading of one before the link works &middot; <b>8</b> it runs ' +
          'against the surface of one of the texts &middot; <b>9</b> it reaches into a ' +
          'situation the sources never address &middot; <b>10</b> a frankly modern ' +
          'reading, ours and nobody else\u2019s.' : '');
    }
    const s = document.getElementById("thstat"), S = T.standing || {};
    if (s && T.edges){
      const p = k => Math.round(100 * (S[k] || 0) / T.edges);
      s.innerHTML = 'Of the <b>' + T.edges + ' links</b> here, <b>' + p("textual") +
        '%</b> rest on something you can check in the text or the manuscripts &mdash; ' +
        'where a gospel places an episode, whether a word is there at all. <b>' +
        p("contested") + '%</b> state a live scholarly disagreement. The remaining <b>' +
        p("ours") + '%</b> are this project&rsquo;s own readings, with nothing behind ' +
        'them but judgement. Every row says which, so you never have to guess. ' +
        '<b>The middle label was audited and renamed.</b> It used to read simply ' +
        '&ldquo;contested&rdquo;, which a reader would take to mean this project knows ' +
        'of a scholarly disagreement from a source. It does not. All 96 citations in ' +
        'the database attach to method rules, teaching units or variants, and not one ' +
        'attaches to a link in this layer. Five rows also carried the label while ' +
        'claiming no dispute at all, and have been reclassified. The remaining nine say ' +
        '<i>disputed &mdash; uncited</i>, which is the honest version: we are asserting ' +
        'the point is argued over, and you have only our word for that. ' +
        '<b>The reason there were no citations turned out to be worse than the ' +
        'absence.</b> There was no way to add one: nothing in the schema let a source ' +
        'attach to a link in this layer, so a contributor holding the right book open ' +
        'had nowhere to put the page. That path has now been built and left empty, ' +
        'which is the same posture as the zero page-verified citations elsewhere on ' +
        'this page \u2014 the field exists, the count is published, and the zero is a ' +
        'state rather than a missing feature. ' +
        '<b>That label was audited and nine rows were wrong.</b> A link marked ' +
        'checkable is supposed to name something you can open a book and verify; ' +
        'nine of them turned out to be readings that had inherited the label from a ' +
        'batch default rather than earning it one at a time. They have been moved to ' +
        'our reading, which cost this page the milestone it reported yesterday \u2014 ' +
        'checkable had just overtaken our own readings, and after the correction it ' +
        'has not. Seven more were genuinely checkable but named no source, so a reader ' +
        'had nowhere to look; those now name the book. ' +
        'The audit was then run in the opposite direction, since checking only ' +
        'whether a label was too generous finds only generous labels: <b>two rows ' +
        'were too modest</b> and have been promoted. Nine wrong one way, two the ' +
        'other. The lesson is not that the conservative default worked \u2014 it is ' +
        'that a safe default protects nothing when it is overridden in batches, ' +
        'which is exactly how all nine happened. ' +
        'That label and the dial answer different questions and will often disagree: ' +
        'the dial measures how close the two passages sit in the text, the label ' +
        'measures whether our claim ABOUT them is checkable. Two sayings can be ' +
        'four verses apart and what we say connects them still be a reading.';
    }
  }
  (function(){
    const d = document.getElementById("dial");
    if (!d) return;
    d.addEventListener("input", () => {
      THDIAL = +d.value;
      document.getElementById("dialval").textContent = d.value;
      renderThreads(); tgBuild(); tgResize();
    });
  })();
  document.querySelectorAll('.thsort [data-sort]').forEach(b => {
    b.addEventListener("click", () => {
      THSORT = b.dataset.sort;
      document.querySelectorAll('.thsort [data-sort]').forEach(o =>
        o.setAttribute("aria-pressed", String(o === b)));
      renderThreads();
      document.getElementById("threadrows").parentElement.scrollTop = 0;
    });
  });
  document.getElementById("threadrows").addEventListener("click", e => {
    const n = e.target.closest("[data-uid]");
    if (n) openPanel(+n.dataset.uid);
  });
  window.refreshThreads = renderThreads;

  /* ---- the thread graph -------------------------------------------------
     Wenzl, 2026-09-10: threads should open on a knowledge graph, with one view
     for connections and one for conflicts, and the creative-association dial
     should visibly grow it.

     Two decisions worth recording. There are no tangled edge lines between
     unrelated clusters -- the old graph drew every edge at once and it read as
     noise; here an edge is drawn only between two teachings that are actually
     linked at the current dial setting, and the two modes never mix. And in
     conflict mode the two ends of a clash are painted red and green with no
     verdict attached: the SAME teaching is red in one conflict and green in
     another, because neither colour means "the right one".                  */
  const TG = {cv:null, ctx:null, nodes:[], links:[], mode:"conn", alpha:1,
              view:{s:1,x:0,y:0,init:false}, hover:null, dpr:1, W:0, H:0};

  function tgBuild(){
    const T = DATA.threads; if (!T) return;
    const nodeOf = {}, nodes = [], links = [];
    const add = id => {
      if (nodeOf[id] != null) return nodeOf[id];
      const d = DATA.detail[id] || {};
      const w = witOf(id) || {r:0, i:0};
      nodeOf[id] = nodes.length;
      nodes.push({id:id, label:d.title || "", r:0, deg:0, w:w,
                  x:(Math.cos(nodes.length*2.399963)*(40+(nodes.length%70)*3.4)),
                  y:(Math.sin(nodes.length*2.399963)*(30+(nodes.length%70)*2.6)),
                  vx:0, vy:0, side:0});
      return nodeOf[id];
    };
    const want = lt => TG.mode === "conf" ? lt === "tensions_with"
                                          : lt !== "tensions_with";
    const seen = new Set();
    const push = (a, b, lt, assoc) => {
      if (!want(lt)) return;
      if ((assoc == null ? 5 : assoc) > THDIAL) return;
      if (!inSrc(a) || !inSrc(b)) return;
      const k = a < b ? a + ":" + b : b + ":" + a;
      if (seen.has(k)) return; seen.add(k);
      const i = add(a), j = add(b);
      links.push({s:i, t:j, lt:lt});
      nodes[i].deg++; nodes[j].deg++;
      if (TG.mode === "conf"){ nodes[i].side = 1; nodes[j].side = 2; }
    };
    (T.roots || []).forEach(rt => {
      const walk = (parent, list) => (list || []).forEach(l => {
        push(parent, l.id, l.lt, l.a); walk(l.id, l.kids);
      });
      walk(rt.id, rt.links);
    });
    nodes.forEach(n => { n.r = 3.4 + Math.sqrt(n.deg || 1) * 2.8; });
    TG.nodes = nodes; TG.links = links; TG.alpha = 1; TG.view.init = false;
    const m = document.getElementById("thmn");
    if (m) m.textContent = nodes.length + " teachings \u00b7 " + links.length +
      (TG.mode === "conf" ? " conflicts" : " connections");
  }

  function tgResize(){
    const cv = TG.cv; if (!cv) return;
    TG.dpr = Math.min(window.devicePixelRatio || 1, 2);
    TG.W = cv.clientWidth;
    TG.H = Math.round(cv.getBoundingClientRect().height) || 420;
    cv.width = Math.round(TG.W * TG.dpr); cv.height = Math.round(TG.H * TG.dpr);
    TG.view.init = false;
  }

  function tgTick(){
    if (TG.alpha > 0.004) TG.alpha *= 0.991;
    const k = TG.alpha, N = TG.nodes;
    for (let i = 0; i < N.length; i++){
      for (let j = i + 1; j < N.length; j++){
        const a = N[i], b = N[j];
        let dx = b.x - a.x, dy = b.y - a.y, d2 = dx*dx + dy*dy || 0.01;
        const pad = a.r + b.r + 26;
        if (d2 < pad*pad){
          const d = Math.sqrt(d2), f = (pad - d) / d * 0.5 * k;
          dx *= f; dy *= f; a.x -= dx; a.y -= dy; b.x += dx; b.y += dy;
        }
      }
    }
    TG.links.forEach(l => {
      const a = N[l.s], b = N[l.t];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx*dx + dy*dy) || 1;
      const f = (d - 96) / d * 0.045 * k;
      a.x += dx*f; a.y += dy*f; b.x -= dx*f; b.y -= dy*f;
    });
    N.forEach(n => { n.x *= 1 - 0.004*k; n.y *= 1 - 0.004*k; });
  }

  const SIDE = {1:"#E07A61", 2:"#7CC8A8"};
  function tgDraw(){
    const ctx = TG.ctx; if (!ctx) return;
    const N = TG.nodes, v = TG.view;
    ctx.save(); ctx.scale(TG.dpr, TG.dpr);
    ctx.clearRect(0, 0, TG.W, TG.H);
    if (!N.length){
      ctx.fillStyle = "#8A8172";
      ctx.font = '13px "IBM Plex Sans",sans-serif';
      ctx.textAlign = "center";
      ctx.fillText("Nothing at this setting. Turn the dial up.", TG.W/2, TG.H/2);
      ctx.restore(); return;
    }
    if (!v.init){
      let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
      N.forEach(n => { x0=Math.min(x0,n.x-n.r); x1=Math.max(x1,n.x+n.r);
                       y0=Math.min(y0,n.y-n.r); y1=Math.max(y1,n.y+n.r); });
      const m=26, bw=Math.max(1,x1-x0), bh=Math.max(1,y1-y0);
      v.s = Math.min((TG.W-m*2)/bw, (TG.H-m*2)/bh, 1.7);
      v.x = TG.W/2 - ((x0+x1)/2)*v.s; v.y = TG.H/2 - ((y0+y1)/2)*v.s;
      v.init = true;
    }
    ctx.translate(v.x, v.y); ctx.scale(v.s, v.s);
    ctx.lineWidth = 1/v.s;
    // Selecting a teaching used to replace the graph with a list -- the click
    // scrolled the chosen thread to the top of the window and the canvas went
    // off screen. The graph now STAYS and answers the click: everything the
    // selected teaching touches lights up, everything else recedes, and the
    // thread itself opens in the sheet at the bottom.
    const sel = TG.sel;
    const near = new Set();
    if (sel != null){
      near.add(sel);
      TG.links.forEach(l => {
        if (N[l.s].id === sel) near.add(N[l.t].id);
        if (N[l.t].id === sel) near.add(N[l.s].id);
      });
    }
    const on = n => sel == null || near.has(n.id);
    TG.links.forEach(l => {
      const a=N[l.s], b=N[l.t];
      const lit = sel == null || a.id === sel || b.id === sel;
      ctx.strokeStyle = TG.mode === "conf"
        ? (lit ? "rgba(224,122,97,.85)" : "rgba(224,122,97,.07)")
        : (lit ? "rgba(124,156,232,.75)" : "rgba(124,156,232,.06)");
      ctx.lineWidth = (lit && sel != null ? 2 : 1)/v.s;
      ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
    });
    ctx.lineWidth = 1/v.s;
    N.forEach(n => {
      ctx.globalAlpha = on(n) ? 1 : 0.13;
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, 6.2832);
      ctx.fillStyle = TG.mode === "conf" ? (SIDE[n.side] || "#8A8172")
                                         : bandOf(null, n.id).col;
      ctx.fill();
      if (n.id === sel){
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 5/v.s, 0, 6.2832);
        ctx.strokeStyle = "#F2E4B0"; ctx.lineWidth = 2/v.s; ctx.stroke();
        ctx.lineWidth = 1/v.s;
      }
      if (TG.hover === n){
        ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 4/v.s, 0, 6.2832);
        ctx.strokeStyle = "#F2E4B0"; ctx.lineWidth = 2/v.s; ctx.stroke();
        ctx.lineWidth = 1/v.s;
      }
    });
    ctx.globalAlpha = 1;
    if (TG.hover){
      const n = TG.hover;
      ctx.font = (12/v.s) + 'px "IBM Plex Sans",sans-serif';
      ctx.textAlign = "center";
      const tw = ctx.measureText(n.label).width, ty = n.y - n.r - 9/v.s;
      ctx.fillStyle = "rgba(23,19,15,.88)";
      ctx.fillRect(n.x - tw/2 - 5/v.s, ty - 12/v.s, tw + 10/v.s, 17/v.s);
      ctx.fillStyle = "#F2E4B0"; ctx.fillText(n.label, n.x, ty);
    }
    ctx.restore();
  }

  function tgAt(mx, my){
    const v = TG.view;
    const x = (mx - v.x)/v.s, y = (my - v.y)/v.s;
    let best = null, bd = Infinity;
    TG.nodes.forEach(n => {
      const dx = n.x-x, dy = n.y-y, d = dx*dx + dy*dy;
      const rr = Math.max(n.r + 4, 9/v.s);
      if (d < rr*rr && d < bd){ bd = d; best = n; }
    });
    return best;
  }

  function tgInit(){
    TG.cv = document.getElementById("tg");
    if (!TG.cv) return;
    TG.ctx = TG.cv.getContext("2d");
    tgResize(); tgBuild();
    window.addEventListener("resize", tgResize);
    TG.cv.addEventListener("mousemove", e => {
      const r = TG.cv.getBoundingClientRect();
      TG.hover = tgAt(e.clientX - r.left, e.clientY - r.top);
      TG.cv.style.cursor = TG.hover ? "pointer" : "default";
    });
    TG.cv.addEventListener("mouseleave", () => { TG.hover = null; });
    TG.cv.addEventListener("click", e => {
      const r = TG.cv.getBoundingClientRect();
      const n = tgAt(e.clientX - r.left, e.clientY - r.top);
      if (!n){ tgClear(); return; }
      TG.sel = n.id;
      openThreadSheet(n.id, n.label);
      tgDraw();
      const f = document.getElementById("tgfoot");
      if (f) f.innerHTML = '<b>' + esc(n.label) + '</b> is lit, with everything ' +
        'it touches. ' +
        '<button type="button" class="lpbtn" id="tgall">clear</button>';
    });
    // exposed so the layout can be driven and verified when the tab is not
    // painting (a hidden tab pauses requestAnimationFrame entirely)
    window.tgFrame = (n) => { for (let i=0;i<(n||1);i++){ tgTick(); } tgDraw(); };
    window.tgState = () => ({nodes:TG.nodes.length, links:TG.links.length,
                             mode:TG.mode, w:TG.W, h:TG.H});
    (function loop(){ tgTick(); tgDraw(); requestAnimationFrame(loop); })();
  }
  document.querySelectorAll('.thmode [data-tm]').forEach(b => {
    b.addEventListener("click", () => {
      TG.mode = b.dataset.tm;
      document.querySelectorAll('.thmode [data-tm]').forEach(o =>
        o.setAttribute("aria-pressed", String(o === b)));
      tgBuild(); tgResize();
      THFOCUS = null; renderThreads();
      const f = document.getElementById("tgfoot");
      if (f) f.textContent = TG.mode === "conf"
        ? "Every pair that pulls against itself. The two ends of a clash are red and green \u2014 the same teaching is red in one conflict and green in another, so neither colour means the right one. Tap either to open the thread."
        : "Teachings that support, extend or depend on each other. Tap one to open its thread.";
    });
  });
  document.addEventListener("click", e => {
    if (e.target && e.target.id === "tgall"){
      tgClear();
      const f = document.getElementById("tgfoot");
      if (f) f.textContent = "Tap a teaching to open its thread.";
    }
  });

  // ---- contradictions: the same tensions, pulled out and ranked -------------
  // Three stops, not ten. The 1-10 number was audited a phase after it shipped:
  // perturbing the proximity constants -- which were chosen by feel -- moves 46%
  // of the exact numbers and swaps two to four of the "top ten". Bands hold at
  // 81%. The digit is kept for thresholding and demoted to the small print; the
  // band is what gets published, because the band is what the data supports.
  let CXDIAL = 1;
  function cxTier(s){ return s >= 7 ? 3 : s >= 4 ? 2 : 1; }
  function cxBand(s){
    return s >= 7 ? "hard to escape" : s >= 4 ? "real" : "dissolves under doubt";
  }
  const CXLABEL = {1:"everything", 2:"real and above", 3:"hard to escape only"};
  function renderContra(){
    const el = document.getElementById("cxrows");
    const C = (DATA.threads && DATA.threads.contra) || [];
    if (!el) return;
    LK.length = 0;
    const rows = C.filter(x => cxTier(x.sev) >= CXDIAL && inSrc(x.a) && inSrc(x.b));
    el.innerHTML = rows.map(x =>
      '<div class="cxrow">' +
        '<div class="cxh"><span class="cxs">' + esc(cxBand(x.sev)) + '</span>' +
          '<span class="tst ' + esc(x.st || "ours") + '">' +
            esc(ST[x.st] || ST.ours) + '</span></div>' +
        '<div class="cxpair">' +
          '<div class="cxside"><span class="n">' + wit(x.ar, x.ai) + '</span>' +
            '<span class="t" data-uid="' + x.a + '">' + esc(x.at) + '</span></div>' +
          '<div class="cxvs">pulls against</div>' +
          '<div class="cxside"><span class="n">' + wit(x.br, x.bi) + '</span>' +
            '<span class="t" data-uid="' + x.b + '">' + esc(x.bt) + '</span></div>' +
        '</div>' +
        '<p class="cxwhy">' + esc(x.why) + '</p>' +
        (x.adds ? '<p class="cxadds"><b>brings in</b>' + esc(x.adds) + '</p>' : '') +
        '<p class="cxbasis">weaker side, ' + (x.ai <= x.bi ? x.ai : x.bi) +
          ' independent' +
          (x.ab ? ' \u00b7 ' + esc(x.ab) : '') +
          '</p>' +
        lkButtons(lkRegister(x.a, x.b,
          {lt:'tensions_with', why:x.why, adds:x.adds, st:x.st,
           a:x.assoc, af:null, ab:x.ab, sev:x.sev})) +
      '</div>').join("") ||
      '<div style="padding:1.2rem;color:var(--plate-ink-2)">Nothing this severe. ' +
      'Turn the dial down.</div>';
    const c = document.getElementById("cxcnt");
    if (c) c.textContent = rows.length + " of " + C.length;
    const s = document.getElementById("cxsay");
    if (s) s.innerHTML =
      'Severity is <b>computed, not assigned</b>: the evidence score of the ' +
      '<i>weaker</i> side, scaled by how close the two sit in the text. A ' +
      'contradiction is only as strong as its weaker half, because that is the half ' +
      'you doubt to make it go away \u2014 and a clash inside one chapter cannot be ' +
      'blamed on two communities. Judgement may only lower a severity, never raise ' +
      'it, since overstating incoherence is the failure this scale can produce. ' +
      '<b>One number still runs underneath this page.</b> The 0\u201310 evidence ' +
      'score has been removed from every row in favour of counting witnesses, but ' +
      'the severity bands are still computed from it, because how hard a ' +
      'contradiction is to escape depends on how well attested its weaker side is ' +
      'and a raw count cannot tell you that. It is no longer displayed; it is not ' +
      'gone.' +
      '<br><br><b>Three bands, not ten points.</b> This scale shipped as a 1\u201310 ' +
      'number and was audited a day later. Perturbing the distance constants \u2014 ' +
      'which were chosen by feel \u2014 across four plausible alternatives moves 46% ' +
      'of the exact numbers and swaps two to four of what it calls the ten hardest. ' +
      'Bands survive the same test at 81%. So the digit is kept for filtering, ' +
      'printed small and marked approximate, and the band is what is claimed.';
    srcNote("cxsrc", rows.length, C.length);
  }
  document.getElementById("cxrows").addEventListener("click", e => {
    const n = e.target.closest("[data-uid]"); if (n) openPanel(+n.dataset.uid);
  });
  (function(){
    const d = document.getElementById("cxdial");
    if (!d) return;
    d.addEventListener("input", () => {
      CXDIAL = +d.value;
      document.getElementById("cxval").textContent = CXLABEL[CXDIAL];
      renderContra();
    });
  })();
  buildSrcPicker("thsrc", () => { renderThreads(); renderContra(); tgBuild(); });
  buildSrcPicker("cxsrc", () => { renderThreads(); renderContra(); });
  tgInit();

  document.querySelectorAll(".seg [data-lane]").forEach(b => {
    b.addEventListener("click", () => {
      document.querySelectorAll(".seg [data-lane]").forEach(o => o.setAttribute("aria-pressed", String(o === b)));
      lane = b.dataset.lane; hot = null; show(null); build();
      if (window.refreshList) window.refreshList();
    });
  });

  function resize(){
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    // Read the height CSS actually rendered. Hardcoding it here once disagreed
    // with the stylesheet and the browser stretched the drawing, turning every
    // circle into an ellipse. One source of truth only.
    W = cv.clientWidth;
    H = Math.round(cv.getBoundingClientRect().height) || 560;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    view.init = false;   // refit the camera to the new frame
  }
  // the detail panel drives the selection so you can see what you opened
  window.selectGraphNode = function(uid){
    selected = nodes.find(n => n.type === "unit" && n.full && n.full.id === uid) || null;
    resize();
  };
  window.clearGraphNode = function(){ selected = null; resize(); };
  window.addEventListener("resize", resize);
  resize(); build();
  (function loop(){ tick(); draw(); requestAnimationFrame(loop); })();
})();

/* == 2. ladder ========================================= */
(function(){
  const el = document.getElementById("ladder");
  const rows = DATA.units.filter(u => u.rel != null).sort((a,b) => b.rel - a.rel).slice(0,24);
  el.innerHTML = rows.map(u => {
    const sub = (u.substrate_confidence && u.substrate_confidence !== "unreviewed")
      ? '<span class="chip sub">substrate ' + esc(String(u.substrate_confidence).split(";")[0].slice(0,14)) + '</span>' : "";
    const evt = u.lane === "event_story" ? '<span class="chip evt">event</span>' : "";
    return '<button class="rung" type="button" data-uid="' + u.id + '">' +
      '<span class="name"><span class="t">' + esc(u.title) + '</span>' +
        '<span class="tags"><span class="chip">' + esc(u.unit_type) + '</span>' + evt + sub +
        '<span class="open">open \u2192</span></span></span>' +
      '<span class="track">' +
        '<span class="rel" style="width:' + (u.rel*100).toFixed(1) + '%"></span></span>' +
      '<span class="nums"><b>' + pct(u.rel) + '</b></span>' +
      '</button>';
  }).join("");
  el.addEventListener("click", e => {
    const b = e.target.closest(".rung");
    if (b && b.dataset.uid) openPanel(+b.dataset.uid);
  });
})();

/* == 3. slope chart ==================================== */
(function(){
  const cv = document.getElementById("slope"), ctx = cv.getContext("2d");
  const rows = DATA.units.filter(u => u.rel != null)
    .map(u => ({...u, d: u.rel - u.probability_score}))
    .sort((a,b) => a.d - b.d).slice(0,11);

  function css(v){ return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }

  function draw(){
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = cv.clientWidth, H = 420;
    cv.width = W*dpr; cv.height = H*dpr; cv.style.height = H+"px";
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,W,H);

    const ink = css("--ink"), ink2 = css("--ink-2"), ink3 = css("--ink-3"),
          lapis = css("--lapis"), minium = css("--minium"), rule = css("--rule");

    const narrow = W < 620;
    const padT = 18, padB = 26;
    const xL = narrow ? 46 : 210, xR = W - (narrow ? 46 : 210);
    const lo = 0.35, hi = 0.95;
    const Y = v => padT + (1 - (v - lo)/(hi - lo)) * (H - padT - padB);

    // axes
    ctx.strokeStyle = rule; ctx.lineWidth = 1;
    [xL, xR].forEach(x => { ctx.beginPath(); ctx.moveTo(x, padT-6); ctx.lineTo(x, H-padB+6); ctx.stroke(); });

    ctx.font = "500 10px 'IBM Plex Mono', monospace";
    ctx.fillStyle = ink3;
    for (let v = 0.4; v <= 0.9001; v += 0.1){
      const y = Y(v);
      ctx.strokeStyle = rule; ctx.globalAlpha = .5;
      ctx.beginPath(); ctx.moveTo(xL, y); ctx.lineTo(xR, y); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = ink3;
      const lw = ctx.measureText(v.toFixed(1)).width + 8;
      ctx.fillStyle = css("--surface");
      ctx.fillRect((xL+xR)/2 - lw/2, y - 6, lw, 12);
      ctx.fillStyle = ink3;
      ctx.fillText(v.toFixed(1), (xL+xR)/2, y);
    }

    // slopes first, so labels and dots sit on top
    rows.forEach(u => {
      ctx.strokeStyle = minium; ctx.globalAlpha = .5; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(xL, Y(u.probability_score)); ctx.lineTo(xR, Y(u.rel)); ctx.stroke();
    });
    ctx.globalAlpha = 1;

    // many teachings share a score, so labels must be pushed apart to stay readable
    function declutter(items, gap, top, bot){
      items.sort((a,b) => a.y - b.y);
      items.forEach(it => { it.ly = it.y; });
      for (let i = 1; i < items.length; i++)
        if (items[i].ly - items[i-1].ly < gap) items[i].ly = items[i-1].ly + gap;
      const over = items[items.length-1].ly - bot;
      if (over > 0) items.forEach(it => { it.ly -= over; });
      if (items[0].ly < top){ const d = top - items[0].ly; items.forEach(it => { it.ly += d; }); }
      return items;
    }

    const left  = rows.map(u => ({ y: Y(u.probability_score), u }));
    const right = rows.map(u => ({ y: Y(u.rel), u }));
    if (!narrow){
      declutter(left, 14, padT + 4, H - padB - 4);
      declutter(right, 14, padT + 4, H - padB - 4);
    }

    rows.forEach(u => {
      ctx.fillStyle = lapis;
      ctx.beginPath(); ctx.arc(xL, Y(u.probability_score), 3.4, 0, 6.2832); ctx.fill();
      ctx.fillStyle = minium;
      ctx.beginPath(); ctx.arc(xR, Y(u.rel), 3.4, 0, 6.2832); ctx.fill();
    });

    if (!narrow){
      ctx.textBaseline = "middle";
      ctx.strokeStyle = rule; ctx.lineWidth = 1;
      left.forEach(it => {
        ctx.beginPath(); ctx.moveTo(xL - 6, it.y); ctx.lineTo(xL - 12, it.ly); ctx.stroke();
        ctx.font = "400 12px 'EB Garamond', Georgia, serif";
        ctx.fillStyle = ink; ctx.textAlign = "right";
        const t = it.u.title;
        ctx.fillText(t.length > 30 ? t.slice(0,29) + "\u2026" : t, xL - 15, it.ly);
      });
      right.forEach(it => {
        ctx.beginPath(); ctx.moveTo(xR + 6, it.y); ctx.lineTo(xR + 12, it.ly); ctx.stroke();
        ctx.font = "500 11px 'IBM Plex Mono', monospace";
        ctx.fillStyle = ink2; ctx.textAlign = "left";
        ctx.fillText(it.u.rel.toFixed(2) + "   " + it.u.d.toFixed(2), xR + 15, it.ly);
      });
    }

    ctx.font = "600 9.5px 'IBM Plex Sans', sans-serif";
    ctx.fillStyle = ink3; ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";  ctx.fillText("RAW", xL - (narrow?0:36), H - 8);
    ctx.textAlign = "right"; ctx.fillText("WEIGHTED", xR + (narrow?0:36), H - 8);
  }
  window.addEventListener("resize", draw);
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", draw);
  draw();
  document.fonts && document.fonts.ready.then(draw);
})();

/* == 4. streams table ================================== */
(function(){
  const agg = {};
  DATA.att.forEach(a => {
    const g = agg[a.work_id] || (agg[a.work_id] = {n:0, w:0});
    g.n++; g.w += (a.independence_weight || 0);
  });
  const rows = Object.entries(agg).map(([wid,g]) => ({ w: DATA.works[wid], n: g.n, ind: g.w/g.n }))
    .sort((a,b) => b.n - a.n);
  const max = rows[0].n;
  document.getElementById("streams").innerHTML = rows.map(r =>
    '<tr><td class="w">' + esc(r.w.title) + '</td>' +
    '<td class="num" style="text-align:left">' + r.w.date_min + '\u2013' + r.w.date_max + '</td>' +
    '<td><span class="chip">' + esc(r.w.canonical_status) + '</span></td>' +
    '<td class="num"><span class="bar-mini" style="width:' + Math.max(2,(r.n/max)*70).toFixed(0) + 'px"></span>' + r.n + '</td>' +
    '<td class="num">' + r.ind.toFixed(2) + '</td></tr>'
  ).join("");
})();

/* == 4b. redaction pairs =============================== */
(function(){
  const row = document.getElementById("deprow"), box = document.getElementById("pairs");
  if (!box || !DATA.pairs) return;
  const ORDER = ["likely_dependent","possibly_dependent","unresolved","reception_echo",
                 "possibly_independent","likely_independent"];
  row.innerHTML = ORDER.filter(k => DATA.depcounts[k]).map((k,i) =>
    '<span class="dep d' + ORDER.indexOf(k) + '"><b>' + DATA.depcounts[k] + '</b>' +
    '<span>' + esc(k.replace(/_/g," ")) + '</span></span>').join("");
  box.innerHTML = DATA.pairs.map(p =>
    '<div class="pair">' +
      '<div class="ph"><span class="dchip ' + esc(p.dep) + '">' + esc(p.dep.replace(/_/g," ")) + '</span>' +
        '<span class="arrow">' + esc(p.a) + ' \u2192 ' + esc(p.b) + '</span>' +
        '<span class="u">' + esc(p.unit) + '</span></div>' +
      (p.ao ? '<p class="chg">' + esc(p.ao) + '</p>' : '') +
      '<p class="sh">' + esc(p.shift) + '</p>' +
    '</div>').join("");
})();

/* == 2a. coverage gaps ================================= */
(function(){
  const el = document.getElementById("gaps2");
  if (!el || !DATA.gaps) return;
  el.innerHTML = DATA.gaps.map(g =>
    '<div class="gp"><span class="gt">' + esc(g.title) + '</span>' +
    '<span class="gr">' + esc(g.refs) + '</span>' +
    '<span class="chip">' + esc(g.streams) + '</span>' +
    '<span class="gn">' + esc(g.note) + '</span></div>').join("");
})();

/* == 2b. attribution risk ============================== */
(function(){
  const el = document.getElementById("arisk");
  if (!el || !DATA.ar) return;
  el.innerHTML = DATA.ar.map(r =>
    '<div class="ar">' +
      '<div class="arh"><span class="rst ' + esc(r.st) + '">' + esc(r.st.replace(/_/g," ")) + '</span>' +
        (r.rk ? '<span class="rk">ranked <b>#' + r.rk + '</b> \u00b7 ' + pct(r.sc) + '</span>' : '') +
        '<span class="un">' + esc(r.unit || r.slug) + '</span>' +
        '<span class="chip">' + esc(r.rt.replace(/_/g," ")) + '</span></div>' +
      '<p class="obs">' + esc(r.obs) + '</p>' +
      '<p class="inf">' + esc(r.inf) + '</p>' +
    '</div>').join("");
})();

/* == 2c. formula versions, flags, registry ============= */
(function(){
  const vt = document.getElementById("vers");
  if (vt && DATA.vers) vt.innerHTML = DATA.vers.map(v =>
    '<tr class="' + (v.win ? 'win' : '') + '"><td class="mono">' + esc(v.v) + '</td>' +
    '<td>' + esc(v.note) + '</td>' +
    '<td class="n' + (v.floor ? ' worse' : '') + '">' + v.floor + '</td>' +
    '<td class="n' + (v.floor ? ' worse' : '') + '">' + v.res + '</td></tr>').join("");
  const ef = document.getElementById("eflags");
  if (ef && DATA.eflags) ef.innerHTML = DATA.eflags.map(f =>
    '<span class="ef"><b>' + f.n + '</b><span>' + esc(f.ft.replace(/_/g," ")) +
    '</span><b style="opacity:.6">\u2212' + f.sev.toFixed(2) + '</b></span>').join("");
  const rg = document.getElementById("reg");
  if (rg && DATA.reg) rg.innerHTML = DATA.reg.map(r =>
    '<div class="regrow"><div class="rh"><span class="stat ' + esc(r.status) + '">' +
      esc(r.status.replace(/_/g," ")) + '</span>' +
      '<span class="rn">' + esc(r.score_name) + '</span></div>' +
    '<p>' + esc(r.ruling) + '</p></div>').join("");
})();

/* == 3a. score audit =================================== */
(function(){
  const el = document.getElementById("sq");
  if (!el || !DATA.sq) return;
  ["sagree","slo","shi"].forEach((k,i) => {
    const n = document.getElementById(k);
    if (n) n.textContent = [DATA.sagree, DATA.slo, DATA.shi][i];
  });
  el.innerHTML = DATA.sq.map(r => {
    const dir = r.dir === "formula_lower" ? "lower" : "higher";
    return '<div class="sr">' +
      '<span class="arrow ' + dir + '"><span class="hs">' + r.h.toFixed(2) + '</span> \u2192 ' +
        '<span class="cs">' + r.cs.toFixed(2) + '</span></span>' +
      '<span class="su">' + esc(r.unit) + '</span>' +
      '<span class="sc">' + esc(r.cause) + '</span>' +
      '<span class="sx">' + esc(r.expl) + '</span>' +
    '</div>';
  }).join("");
})();

/* == 3b. abba ========================================== */
(function(){
  const el = document.getElementById("abba");
  if (!el || !DATA.abba) return;
  el.innerHTML = DATA.abba.map(f => {
    const refs = f.cites.map(ct =>
      '<span class="b ' + esc(ct.stance) + '" title="' + esc(ct.claim_summary || "") + '"><i></i>' +
      esc(surnameOf(ct.author)) + " " + ct.year + '</span>').join("");
    return '<div class="af">' +
      '<div class="ah"><span class="cf ' + esc(f.conf) + '">' + esc(f.conf) + '</span>' +
        '<span class="al">' + esc(f.lbl) + '</span>' +
        (f.gk ? '<span class="ag">' + esc(f.gk) + '</span>' : '') + '</div>' +
      '<p class="aw">' + esc(f.why) + '</p>' +
      (f.lim ? '<p class="alim">' + esc(f.lim) + '</p>' : '') +
      '<div class="refs rc">' + refs + '</div></div>';
  }).join("");
  function surnameOf(a){
    const p = a.split(/ and |,/)[0].trim().split(/\s+/);
    while (p.length > 1 && /^(Jr\.?|Sr\.?|I{1,3}|IV)$/i.test(p[p.length-1])) p.pop();
    return p[p.length-1];
  }
})();

/* == 4a. bundle audit ================================== */
(function(){
  const box = document.getElementById("bundles");
  if (!box || !DATA.uc) return;
  document.getElementById("ucb").textContent = DATA.ucb;
  document.getElementById("uci").textContent = DATA.uci;
  box.innerHTML = DATA.uc.map(u =>
    '<div class="bundle">' +
      '<div class="bh"><span class="ctype ' + esc(u.ct) + '">' + esc(u.ct.replace(/_/g," ")) + '</span>' +
        '<span class="bt">' + esc(u.unit) + '</span>' +
        '<span class="cnt">' + u.wb + ' works bundled \u2192 <b>' + u.ind +
          (u.ind === 1 ? ' stream' : ' streams') + '</b></span></div>' +
      '<p class="best">best single saying: ' + esc(u.best) + '</p>' +
      '<p class="nt">' + esc(u.note) + '</p>' +
      '<p class="act">' + esc(u.act) + '</p>' +
    '</div>').join("");
})();

/* == 4c. version readings ============================== */
(function(){
  const tb = document.getElementById("vrows");
  if (!tb || !DATA.vr) return;
  tb.innerHTML = DATA.vr.map(v =>
    '<tr><td class="num" style="text-align:left">' + esc(v.loc) + '</td>' +
    '<td class="w">' + esc(v.ms) + '</td>' +
    '<td class="num" style="text-align:left">' + v.d1 + (v.d2 !== v.d1 ? '\u2013' + v.d2 : '') + '</td>' +
    '<td><span class="rt ' + esc(v.rt) + '">' + esc(v.rt.replace(/_/g," ")) + '</span></td>' +
    '<td style="font-size:.95rem">' + esc(v.rs) + '</td></tr>').join("");
  const n = document.getElementById("vqnote");
  if (n) n.textContent = "Plus " + DATA.vq + " substrate-control questions queued against Kiraz's " +
    "Comparative Edition \u2014 written as questions, not readings, because nobody has opened that volume yet.";
})();

/* == 5. bibliography lanes ============================= */
(function(){
  const el = document.getElementById("lanes");
  if (!el || !DATA.lanes) return;
  const max = Math.max(...DATA.lanes.map(l => l.n));
  const NAME = {"greek-text":"Greek text & textual criticism","substrate":"Aramaic / Semitic substrate",
    "method":"Method & criteria","tradition":"Q, Synoptic problem, Thomas","context":"Second Temple Judaism",
    "versions":"Ancient versions","commentary":"Commentaries","parables":"Parables",
    "reference":"Lexica & reference","orality":"Orality & memory","reception":"Early reception"};
  el.innerHTML = DATA.lanes.map(l =>
    '<div class="lanerow"><span class="ln">' + esc(NAME[l.lane] || l.lane) + '</span>' +
    '<span class="lc">' + l.n + '</span>' +
    '<span class="lb"><i style="width:' + ((l.n/max)*100).toFixed(0) + '%"></i></span></div>').join("");
})();

/* == 6. substrate feature explorer ===================== */
(function(){
  const list = document.getElementById("featlist"), detail = document.getElementById("featdetail");
  if (!list || !DATA.feats) return;
  const F = DATA.feats;

  list.innerHTML = F.map((f,i) =>
    '<button class="expitem" role="option" data-i="' + i + '" aria-selected="' + (i===0) + '">' +
      '<span class="fl">' + esc(f.feature_label) + '</span>' +
      '<span class="fm"><span class="cf ' + esc(f.confidence) + '">' + esc(f.confidence) + '</span>' +
        '<span class="chip">' + esc(f.feature_type.replace(/_/g," ")) + '</span>' +
        '<span class="chip">' + f.cites.length + ' cited</span></span>' +
    '</button>').join("");

  function show(i){
    const f = F[i];
    const cites = f.cites.map(ct => {
      const ref = esc(ct.author) + ', <em>' + esc(ct.title) + '</em> (' + ct.year + ')';
      return '<div class="cite">' +
        '<span class="st ' + esc(ct.stance) + '">' + esc(ct.stance) + '</span>' +
        '<span class="ref">' + ref + '</span>' +
        '<span class="cl">' + esc(ct.claim_summary || "") + '</span></div>';
    }).join("");
    detail.innerHTML =
      '<h3>' + esc(f.feature_label) + '</h3>' +
      (f.greek_anchor ? '<p class="anchor">' + esc(f.greek_anchor) +
        (f.proposed_sem_form ? '  \u2190  ' + esc(f.proposed_sem_form) : '') + '</p>' : '') +
      '<p class="why">' + esc(f.confidence_reason || "") + '</p>' +
      (f.limits_note ? '<p class="limit"><strong>Limit.</strong> ' + esc(f.limits_note) + '</p>' : '') +
      '<div class="citelist">' + cites + '</div>';
  }
  list.addEventListener("click", e => {
    const b = e.target.closest(".expitem"); if (!b) return;
    list.querySelectorAll(".expitem").forEach(o => o.setAttribute("aria-selected", String(o === b)));
    show(+b.dataset.i);
  });
  show(0);
})();

/* == 7. method rules =================================== */
(function(){
  // "Dale C. Allison Jr." must render as Allison, not Jr.
  function surname(a){
    const p = a.split(/ and |,/)[0].trim().split(/\s+/);
    while (p.length > 1 && /^(Jr\.?|Sr\.?|I{1,3}|IV)$/i.test(p[p.length-1])) p.pop();
    return p[p.length-1];
  }
  const el = document.getElementById("rules");
  if (!el || !DATA.rules) return;
  el.innerHTML = DATA.rules.map(r => {
    const risk = r.cites.some(c => c.stance === "opposes");
    const bits = r.cites.map(c =>
      '<span class="b ' + esc(c.stance) + '" title="' + esc(c.note || "") + '"><i></i>' +
      esc(surname(c.author)) + " " + c.year + '</span>').join("");
    return '<div class="rule-card' + (risk ? ' risk' : '') + '">' +
      '<div class="slug">' + esc(r.slug) + '</div>' +
      '<p class="claim">' + esc(r.claim) + '</p>' +
      '<div class="rc">' + bits + '</div></div>';
  }).join("");
})();

/* == where to actually read the text ==================
   Nothing is stored here. These point outward: public-domain English,
   the open Greek, and for non-canonical works the standard free editions.
   All targets checked 2026-09-07. */
// Keyed on BOTH the full work title and the shortened display name, because refs
// carry the display form ("Thomas") while the database holds "Gospel of Thomas".
// Keying only one way silently produced dead ends on six of eleven works.
const ECW = {
  "Gospel of Thomas":"thomas", "Thomas":"thomas",
  "Didache":"didache",
  "Gospel of Peter":"gospelpeter", "Peter":"gospelpeter",
  "Gospel of Mary":"gospelmary", "Mary":"gospelmary",
  "Gospel of the Hebrews / Nazoreans / Ebionites":"gospelhebrews",
  "the Hebrews / Nazoreans / Ebionites":"gospelhebrews",
  "Infancy Gospel of Thomas":"infancythomas", "Infancy Thomas":"infancythomas",
  "Protoevangelium of James":"infancyjames",
  "Josephus":"josephus", "Tacitus Annals":"tacitus",
  "Nag Hammadi Library":"__nag__"
};
// The Nag Hammadi rows are two distinct texts, so route on the reference itself.
function nagSlug(ref){
  const r = (ref || "").toLowerCase();
  if (r.indexOf("dialogue") !== -1) return "dialoguesavior";
  if (r.indexOf("great seth") !== -1 || r.indexOf("second treatise") !== -1) return "greatseth";
  return null;
}
const CANON = ["Mark","Matthew","Luke","John","Pauline letters","Letter of James"];
function readLinks(work, ref){
  const out = [];
  if (!ref) return out;
  const short = work.replace(/^Gospel of /,"");
  if (/^Q\b|hypothesis/i.test(work))
    return [{label:"reconstruction \u2014 no manuscript exists", url:null}];
  if (CANON.some(w => short.indexOf(w) === 0 || work.indexOf(w) === 0)){
    out.push({label:"read (public domain)",
      url:"https://www.biblegateway.com/passage/?search=" + encodeURIComponent(ref) + "&version=WEB"});
    const g = ref.replace(/\s+/,".").replace(/:/g,".");
    out.push({label:"Greek (SBLGNT)", url:"https://www.stepbible.org/?q=version=SBLG|reference=" + encodeURIComponent(g)});
  } else if (ECW[work]) {
    const slug = (ECW[work] === "__nag__") ? nagSlug(ref) : ECW[work];
    if (slug) out.push({label:"read (free edition)",
      url:"https://www.earlychristianwritings.com/" + slug + ".html"});
  }
  return out;
}

/* == node detail panel ================================= */
let PANEL_LANG = "en", PANEL_ID = null;
// Stepping follows the ranking you are looking at, so arrows move the way the eye does.
function panelOrder(){
  const plate = document.querySelector(".plate");
  const lane = document.querySelector('.seg [data-lane][aria-pressed="true"]');
  const laneV = lane ? lane.dataset.lane : "teaching";
  return DATA.units
    .filter(u => laneV === "all" || u.lane === laneV)
    .sort((a,b) => (b.rel||0) - (a.rel||0))
    .map(u => u.id);
}
function stepPanel(delta){
  const order = panelOrder(), i = order.indexOf(PANEL_ID);
  if (i < 0) return;
  const j = i + delta;
  if (j < 0 || j >= order.length) return;
  openPanel(order[j]);
}
function openPanel(id){
  if (window.closeLinkPanel) window.closeLinkPanel();
  PANEL_ID = id;
  const d = DATA.detail && DATA.detail[id];
  const el = document.getElementById("npi"), p = document.getElementById("nodepanel"),
        sc = document.getElementById("scrim");
  if (!d || !el) return;
  const chip = t => '<span class="chip">' + esc(t) + '</span>';
  const order = panelOrder(), pos = order.indexOf(id);
  let html = '<span class="npnav">' +
      '<button type="button" data-step="-1"' + (pos <= 0 ? ' disabled' : '') + ' title="Previous (\u2190)">\u2190</button>' +
      '<span class="pos">' + (pos >= 0 ? (pos + 1) + " / " + order.length : "") + '</span>' +
      '<button type="button" data-step="1"' + (pos < 0 || pos >= order.length - 1 ? ' disabled' : '') + ' title="Next (\u2192)">\u2192</button>' +
      '<button type="button" onclick="closePanel()">close</button>' +
    '</span>' +
    '<h3 class="nph">' + esc(d.title) + '</h3>' +
    '<div class="npmeta">' + chip(d.type.replace(/_/g," ")) +
      (d.band ? chip(d.band) : '') +
      (d.streams ? chip(d.streams.split(", ").length + " stream" + (d.streams.split(", ").length>1?"s":"")) : '') +
    '</div>';

  {
    const nrefs = (d.refs || []).length;
    html += '<div class="npscore"><b>' + nrefs + '</b>' +
      '<span>' + (nrefs === 1 ? 'source carries this' : 'sources carry this') +
      (d.streams ? '<br>' + d.streams.split(", ").length + ' independent \u00b7 ' +
        esc(d.streams) : '') + '</span></div>';
  }

  if (d.core)
    html += '<div class="npsec"><h4>What it says</h4><p class="npbody">' + esc(d.core) + '</p></div>';

  if (d.refs && d.refs.length){
    html += '<div class="npsec"><h4>Where it appears &mdash; ' + d.refs.length + ' witness' +
      (d.refs.length>1?'es':'') + '</h4>' +
      '<div class="langbar"><span class="seg" role="group" aria-label="Language">' +
        '<button type="button" data-lang="en" aria-pressed="' + (PANEL_LANG==="en") + '">English</button>' +
        '<button type="button" data-lang="gr" aria-pressed="' + (PANEL_LANG==="gr") + '">Greek</button>' +
      '</span></div>';
    d.refs.forEach(r => {
      const links = readLinks(r.work, r.ref).map(l => l.url
        ? '<a href="' + l.url + '" target="_blank" rel="noopener noreferrer">' + esc(l.label) + ' \u2197</a>'
        : '<span style="color:var(--ink-3)">' + esc(l.label) + '</span>').join(' <span style="color:var(--rule)">\u00b7</span> ');
      const body = (PANEL_LANG === "gr") ? r.gr : r.en;
      let textHtml = "";
      const more = (PANEL_LANG === "gr") ? r.gr_more : r.en_more;
      if (body){
        textHtml = '<div class="scripture' + (PANEL_LANG === "gr" ? " grk" : "") + '"><p>' +
          esc(body).replace(/(^|\s)(\d+)\s/g, '$1<span class="vn">$2</span> ') +
          (more ? ' <span style="color:var(--minium)">\u2026</span></p>' +
                  '<p class="srcnote" style="margin-top:.5rem">This passage is long and only its ' +
                  'opening is shown. Use the link below for the rest \u2014 nothing is hidden, it is ' +
                  'just not readable in a panel this size.</p>'
                : '</p>') + '</div>';
      } else if (PANEL_LANG === "gr" && r.noGreek){
        textHtml = '<p class="nogreek"><strong>Absent from the Greek.</strong> This verse does not ' +
          'appear in Nestle 1904 at all. It is a later scribal addition, carried by some English ' +
          'Bibles but not present in the critical text. The silence is the evidence.</p>';
      } else if (!body){
        const hasLink = links && links.indexOf("href") !== -1;
        textHtml = '<p class="npmissing">' + (hasLink
          ? 'Not held here \u2014 this work is outside the public-domain Bible text, so the link below opens it at a free edition.'
          : 'No public-domain text held, and no free edition to point at. Q is a reconstruction, so there is no manuscript to read.')
          + '</p>';
      }
      html += '<div class="npref"><span class="w">' + esc(r.work) + '</span>' +
        '<span class="r">' + esc(r.ref || "") + '</span>' +
        '<span class="dt">c.' + esc(r.d) + ' CE</span>' +
        '<span class="ly">' + esc(r.layer || "") +
        (r.iw != null ? ' \u00b7 independence ' + r.iw.toFixed(2) : '') + '</span>' +
        (textHtml ? '<span class="ly" style="grid-column:1/-1">' + textHtml + '</span>' : '') +
        (links ? '<span class="ly npl">' + links + '</span>' : '') + '</div>';
    });
    const tts = [...new Set(d.refs.map(x => x.tt).filter(Boolean))];
    html += '<p class="srcnote">' + (tts.length ? esc(tts.join(" \u00b7 ")) : "") +
      (d.refs.some(x => x.gr) ? ' \u00b7 Greek: Nestle 1904 (public domain)' : '') +
      '<br>All texts here are public domain. None carries usage restrictions.</p></div>';
  }

  if (d.expl)
    html += '<div class="npsec"><h4>How the score was reached</h4><p class="npexpl">' + esc(d.expl) + '</p></div>';

  if (d.sub && d.sub.length){
    html += '<div class="npsec"><h4>Semitic fingerprints</h4>';
    d.sub.forEach(s => {
      html += '<p class="npbody" style="margin-bottom:.3rem"><span class="cf ' + esc(s.c) + '">' +
        esc(s.c) + '</span> ' + esc(s.l) + (s.g ? ' <span class="mono" style="color:var(--lapis)">' +
        esc(s.g) + '</span>' : '') + '</p>';
      if (s.why) html += '<p class="npbody" style="font-size:.93rem;margin-bottom:.4rem">' + esc(s.why) + '</p>';
      if (s.lim) html += '<p class="npwarn">' + esc(s.lim) + '</p>';
      if (s.src && s.src.length) html += s.src.map(x =>
        '<div class="srcline"><span class="st ' + esc(x.st) + '">' + esc(x.st) + '</span>' +
        '<span class="sa">' + esc(x.a) + ', <em>' + esc(x.t) + '</em> (' + x.y + ')</span>' +
        (x.cl ? '<span class="sc2">' + esc(x.cl) + '</span>' : '') + '</div>').join("");
    });
    html += '</div>';
  }

  if (d.red && d.red.length){
    html += '<div class="npsec"><h4>What later writers did to it</h4>';
    d.red.forEach(r => {
      html += '<p class="npbody" style="margin-bottom:.3rem"><span class="dchip ' + esc(r.dep) + '">' +
        esc(r.dep.replace(/_/g," ")) + '</span> <span class="mono">' + esc(r.a) + ' \u2192 ' +
        esc(r.b) + '</span></p>' +
        (r.ao ? '<p class="npexpl" style="color:var(--minium);margin-bottom:.3rem">' + esc(r.ao) + '</p>' : '') +
        '<p class="npbody" style="font-size:.94rem;margin-bottom:.7rem">' + esc(r.sh) + '</p>';
    });
    html += '</div>';
  }

  if (d.flags && d.flags.length){
    html += '<div class="npsec"><h4>Late-expansion flags</h4>';
    d.flags.forEach(f => html += '<p class="npwarn"><strong>' + esc(f.f.replace(/_/g," ")) +
      '</strong> (\u2212' + f.s.toFixed(2) + '). ' + esc(f.r) + '</p>');
    html += '</div>';
  }

  if (d.risk)
    html += '<div class="npsec"><h4>Is it his, or was it just everywhere?</h4>' +
      '<p class="npnote">' + esc(d.risk.o) + '</p>' +
      '<p class="npwarn">' + esc(d.risk.i) + '</p></div>';

  if (d.comp){
    html += '<div class="npsec"><h4>Is this one teaching, or several?</h4>' +
      '<p class="npbody"><span class="ctype ' + esc(d.comp.ct) + '">' + esc(d.comp.ct.replace(/_/g," ")) +
      '</span> <span class="mono" style="font-size:.85rem">' + d.comp.wb + ' works bundled \u2192 ' +
      d.comp.i + (d.comp.i === 1 ? ' stream' : ' streams') + '</span></p>' +
      (d.comp.best ? '<p class="npexpl">best single saying: ' + esc(d.comp.best) + '</p>' : '') +
      '<p class="npbody" style="font-size:.94rem">' + esc(d.comp.note) + '</p>' +
      (d.comp.act ? '<p class="npnote">' + esc(d.comp.act) + '</p>' : '') + '</div>';
  }

  if (d.cites && d.cites.length){
    html += '<div class="npsec"><h4>What scholars say about this one</h4>' +
      d.cites.map(x => '<div class="srcline"><span class="st ' + esc(x.st) + '">' + esc(x.st) + '</span>' +
        '<span class="sa">' + esc(x.a) + ', <em>' + esc(x.t) + '</em> (' + x.y + ')</span>' +
        (x.cl ? '<span class="sc2">' + esc(x.cl) + '</span>' : '') + '</div>').join("") + '</div>';
  }

  if (d.rel && d.rel.length){
    html += '<div class="npsec"><h4>Related teachings &mdash; ' + d.rel.length + '</h4>' +
      d.rel.map(r => '<button class="relbtn" type="button" data-goto="' + r.id + '">' +
        '<span class="rr">' + esc(r.rel.replace(/_/g," ")) + (r.dir === "from" ? " \u2190" : " \u2192") + '</span>' +
        '<span class="rt">' + esc(r.title) + '</span>' +
        (r.n ? '<span class="rn">' + esc(r.n) + '</span>' : '') + '</button>').join("") + '</div>';
  }

  if (d.tags && d.tags.length)
    html += '<div class="npsec"><h4>Themes</h4><div class="tagrow">' +
      d.tags.filter(Boolean).map(t => '<span class="chip">' + esc(t.trim()) + '</span>').join("") + '</div></div>';

  if (d.notes)
    html += '<div class="npsec"><h4>Notes</h4><p class="npbody" style="font-size:.94rem">' +
      esc(d.notes) + '</p></div>';

  el.innerHTML = html;
  el.querySelectorAll("[data-goto]").forEach(b =>
    b.addEventListener("click", () => openPanel(+b.dataset.goto)));
  el.querySelectorAll("[data-step]").forEach(b =>
    b.addEventListener("click", () => stepPanel(+b.dataset.step)));
  el.querySelectorAll("[data-lang]").forEach(b =>
    b.addEventListener("click", () => {
      PANEL_LANG = b.dataset.lang;
      const keep = p.scrollTop;
      openPanel(PANEL_ID);
      p.scrollTop = keep;
    }));
  p.classList.add("open"); sc.classList.add("open");
  p.scrollTop = 0;
  if (window.selectGraphNode) window.selectGraphNode(id);

  // On a phone the sheet occupies the lower half. Shrink the graph and scroll it
  // into the upper half so you can still see what you tapped.
  if (window.matchMedia("(max-width:899px)").matches){
    const plate = document.querySelector(".plate");
    const alreadyOpen = p.classList.contains("open") && plate && plate.classList.contains("lifted");
    if (plate && !alreadyOpen){
      plate.classList.add("lifted");
      // Resizing the canvas reflows the page underneath a smooth scroll, which
      // silently loses it. Jump instantly, after layout, and re-assert twice.
      const settle = () => {
        const top = plate.getBoundingClientRect().top + window.scrollY - 8;
        if (Math.abs(window.scrollY - top) > 2) window.scrollTo({ top, behavior: "auto" });
      };
      requestAnimationFrame(() => requestAnimationFrame(settle));
      setTimeout(settle, 140);
      setTimeout(settle, 360);
    }
  }
}
function closePanel(){
  if (window.closeLinkPanel) window.closeLinkPanel();
  document.getElementById("nodepanel").classList.remove("open");
  document.getElementById("scrim").classList.remove("open");
  const plate = document.querySelector(".plate");
  if (plate) plate.classList.remove("lifted");
  if (window.clearGraphNode) window.clearGraphNode();
}
document.addEventListener("keydown", e => {
  if (e.key === "Escape") { closePanel(); return; }
  const open = document.getElementById("nodepanel").classList.contains("open");
  if (!open || /^(INPUT|TEXTAREA)$/.test((e.target.tagName || ""))) return;
  if (e.key === "ArrowLeft")  { e.preventDefault(); stepPanel(-1); }
  if (e.key === "ArrowRight") { e.preventDefault(); stepPanel(1); }
});
document.addEventListener("DOMContentLoaded", () => {
  const s = document.getElementById("scrim");
  if (s) s.addEventListener("click", closePanel);
});

// Scores are shown out of 100 for legibility. They are NOT probabilities --
// see the note under the ladder.
function out10(x){ return (x == null) ? "\u2014" : Math.max(1, Math.min(10, Math.round(x * 10))); }
// Wenzl, 2026-09-10: the headline number is now a count of witnesses. `wit()`
// renders it; `pct()` survives only where a 0-10 value is genuinely still meant
// (the contradiction severity engine), and nowhere on a teaching row.
//
// Raw references first because they are concrete and you can click them. The
// independent count beside them because four gospels copying Mark is not four
// witnesses -- which is the argument the front page of this site opens with, and
// a headline that contradicted it would have been the worst possible change.
function witOf(idOrObj){
  const W = (DATA.threads && DATA.threads.wit) || {};
  if (typeof idOrObj === "number") return W[idOrObj] || null;
  const u = idOrObj;
  if (!u) return null;
  if (u.id != null && W[u.id]) return W[u.id];
  const r = (u.refs != null) ? u.refs : u.ar, i = (u.indep != null) ? u.indep : u.ai;
  return (r == null) ? null : {r: r, i: i};
}
function witBy(id){ const w = witOf(id); return wit(w && w.r, w && w.i); }
function wit(r, i){
  if (r == null) return '<span class="wnone">no source held</span>';
  return '<b class="wn">' + r + '</b> reference' + (r === 1 ? '' : 's') +
    (i != null ? '<span class="wi"> \u00b7 ' + i + ' independent</span>' : '');
}
// a unit with no computed score is not "\u2014 out of 10" — it is unscored.
// The Aramaic anchors are deliberately unscored: they sit on a different ladder.
function pct(x){ return (x == null) ? "unscored" : out10(x) + "/10"; }

function esc(s){ return String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }
