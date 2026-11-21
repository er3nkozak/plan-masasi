import { initStore, COLLECTIONS } from "./store.js";

/* ================= Yardımcılar ================= */
const TR_M = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];
const TR_D = ["Pazartesi","Salı","Çarşamba","Perşembe","Cuma","Cumartesi","Pazar"];
const TR_DS = ["Pzt","Sal","Çar","Per","Cum","Cmt","Paz"];
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const parse = (s) => { const [a, b, c] = s.split("-").map(Number); return new Date(a, b - 1, c); };
const addDays = (d, n) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; };
const dow = (d) => (d.getDay() + 6) % 7; // Pazartesi = 0
const weekStart = (d) => addDays(d, -dow(d));
const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
const toMin = (s) => { const [h, m] = s.split(":").map(Number); return h * 60 + (m || 0); };
function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const n = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - n);
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return { y: t.getUTCFullYear(), w: Math.ceil(((t - y) / 864e5 + 1) / 7) };
}
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const $ = (id) => document.getElementById(id);
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const today = () => iso(new Date());
const FALL = "#7A8597";

/* ================= Durum ================= */
const state = {
  view: "hafta", cursor: new Date(),
  items: {}, projects: {}, types: {}, goals: {}, settings: {},
  loaded: new Set(), user: null,
};
let store = null;

const sortedProjects = () => Object.entries(state.projects).sort((a, b) => (a[1].order || 0) - (b[1].order || 0));
const sortedTypes = () => Object.entries(state.types).sort((a, b) => (a[1].order || 0) - (b[1].order || 0));
const projOf = (it) => state.projects[it.project] || { name: "Projesiz", color: FALL };
const isRec = (it) => !!(it && it.repeat && it.repeat.freq);
const timeLabel = (it) => (it.allDay || !it.start ? "Tüm gün" : it.start + (it.end ? "–" + it.end : ""));

function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 2800);
}

function put(col, id, data) {
  if (data === null) delete state[col][id]; else state[col][id] = data;
  render();
  store.put(col, id, data).catch((e) => { console.error(e); toast("Kaydedilemedi. İnternet bağlantını kontrol et."); });
}

/* ================= Tekrarlar ================= */
// Bir tarih aralığındaki tüm iş görünümleri (tekrarlar açılmış halde)
function occ(from, to) {
  const out = [];
  for (const [id, it] of Object.entries(state.items)) {
    if (!it.date) continue;
    if (!isRec(it)) {
      if (it.date >= from && it.date <= to) out.push({ id, it, date: it.date, done: !!it.done, rec: false });
      continue;
    }
    const r = it.repeat;
    const s = it.date > from ? it.date : from;
    const e = r.until && r.until < to ? r.until : to;
    if (s > e) continue;
    const base = parse(it.date), end = parse(e);
    const days = r.freq === "weekdays" && r.days && r.days.length ? r.days : [dow(base)];
    for (let d = parse(s); d <= end; d = addDays(d, 1)) {
      let ok = false;
      if (r.freq === "daily") ok = true;
      else if (r.freq === "weekdays") ok = days.includes(dow(d));
      else if (r.freq === "weekly") ok = dow(d) === dow(base);
      else if (r.freq === "monthly") ok = d.getDate() === base.getDate();
      const k = iso(d);
      if (ok && !(it.skip && it.skip[k])) out.push({ id, it, date: k, done: !!(it.doneDates && it.doneDates[k]), rec: true });
    }
  }
  out.sort((a, b) => a.date.localeCompare(b.date)
    || ((a.it.allDay || !a.it.start) === (b.it.allDay || !b.it.start) ? 0 : (a.it.allDay || !a.it.start) ? -1 : 1)
    || (a.it.start || "").localeCompare(b.it.start || "")
    || (a.it.title || "").localeCompare(b.it.title || "", "tr"));
  return out;
}
const groupByDate = (list) => { const m = {}; list.forEach((o) => (m[o.date] = m[o.date] || []).push(o)); return m; };

/* ================= Dönem ================= */
function range(view = state.view, c = state.cursor) {
  if (view === "gun") { const s = iso(c); return { from: s, to: s }; }
  if (view === "hafta") { const s = weekStart(c); return { from: iso(s), to: iso(addDays(s, 6)) }; }
  if (view === "ay") return { from: iso(new Date(c.getFullYear(), c.getMonth(), 1)), to: iso(new Date(c.getFullYear(), c.getMonth() + 1, 0)) };
  return { from: c.getFullYear() + "-01-01", to: c.getFullYear() + "-12-31" };
}
function periodKey(view = state.view, c = state.cursor) {
  if (view === "gun") return "d-" + iso(c);
  if (view === "hafta") { const w = isoWeek(c); return "w-" + w.y + "-" + pad(w.w); }
  if (view === "ay") return "m-" + c.getFullYear() + "-" + pad(c.getMonth() + 1);
  return "y-" + c.getFullYear();
}
function pace(done, target, from, to) {
  const t = today();
  if (done >= target) return ["good", "Tamam"];
  if (t < from) return ["idle", "Başlamadı"];
  if (t > to) return ["bad", "Kaçtı"];
  if (from === to) return ["idle", "Devam"];
  const total = diffDays(from, to) + 1, el = diffDays(from, t) + 1;
  const expected = Math.floor((target * el) / total);
  return done >= expected ? ["ok", "Yolunda"] : ["warn", "Geride"];
}
function goalStats(key, from, to, list) {
  const g = state.goals[key]; const targets = (g && g.targets) || {};
  let done = 0, target = 0;
  Object.entries(targets).forEach(([tid, n]) => {
    if (!state.types[tid]) return;
    target += n;
    done += Math.min(n, list.filter((o) => o.done && o.it.type === tid).length);
  });
  return { done, target };
}

/* ================= Çizim ================= */
function render() {
  if (!state.user) return;
  document.querySelectorAll(".tabs button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === state.view)));
  const c = state.cursor; let title, sub = "";
  if (state.view === "gun") { title = c.getDate() + " " + TR_M[c.getMonth()] + " " + c.getFullYear(); sub = TR_D[dow(c)]; }
  else if (state.view === "hafta") {
    const s = weekStart(c), e = addDays(s, 6), w = isoWeek(c);
    title = s.getMonth() === e.getMonth() ? s.getDate() + "–" + e.getDate() + " " + TR_M[s.getMonth()] + " " + e.getFullYear()
      : s.getDate() + " " + TR_M[s.getMonth()] + " – " + e.getDate() + " " + TR_M[e.getMonth()] + " " + e.getFullYear();
    sub = w.w + ". hafta";
  } else if (state.view === "ay") title = TR_M[c.getMonth()] + " " + c.getFullYear();
  else title = String(c.getFullYear());
  $("period").innerHTML = esc(title) + (sub ? "<small>" + esc(sub) + "</small>" : "");

  const { from, to } = range();
  const list = occ(from, to);
  renderGoals(list, from, to);
  renderNotes();
  renderMix(list);
  renderIdeas();
  document.querySelector(".board").classList.toggle("wide", state.view === "yil");
  const v = $("view");
  if (state.loaded.size < COLLECTIONS.length && !Object.keys(state.items).length) { v.innerHTML = '<div class="empty">Planların yükleniyor…</div>'; return; }
  v.innerHTML = state.view === "gun" ? dayView(list) : state.view === "hafta" ? weekView(list) : state.view === "ay" ? monthView() : yearView();
  if (state.view === "gun") scrollTimeline();
}

function renderGoals(list, from, to) {
  const box = $("goalRows");
  $("goalLabel").textContent = { gun: "Bugünün hedefleri", hafta: "Bu haftanın hedefleri", ay: "Bu ayın hedefleri", yil: "Bu yılın hedefleri" }[state.view];
  if (box.contains(document.activeElement)) return; // sayı yazılırken bozma
  const key = periodKey(), g = state.goals[key] || {}, targets = g.targets || {};
  const rows = Object.entries(targets).filter(([tid]) => state.types[tid]);
  let sumDone = 0, sumT = 0;
  box.innerHTML = rows.length ? rows.map(([tid, n]) => {
    const done = list.filter((o) => o.done && o.it.type === tid).length;
    const planned = list.filter((o) => !o.done && o.it.type === tid).length;
    sumDone += Math.min(done, n); sumT += n;
    const [st, word] = pace(done, n, from, to);
    let marker = "";
    if (from !== to && today() >= from && today() <= to) {
      const f = (diffDays(from, today()) + 1) / (diffDays(from, to) + 1);
      marker = '<i style="left:calc(' + (f * 100).toFixed(1) + '% - 1px)" title="Bugün olman gereken yer"></i>';
    }
    const sub = planned ? planned + " planlı iş daha var" + (done + planned < n ? ", hedefe " + (n - done - planned) + " eksik" : "") : (done < n ? "Takvimde " + (n - done) + " iş eksik" : "");
    return '<div class="grow"><span class="gname">' + esc(state.types[tid].name) + '</span>'
      + '<div class="gbar"><span style="width:' + Math.min(100, (done / n) * 100) + '%"></span>' + marker + '</div>'
      + '<span class="gnum"><b>' + done + '</b>/<input class="tgt" type="number" min="1" max="999" value="' + n + '" data-tgt="' + esc(tid) + '" aria-label="Hedef sayısı"></span>'
      + '<span class="pill st-' + st + '">' + word + '</span>'
      + '<button class="xbtn" data-rmgoal="' + esc(tid) + '" aria-label="Hedefi kaldır">×</button>'
      + (sub ? '<div class="gsub">' + esc(sub) + '</div>' : "") + '</div>';
  }).join("") : '<p class="gempty">Bu dönem için hedef yok. Aşağıdan tür seçip sayı koy, örneğin "Reels × 5".</p>';
  $("paceSum").innerHTML = sumT ? '<span class="progress">' + sumDone + "/" + sumT + "</span>" : "";
  const sel = $("g-type");
  if (document.activeElement !== sel) {
    const types = sortedTypes(), prev = sel.value;
    sel.innerHTML = types.length ? types.map(([id, t]) => '<option value="' + esc(id) + '">' + esc(t.name) + "</option>").join("") : '<option value="">Önce Projeler\'den tür ekle</option>';
    if (prev && state.types[prev]) sel.value = prev;
  }
}

function renderNotes() {
  $("noteLabel").textContent = { gun: "Günün notu", hafta: "Haftanın notu", ay: "Ayın notu", yil: "Yılın notu" }[state.view];
  const ta = $("notes"), key = periodKey();
  if (document.activeElement !== ta || ta.dataset.key !== key) {
    ta.value = (state.goals[key] && state.goals[key].text) || ""; ta.dataset.key = key;
  }
  ta.placeholder = { gun: "Bugün aklında olsun…", hafta: "Bu haftanın odağı, önemli notlar…", ay: "Bu ayın büyük resmi…", yil: "Yılın ana hedefleri…" }[state.view];
}

function renderMix(list) {
  const by = {}; let done = 0;
  list.forEach((o) => { const k = state.projects[o.it.project] ? o.it.project : "_"; by[k] = (by[k] || 0) + 1; if (o.done) done++; });
  $("progress").textContent = list.length ? done + "/" + list.length + " tamam" : "";
  const keys = sortedProjects().map(([k]) => k); if (by._) keys.push("_");
  const col = (k) => (state.projects[k] || { color: FALL }).color;
  $("mix").innerHTML = list.length ? keys.filter((k) => by[k]).map((k) => '<span style="width:' + (by[k] / list.length) * 100 + "%;background:" + esc(col(k)) + '"></span>').join("") : "";
  $("legend").innerHTML = keys.length ? keys.map((k) => { const p = state.projects[k] || { name: "Projesiz", color: FALL }; return '<div><span class="dot" style="background:' + esc(p.color) + '"></span><span>' + esc(p.name) + "</span><b>" + (by[k] || 0) + "</b></div>"; }).join("") : '<div style="color:var(--faint)">Henüz proje yok.</div>';
}

function renderIdeas() {
  const ideas = Object.entries(state.items).filter(([, it]) => !it.date).sort((a, b) => (b[1].created || 0) - (a[1].created || 0));
  $("ideaCount").innerHTML = ideas.length ? '<span class="progress">' + ideas.length + "</span>" : "";
  $("ideaList").innerHTML = ideas.length ? ideas.map(([id, it]) => chip({ id, it, date: "", done: false, rec: false })).join("") : '<p class="hint">Henüz fikir yok.</p>';
}

function chip(o, opt = {}) {
  const p = projOf(o.it);
  const time = !o.it.allDay && o.it.start ? '<span class="t">' + esc(o.it.start) + (o.it.end ? "–" + esc(o.it.end) : "") + "</span>" : "";
  const check = opt.check ? '<button class="mini' + (o.done ? " on" : "") + '" data-toggle="' + esc(o.id) + '" data-date="' + o.date + '" aria-label="Tamamlandı olarak işaretle">' + (o.done ? "✓" : "") + "</button>" : "";
  return '<div class="item' + (o.done ? " done" : "") + '" role="button" tabindex="0" style="--c:' + esc(p.color) + '" data-open="' + esc(o.id) + '" data-date="' + o.date + '" data-drag="' + esc(o.id) + '">'
    + check + '<span class="x">' + time + esc(o.it.title) + (o.rec ? ' <span class="rec" title="Tekrarlayan iş">↻</span>' : "") + "</span></div>";
}

function rowHtml(o) {
  const p = projOf(o.it), ty = state.types[o.it.type];
  return '<div class="drow' + (o.done ? " done" : "") + '" style="--c:' + esc(p.color) + '" role="button" tabindex="0" data-open="' + esc(o.id) + '" data-date="' + o.date + '" data-drag="' + esc(o.id) + '">'
    + '<button class="check' + (o.done ? " on" : "") + '" data-toggle="' + esc(o.id) + '" data-date="' + o.date + '" aria-label="Tamamlandı olarak işaretle">' + (o.done ? "✓" : "") + "</button>"
    + '<div class="main"><div class="title">' + esc(o.it.title) + '</div><div class="meta"><span><span class="dot" style="background:' + esc(p.color) + '"></span>' + esc(p.name) + "</span>"
    + (ty ? "<span>" + esc(ty.name) + "</span>" : "") + (o.rec ? "<span>↻ Tekrarlı</span>" : "") + (o.it.note ? "<span>" + esc(o.it.note) + "</span>" : "") + "</div></div></div>";
}

const HOUR = 52;
function dayView(list) {
  const d = iso(state.cursor);
  const allDay = list.filter((o) => o.it.allDay || !o.it.start);
  const timed = list.filter((o) => !o.it.allDay && o.it.start);
  let minH = 7; const maxH = 24;
  timed.forEach((o) => (minH = Math.min(minH, Math.floor(toMin(o.it.start) / 60))));
  const ev = timed.map((o) => { const s = toMin(o.it.start); let e = o.it.end ? toMin(o.it.end) : s + 60; if (e <= s) e = Math.min(s + 60, 1440); return { o, s, e }; })
    .sort((a, b) => a.s - b.s || b.e - a.e);
  const clusters = []; let cur = [], end = -1;
  for (const x of ev) { if (cur.length && x.s >= end) { clusters.push(cur); cur = []; end = -1; } cur.push(x); end = Math.max(end, x.e); }
  if (cur.length) clusters.push(cur);
  for (const c of clusters) { const cols = []; for (const x of c) { let i = cols.findIndex((e) => e <= x.s); if (i < 0) { i = cols.length; cols.push(0); } cols[i] = x.e; x.col = i; } c.forEach((x) => (x.n = cols.length)); }

  let slots = "";
  for (let h = minH; h < maxH; h++) slots += '<button class="slot" style="top:' + (h - minH) * HOUR + "px;height:" + HOUR + 'px" data-addtime="' + pad(h) + ':00" data-date="' + d + '"><span>' + pad(h) + ":00</span></button>";
  const evs = ev.map((x) => {
    const p = projOf(x.o.it), top = ((x.s - minH * 60) / 60) * HOUR, h = Math.max(26, ((x.e - x.s) / 60) * HOUR - 3);
    const left = "calc(56px + (100% - 62px) * " + x.col + " / " + x.n + ")", w = "calc((100% - 62px) / " + x.n + " - 4px)";
    return '<div class="ev' + (x.o.done ? " done" : "") + '" role="button" tabindex="0" style="--c:' + esc(p.color) + ";top:" + (top + 1) + "px;height:" + h + "px;left:" + left + ";width:" + w + '" data-open="' + esc(x.o.id) + '" data-date="' + d + '" data-drag="' + esc(x.o.id) + '">'
      + '<button class="mini' + (x.o.done ? " on" : "") + '" data-toggle="' + esc(x.o.id) + '" data-date="' + d + '" aria-label="Tamamlandı olarak işaretle">' + (x.o.done ? "✓" : "") + "</button>"
      + '<span class="x"><b>' + esc(x.o.it.title) + "</b><small>" + esc(timeLabel(x.o.it)) + (x.o.rec ? " · ↻" : "") + "</small></span></div>";
  }).join("");
  let now = "";
  if (d === today()) { const n = new Date(), m = n.getHours() * 60 + n.getMinutes(); if (m >= minH * 60) now = '<div class="nowline" style="top:' + ((m - minH * 60) / 60) * HOUR + 'px"></div>'; }

  const s = weekStart(state.cursor), wk = groupByDate(occ(iso(s), iso(addDays(s, 6))));
  let side = "";
  for (let i = 0; i < 7; i++) {
    const x = addDays(s, i), k = iso(x), l = wk[k] || [], dn = l.filter((o) => o.done).length;
    side += '<button class="ghost' + (k === d ? " cur" : "") + '" data-goto="' + k + '" data-drop="' + k + '"><span>' + TR_D[i] + " " + x.getDate() + '</span><span class="progress">' + (l.length ? dn + "/" + l.length : "·") + "</span></button>";
  }
  return '<div class="day"><div>'
    + '<div class="dsec"><p class="subhead">Tüm gün</p>' + (allDay.length ? allDay.map(rowHtml).join("") : '<div class="empty">Tüm günlük iş yok. <button class="linkbtn" data-add="' + d + '">Ekle</button></div>') + "</div>"
    + '<div class="dsec"><p class="subhead">Saatli</p><div class="tlwrap" id="tlwrap"><div class="timeline" id="timeline" style="height:' + (maxH - minH) * HOUR + 'px">' + slots + evs + now + "</div></div></div>"
    + '</div><div class="panel weekside"><p class="label">Bu hafta</p>' + side + '<p class="hint">Bir işi başka güne taşımak için buradaki günlere sürükle.</p></div></div>';
}
function scrollTimeline() {
  const w = $("tlwrap"), tl = $("timeline"); if (!w || scrollTimeline.done === iso(state.cursor)) return;
  scrollTimeline.done = iso(state.cursor);
  const first = tl.querySelector(".nowline") || tl.querySelector(".ev");
  if (first) w.scrollTop = Math.max(0, first.offsetTop - 80);
}
function weekView(list) {
  const s = weekStart(state.cursor), t = today(), by = groupByDate(list); let h = "";
  for (let i = 0; i < 7; i++) {
    const x = addDays(s, i), k = iso(x), l = by[k] || [];
    const ad = l.filter((o) => o.it.allDay || !o.it.start), tm = l.filter((o) => !o.it.allDay && o.it.start);
    h += '<div class="wcol' + (k === t ? " today" : "") + '" data-drop="' + k + '"><button class="whead" data-goto="' + k + '"><span class="dn">' + TR_DS[i] + '</span><span class="dd">' + x.getDate() + "</span></button>"
      + '<div class="wbody">' + ad.map((o) => chip(o, { check: true })).join("") + (ad.length && tm.length ? '<div class="wsep"></div>' : "") + tm.map((o) => chip(o, { check: true })).join("")
      + '<button class="addhere" data-add="' + k + '">+ Ekle</button></div></div>';
  }
  return '<div class="week">' + h + "</div>";
}

function monthView() {
  const c = state.cursor, first = new Date(c.getFullYear(), c.getMonth(), 1), start = addDays(first, -dow(first)), t = today();
  const last = new Date(c.getFullYear(), c.getMonth() + 1, 0), cells = Math.ceil((dow(first) + last.getDate()) / 7) * 7;
  const by = groupByDate(occ(iso(start), iso(addDays(start, cells - 1))));
  let h = TR_DS.map((d) => '<div class="mdow">' + d + "</div>").join("");
  for (let i = 0; i < cells; i++) {
    const x = addDays(start, i), k = iso(x), l = by[k] || [], out = x.getMonth() !== c.getMonth();
    h += '<div class="mcell' + (out ? " out" : "") + (k === t ? " today" : "") + '" role="button" tabindex="0" data-goto="' + k + '" data-drop="' + k + '"><span class="mnum">' + x.getDate() + "</span>"
      + l.slice(0, 3).map((o) => chip(o)).join("") + (l.length > 3 ? '<span class="more">+' + (l.length - 3) + " daha</span>" : "")
      + '<span class="mdots">' + l.slice(0, 6).map((o) => '<span class="dot" style="background:' + esc(projOf(o.it).color) + '"></span>').join("") + "</span></div>";
  }
  return '<div class="mgrid">' + h + "</div>";
}

function yearView() {
  const y = state.cursor.getFullYear(), t = today();
  const all = occ(y + "-01-01", y + "-12-31"), by = groupByDate(all); let h = "";
  for (let m = 0; m < 12; m++) {
    const first = new Date(y, m, 1), last = new Date(y, m + 1, 0), from = iso(first), to = iso(last);
    const list = all.filter((o) => o.date >= from && o.date <= to), done = list.filter((o) => o.done).length;
    let g = TR_DS.map((n) => '<span class="ydow">' + n[0] + "</span>").join(""); for (let i = 0; i < dow(first); i++) g += "<span></span>";
    for (let d = 1; d <= last.getDate(); d++) {
      const k = y + "-" + pad(m + 1) + "-" + pad(d), l = by[k] || [];
      let cls = "yd", st = "";
      if (l.length) { cls += " has"; st = "--c:" + esc(projOf(l[0].it).color) + ";--a:" + Math.min(22 + l.length * 16, 80) + "%"; }
      if (k === t) cls += " today";
      g += '<button class="' + cls + '" style="' + st + '" data-goto="' + k + '" data-drop="' + k + '" aria-label="' + d + " " + TR_M[m] + (l.length ? ", " + l.length + " iş" : "") + '">' + d + "</button>";
    }
    const pb = {}; list.forEach((o) => { const k = state.projects[o.it.project] ? o.it.project : "_"; pb[k] = (pb[k] || 0) + 1; });
    const bar = list.length ? Object.keys(pb).map((k) => '<span style="width:' + (pb[k] / list.length) * 100 + "%;background:" + esc((state.projects[k] || { color: FALL }).color) + '"></span>').join("") : "";
    const gs = goalStats("m-" + y + "-" + pad(m + 1), from, to, list);
    let pill = "";
    if (gs.target) { const [st] = pace(gs.done, gs.target, from, to); pill = '<span class="pill st-' + st + '">Hedef ' + Math.round((gs.done / gs.target) * 100) + "%</span>"; }
    const isCur = t >= from && t <= to;
    h += '<div class="ymonth' + (isCur ? " cur" : "") + '"><h3><button data-month="' + m + '">' + TR_M[m] + "</button>" + pill + '</h3><div class="ygrid">' + g + '</div><div class="ybar">' + bar + '</div><div class="ymeta"><span>' + (list.length ? done + "/" + list.length + " tamam" : "Plan yok") + "</span>" + (gs.target ? "<span>" + gs.done + "/" + gs.target + "</span>" : "") + "</div></div>";
  }
  return '<div class="year">' + h + "</div>";
}

/* ================= İşlemler ================= */
function toggle(id, date) {
  const it = state.items[id]; if (!it) return;
  if (isRec(it)) { const dd = { ...(it.doneDates || {}) }; if (dd[date]) delete dd[date]; else dd[date] = true; put("items", id, { ...it, doneDates: dd }); }
  else put("items", id, { ...it, done: !it.done });
}
function moveTo(id, fromDate, toDate) {
  const it = state.items[id]; if (!it) return;
  if (toDate === "idea") {
    if (isRec(it)) return toast("Tekrarlayan işler fikir kutusuna taşınamaz.");
    if (!it.date) return;
    put("items", id, { ...it, date: null, done: false }); return toast("Fikir kutusuna taşındı.");
  }
  if (!isRec(it)) { if (it.date === toDate) return; put("items", id, { ...it, date: toDate }); return toast(fmtDate(toDate) + " gününe taşındı."); }
  if (fromDate === toDate) return;
  const wasDone = !!(it.doneDates && it.doneDates[fromDate]);
  const dd = { ...(it.doneDates || {}) }; delete dd[fromDate];
  put("items", id, { ...it, skip: { ...(it.skip || {}), [fromDate]: true }, doneDates: dd });
  put("items", newId(), { ...it, date: toDate, repeat: null, skip: {}, doneDates: {}, done: wasDone, created: Date.now() });
  toast("Sadece bu tekrar " + fmtDate(toDate) + " gününe taşındı.");
}
const fmtDate = (k) => { const d = parse(k); return d.getDate() + " " + TR_M[d.getMonth()]; };

/* ================= İş düzenleyici ================= */
function openEditor(id, occDate, preset = {}) {
  const orig = id ? state.items[id] : null;
  const rec = isRec(orig);
  const projs = sortedProjects(), types = sortedTypes();
  const it = orig ? { ...orig } : {
    title: "", date: preset.date === undefined ? iso(state.cursor) : preset.date,
    allDay: !preset.start, start: preset.start || "", end: preset.end || "",
    project: preset.project ?? (projs[0] ? projs[0][0] : ""), type: "", note: "", repeat: null, done: false,
  };
  const idea = !it.date;
  const dateVal = rec ? occDate : (it.date || iso(state.cursor));
  const doneVal = rec ? !!(orig.doneDates && orig.doneDates[occDate]) : !!it.done;
  const r = it.repeat || {};
  const days = r.days && r.days.length ? r.days : [dow(parse(dateVal))];

  $("modal").innerHTML = '<div class="scrim" id="scrim"><form class="sheet" id="ed" novalidate><h2>' + (orig ? "İşi düzenle" : "Yeni iş") + "</h2>"
    + (rec ? '<p class="recnote">Bu tekrarlayan bir iş. ' + esc(fmtDate(occDate)) + " tarihli tekrarı düzenliyorsun.</p>" : "")
    + '<div class="field"><label for="f-title">Ne yapılacak?</label><input id="f-title" maxlength="140" value="' + esc(it.title) + '" placeholder="Örn. Reels çekimi"></div>'
    + '<div class="field"><label>Proje</label><div class="chips" id="f-proj">'
    + '<button type="button" class="chip" data-pid="" aria-pressed="' + !it.project + '">Projesiz</button>'
    + projs.map(([pid, p]) => '<button type="button" class="chip" style="--c:' + esc(p.color) + '" data-pid="' + esc(pid) + '" aria-pressed="' + (pid === it.project) + '"><span class="dot" style="background:' + esc(p.color) + '"></span>' + esc(p.name) + "</button>").join("")
    + "</div></div>"
    + '<div class="field"><label for="f-type">Tür (hedef sayaçları bunu sayar)</label><select id="f-type"><option value="">Tür yok</option>'
    + types.map(([tid, t]) => '<option value="' + esc(tid) + '"' + (tid === it.type ? " selected" : "") + ">" + esc(t.name) + "</option>").join("") + "</select></div>"
    + '<label class="check-line"><input type="checkbox" id="f-idea"' + (idea ? " checked" : "") + (rec ? " disabled" : "") + "> Tarihsiz, fikir kutusunda kalsın</label>"
    + '<div id="f-when"' + (idea ? " hidden" : "") + ' style="display:flex;flex-direction:column;gap:12px">'
    + '<div class="field"><label for="f-date">Tarih</label><input id="f-date" type="date" value="' + esc(dateVal) + '"></div>'
    + '<div class="seg" id="f-mode"><button type="button" data-mode="allday" aria-pressed="' + !!(it.allDay || !it.start) + '">Tüm gün</button><button type="button" data-mode="timed" aria-pressed="' + !(it.allDay || !it.start) + '">Saatli</button></div>'
    + '<div class="row2" id="f-times"' + (it.allDay || !it.start ? " hidden" : "") + '><div class="field"><label for="f-start">Başlangıç</label><input id="f-start" type="time" value="' + esc(it.start || "") + '"></div><div class="field"><label for="f-end">Bitiş</label><input id="f-end" type="time" value="' + esc(it.end || "") + '"></div></div>'
    + '<div class="field"><label for="f-repeat">Tekrar</label><select id="f-repeat">'
    + [["", "Tekrarlanmaz"], ["daily", "Her gün"], ["weekdays", "Haftanın belirli günleri"], ["weekly", "Her hafta (aynı gün)"], ["monthly", "Her ay (aynı tarih)"]].map(([v, l]) => '<option value="' + v + '"' + ((r.freq || "") === v ? " selected" : "") + ">" + l + "</option>").join("")
    + "</select></div>"
    + '<div class="chips" id="f-days"' + (r.freq === "weekdays" ? "" : " hidden") + ">" + TR_DS.map((n, i) => '<button type="button" class="chip" data-day="' + i + '" aria-pressed="' + days.includes(i) + '">' + n + "</button>").join("") + "</div>"
    + '<div class="field" id="f-untilf"' + (r.freq ? "" : " hidden") + '><label for="f-until">Bitiş tarihi (boş bırakırsan sürekli tekrarlar)</label><input id="f-until" type="date" value="' + esc(r.until || "") + '"></div>'
    + "</div>"
    + '<div class="field"><label for="f-note">Not</label><textarea id="f-note" rows="2" maxlength="500">' + esc(it.note || "") + "</textarea></div>"
    + '<label class="check-line"><input type="checkbox" id="f-done"' + (doneVal ? " checked" : "") + "> Tamamlandı</label>"
    + '<div class="actions" id="acts">'
    + (orig ? '<button type="button" class="danger spacer" id="del">Sil</button>' : "")
    + '<button type="button" class="ghost" id="cancel">Vazgeç</button>'
    + (rec ? '<button class="ghost" type="submit" data-scope="one">Sadece bu günü kaydet</button><button class="primary" type="submit" data-scope="following">Bu ve sonrakileri kaydet</button>'
      : '<button class="primary" type="submit">Kaydet</button>')
    + "</div></form></div>";

  let proj = it.project || "", mode = it.allDay || !it.start ? "allday" : "timed";
  const pressed = (box, el) => box.querySelectorAll(".chip,button").forEach((x) => x.setAttribute("aria-pressed", String(x === el)));
  $("f-proj").onclick = (e) => { const b = e.target.closest("[data-pid]"); if (!b) return; proj = b.dataset.pid; pressed($("f-proj"), b); };
  $("f-mode").onclick = (e) => { const b = e.target.closest("[data-mode]"); if (!b) return; mode = b.dataset.mode; pressed($("f-mode"), b); $("f-times").hidden = mode !== "timed"; if (mode === "timed" && !$("f-start").value) $("f-start").focus(); };
  $("f-idea").onchange = (e) => ($("f-when").hidden = e.target.checked);
  $("f-repeat").onchange = (e) => { $("f-days").hidden = e.target.value !== "weekdays"; $("f-untilf").hidden = !e.target.value; };
  $("f-days").onclick = (e) => { const b = e.target.closest("[data-day]"); if (b) b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true")); };
  $("cancel").onclick = closeModal;
  $("scrim").onclick = (e) => { if (e.target.id === "scrim") closeModal(); };

  if (orig) $("del").onclick = () => {
    const box = document.createElement("span"); box.className = "confirm";
    box.innerHTML = rec ? 'Silinsin mi? <button type="button" class="danger" id="del-one">Sadece bunu</button><button type="button" class="danger solid" id="del-all">Bu ve sonrakileri</button>'
      : 'Silinsin mi? <button type="button" class="danger solid" id="del-yes">Evet, sil</button>';
    $("del").replaceWith(box);
    if (rec) {
      $("del-one").onclick = () => { const dd = { ...(orig.doneDates || {}) }; delete dd[occDate]; put("items", id, { ...orig, skip: { ...(orig.skip || {}), [occDate]: true }, doneDates: dd }); closeModal(); toast("Bu tekrar silindi."); };
      $("del-all").onclick = () => {
        if (occDate <= orig.date) put("items", id, null);
        else put("items", id, { ...orig, repeat: { ...orig.repeat, until: iso(addDays(parse(occDate), -1)) } });
        closeModal(); toast("Tekrarlar silindi.");
      };
    } else $("del-yes").onclick = () => { put("items", id, null); closeModal(); toast("Silindi."); };
  };

  $("ed").onsubmit = (e) => {
    e.preventDefault();
    const title = $("f-title").value.trim();
    if (!title) { $("f-title").focus(); return toast("İşin adını yaz."); }
    const isIdea = $("f-idea").checked;
    const rep = isIdea ? "" : $("f-repeat").value;
    const start = $("f-start").value, end = $("f-end").value;
    if (!isIdea && mode === "timed" && !start) { $("f-start").focus(); return toast("Başlangıç saatini seç."); }
    if (!isIdea && mode === "timed" && end && end <= start) return toast("Bitiş saati başlangıçtan sonra olmalı.");
    const pickedDays = [...$("f-days").querySelectorAll('[aria-pressed="true"]')].map((b) => +b.dataset.day);
    if (rep === "weekdays" && !pickedDays.length) return toast("Tekrar için en az bir gün seç.");
    const date = isIdea ? null : ($("f-date").value || iso(state.cursor));
    const f = {
      title, project: proj, type: $("f-type").value, note: $("f-note").value.trim(),
      allDay: isIdea || mode === "allday", start: !isIdea && mode === "timed" ? start : "", end: !isIdea && mode === "timed" ? end : "",
      date, repeat: rep ? { freq: rep, days: rep === "weekdays" ? pickedDays.sort() : [], until: $("f-until").value || null } : null,
      updated: Date.now(),
    };
    const doneChk = $("f-done").checked;
    const scope = e.submitter && e.submitter.dataset.scope;

    if (!orig) {
      put("items", newId(), { ...f, done: f.repeat ? false : doneChk, doneDates: f.repeat && doneChk ? { [date]: true } : {}, skip: {}, created: Date.now() });
    } else if (!rec) {
      const n = { ...orig, ...f };
      if (f.repeat) { n.doneDates = doneChk ? { [date]: true } : {}; n.skip = {}; n.done = false; } else n.done = doneChk;
      put("items", id, n);
    } else if (scope === "one") {
      const dd = { ...(orig.doneDates || {}) }; delete dd[occDate];
      put("items", id, { ...orig, skip: { ...(orig.skip || {}), [occDate]: true }, doneDates: dd });
      put("items", newId(), { ...f, repeat: null, done: doneChk, skip: {}, doneDates: {}, created: Date.now() });
    } else {
      if (occDate <= orig.date) {
        const dd = { ...(orig.doneDates || {}) }; delete dd[occDate]; if (doneChk) dd[date] = true;
        put("items", id, f.repeat ? { ...orig, ...f, doneDates: dd } : { ...orig, ...f, repeat: null, done: doneChk, doneDates: {}, skip: {} });
      } else {
        const oldDD = {}, newDD = {};
        Object.keys(orig.doneDates || {}).forEach((k) => ((k < occDate ? oldDD : newDD)[k] = true));
        delete newDD[occDate]; if (doneChk) newDD[date] = true;
        put("items", id, { ...orig, repeat: { ...orig.repeat, until: iso(addDays(parse(occDate), -1)) }, doneDates: oldDD });
        put("items", newId(), f.repeat ? { ...f, doneDates: newDD, skip: {}, created: Date.now() } : { ...f, repeat: null, done: doneChk, doneDates: {}, skip: {}, created: Date.now() });
      }
    }
    closeModal();
  };
  setTimeout(() => { if (!orig) $("f-title").focus(); }, 30);
}

/* ================= Projeler ve türler ================= */
function openProjects() {
  const projs = sortedProjects(), types = sortedTypes();
  $("modal").innerHTML = '<div class="scrim" id="scrim"><div class="sheet"><h2>Projeler ve türler</h2>'
    + '<h3>Projeler</h3><p class="hint">Her işin bir proje rengi olur, takvimde bu renkle görünür.</p><div class="projlist" id="pl">'
    + projs.map(([pid, p]) => '<div class="projrow"><input type="color" value="' + esc(p.color) + '" data-c="' + esc(pid) + '" aria-label="Renk"><input class="inp" value="' + esc(p.name) + '" data-n="' + esc(pid) + '" aria-label="Proje adı"><button class="xbtn" data-rmp="' + esc(pid) + '" aria-label="Projeyi sil">×</button></div>').join("")
    + '</div><form class="projrow" id="np"><input type="color" id="np-c" value="#0EA5E9" aria-label="Yeni proje rengi"><input class="inp" id="np-n" placeholder="Yeni proje adı" maxlength="40"><button class="primary" type="submit">Ekle</button></form>'
    + '<h3>Türler</h3><p class="hint">Hedef sayaçları türe göre sayar. Örneğin "Reels × 5" hedefi, tamamlanan Reels türündeki işleri sayar.</p><div class="projlist" id="tl">'
    + types.map(([tid, t]) => '<div class="projrow"><input class="inp" value="' + esc(t.name) + '" data-tn="' + esc(tid) + '" aria-label="Tür adı"><button class="xbtn" data-rmt="' + esc(tid) + '" aria-label="Türü sil">×</button></div>').join("")
    + '</div><form class="projrow" id="nt"><input class="inp" id="nt-n" placeholder="Yeni tür, örn. Podcast" maxlength="40"><button class="primary" type="submit">Ekle</button></form>'
    + '<div class="actions"><button class="ghost" id="cancel">Kapat</button></div></div></div>';
  const pl = $("pl"), tl = $("tl");
  pl.onchange = (e) => { const t = e.target, pid = t.dataset.c || t.dataset.n; if (!pid) return; const p = { ...state.projects[pid] }; if (t.dataset.c) p.color = t.value; else p.name = t.value.trim() || p.name; put("projects", pid, p); };
  pl.onclick = (e) => { const b = e.target.closest("[data-rmp]"); if (!b) return; put("projects", b.dataset.rmp, null); openProjects(); };
  tl.onchange = (e) => { const tid = e.target.dataset.tn; if (!tid) return; put("types", tid, { ...state.types[tid], name: e.target.value.trim() || state.types[tid].name }); };
  tl.onclick = (e) => { const b = e.target.closest("[data-rmt]"); if (!b) return; put("types", b.dataset.rmt, null); openProjects(); };
  $("np").onsubmit = (e) => { e.preventDefault(); const n = $("np-n").value.trim(); if (!n) return; put("projects", newId(), { name: n, color: $("np-c").value, order: Date.now() }); openProjects(); };
  $("nt").onsubmit = (e) => { e.preventDefault(); const n = $("nt-n").value.trim(); if (!n) return; put("types", newId(), { name: n, order: Date.now() }); openProjects(); };
  $("cancel").onclick = closeModal; $("scrim").onclick = (e) => { if (e.target.id === "scrim") closeModal(); };
}

/* ================= Ayarlar ================= */
function openSettings() {
  const demo = store.mode === "demo";
  $("modal").innerHTML = '<div class="scrim" id="scrim"><div class="sheet"><h2>Ayarlar</h2>'
    + (demo ? '<p class="recnote">Demo modundasın. Veriler sadece bu tarayıcıda duruyor. Firebase kurulumu yapılınca giriş ve senkron açılır.</p>' : '<p class="hint">Giriş yapılan hesap: <b>' + esc(state.user.email) + "</b></p>")
    + '<button class="ghost" id="s-proj">Projeler ve türler</button>'
    + (demo ? "" : '<h3>Şifre değiştir</h3><form id="pw" style="display:flex;flex-direction:column;gap:8px"><input class="inp" type="password" id="pw-cur" placeholder="Mevcut şifre" autocomplete="current-password"><input class="inp" type="password" id="pw-new" placeholder="Yeni şifre (en az 8 karakter)" autocomplete="new-password"><button class="primary" type="submit">Şifreyi değiştir</button></form>')
    + '<h3>Yedek</h3><p class="hint">Tüm işler, hedefler ve projeler tek bir dosya olarak iner. Geri yükleme mevcut verilerin üstüne yazar.</p>'
    + '<div class="actions" style="justify-content:flex-start"><button class="ghost" id="s-exp">Yedek indir</button><label class="ghost" style="cursor:pointer">Yedekten geri yükle<input type="file" id="s-imp" accept="application/json,.json" hidden></label></div>'
    + '<div class="actions">' + (demo ? "" : '<button class="danger spacer" id="s-out">Çıkış yap</button>') + '<button class="ghost" id="cancel">Kapat</button></div></div></div>';
  $("cancel").onclick = closeModal; $("scrim").onclick = (e) => { if (e.target.id === "scrim") closeModal(); };
  $("s-proj").onclick = openProjects;
  $("s-exp").onclick = () => {
    const data = { app: "plan-masasi", version: 1, exported: new Date().toISOString() };
    COLLECTIONS.forEach((c) => (data[c] = state[c]));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    a.download = "plan-masasi-yedek-" + today() + ".json"; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  $("s-imp").onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data.app !== "plan-masasi") throw new Error();
      let n = 0;
      COLLECTIONS.forEach((c) => Object.entries(data[c] || {}).forEach(([id, v]) => { put(c, id, v); n++; }));
      toast(n + " kayıt geri yüklendi."); closeModal();
    } catch (err) { toast("Bu dosya bir Plan Masası yedeği değil."); }
  };
  if (!demo) {
    $("s-out").onclick = async () => { closeModal(); await store.signOut(); };
    $("pw").onsubmit = async (e) => {
      e.preventDefault();
      const cur = $("pw-cur").value, nw = $("pw-new").value;
      if (nw.length < 8) return toast("Yeni şifre en az 8 karakter olmalı.");
      try { await store.changePassword(cur, nw); toast("Şifre değiştirildi."); closeModal(); }
      catch (err) { toast(authError(err)); }
    };
  }
}
function closeModal() { $("modal").innerHTML = ""; }

/* ================= Sürükle-bırak ================= */
let drag = null, justDragged = false;
function dragStart() {
  if (!drag) return;
  drag.started = true;
  const r = drag.el.getBoundingClientRect();
  const g = drag.el.cloneNode(true); g.classList.add("ghostdrag"); g.style.width = Math.min(r.width, 260) + "px";
  g.style.left = drag.x - drag.ox + "px"; g.style.top = drag.y - drag.oy + "px";
  document.body.appendChild(g); drag.ghost = g; drag.el.classList.add("dragging");
  if (navigator.vibrate) try { navigator.vibrate(10); } catch (e) {}
}
function dragTarget(x, y) {
  const el = document.elementFromPoint(x, y);
  return el && el.closest("[data-drop]");
}
document.addEventListener("pointerdown", (e) => {
  const el = e.target.closest("[data-drag]");
  if (!el || e.button > 0 || e.target.closest("[data-toggle]")) return;
  const r = el.getBoundingClientRect();
  drag = { el, id: el.dataset.drag, from: el.dataset.date || "", x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, ox: e.clientX - r.left, oy: e.clientY - r.top, type: e.pointerType, started: false, over: null };
  if (e.pointerType !== "mouse") drag.timer = setTimeout(dragStart, 380);
});
document.addEventListener("pointermove", (e) => {
  if (!drag) return;
  drag.x = e.clientX; drag.y = e.clientY;
  const dist = Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy);
  if (!drag.started) {
    if (drag.type === "mouse" && dist > 6) dragStart();
    else if (drag.type !== "mouse" && dist > 10) { clearTimeout(drag.timer); drag = null; }
    return;
  }
  drag.ghost.style.left = e.clientX - drag.ox + "px"; drag.ghost.style.top = e.clientY - drag.oy + "px";
  const t = dragTarget(e.clientX, e.clientY);
  if (t !== drag.over) { drag.over && drag.over.classList.remove("drop-on"); t && t.classList.add("drop-on"); drag.over = t; }
  // kenara yaklaşınca kaydır
  if (e.clientY < 60) window.scrollBy(0, -12); else if (e.clientY > window.innerHeight - 60) window.scrollBy(0, 12);
});
function dragEnd(cancel) {
  if (!drag) return;
  clearTimeout(drag.timer);
  if (drag.started) {
    drag.ghost.remove(); drag.el.classList.remove("dragging");
    drag.over && drag.over.classList.remove("drop-on");
    const t = !cancel && dragTarget(drag.x, drag.y);
    justDragged = true; setTimeout(() => (justDragged = false), 50);
    if (t) moveTo(drag.id, drag.from, t.dataset.drop);
  }
  drag = null;
}
document.addEventListener("pointerup", () => dragEnd(false));
document.addEventListener("pointercancel", () => dragEnd(true));
document.addEventListener("touchmove", (e) => { if (drag && drag.started) e.preventDefault(); }, { passive: false });
document.addEventListener("contextmenu", (e) => { if (drag) e.preventDefault(); });

/* ================= Olaylar ================= */
document.addEventListener("click", (e) => {
  if (justDragged) { e.preventDefault(); e.stopPropagation(); return; }
  if (!state.user || e.target.closest("#modal")) return;
  const tg = e.target.closest("[data-toggle]"); if (tg) { toggle(tg.dataset.toggle, tg.dataset.date); return; }
  const o = e.target.closest("[data-open]"); if (o) { openEditor(o.dataset.open, o.dataset.date); return; }
  const a = e.target.closest("[data-add]"); if (a) { openEditor(null, null, { date: a.dataset.add }); return; }
  const at = e.target.closest("[data-addtime]"); if (at) { const h = toMin(at.dataset.addtime); openEditor(null, null, { date: at.dataset.date, start: at.dataset.addtime, end: h >= 23 * 60 ? "" : pad(h / 60 + 1) + ":00" }); return; }
  const rg = e.target.closest("[data-rmgoal]"); if (rg) { const key = periodKey(), g = state.goals[key] || {}; const t = { ...(g.targets || {}) }; delete t[rg.dataset.rmgoal]; put("goals", key, { ...g, targets: t }); return; }
  const m = e.target.closest("[data-month]"); if (m) { state.cursor = new Date(state.cursor.getFullYear(), +m.dataset.month, 1); setView("ay"); return; }
  const g = e.target.closest("[data-goto]"); if (g) { state.cursor = parse(g.dataset.goto); setView("gun"); }
}, true);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { closeModal(); return; }
  if ((e.key === "Enter" || e.key === " ") && e.target.matches('[role="button"]')) { e.preventDefault(); e.target.click(); }
});
document.addEventListener("change", (e) => {
  if (e.target.matches(".tgt")) {
    const n = Math.max(1, Math.min(999, parseInt(e.target.value, 10) || 1)), key = periodKey(), g = state.goals[key] || {};
    put("goals", key, { ...g, targets: { ...(g.targets || {}), [e.target.dataset.tgt]: n } });
    e.target.blur(); render();
  }
});

document.querySelector(".tabs").onclick = (e) => { const b = e.target.closest("button"); if (b) setView(b.dataset.v); };
function setView(v) { state.view = v; if (location.hash !== "#" + v) history.replaceState(null, "", "#" + v); scrollTimeline.done = null; render(); window.scrollTo({ top: 0 }); }
function shift(n) {
  const c = new Date(state.cursor);
  if (state.view === "gun") c.setDate(c.getDate() + n);
  else if (state.view === "hafta") c.setDate(c.getDate() + 7 * n);
  else if (state.view === "ay") { c.setDate(1); c.setMonth(c.getMonth() + n); }
  else c.setFullYear(c.getFullYear() + n);
  state.cursor = c; scrollTimeline.done = null; render();
}
$("prev").onclick = () => shift(-1);
$("next").onclick = () => shift(1);
$("todayBtn").onclick = () => { state.cursor = new Date(); scrollTimeline.done = null; render(); };
$("addBtn").onclick = () => openEditor(null, null, { date: state.view === "gun" ? iso(state.cursor) : (range().from <= today() && today() <= range().to ? today() : range().from) });
$("projBtn").onclick = openProjects;
$("setBtn").onclick = openSettings;

$("goal-form").onsubmit = (e) => {
  e.preventDefault();
  const tid = $("g-type").value, n = Math.max(1, Math.min(999, parseInt($("g-num").value, 10) || 1));
  if (!tid) return openProjects();
  const key = periodKey(), g = state.goals[key] || {};
  put("goals", key, { ...g, targets: { ...(g.targets || {}), [tid]: n } });
};
let noteTimer = null;
$("notes").addEventListener("input", (e) => {
  const key = e.target.dataset.key, val = e.target.value;
  $("noteState").textContent = "yazılıyor…"; clearTimeout(noteTimer);
  noteTimer = setTimeout(() => { $("noteState").textContent = ""; put("goals", key, { ...(state.goals[key] || {}), text: val }); }, 700);
});
$("idea-form").onsubmit = (e) => {
  e.preventDefault();
  const t = $("idea-in").value.trim(); if (!t) return;
  put("items", newId(), { title: t, date: null, allDay: true, start: "", end: "", project: "", type: "", note: "", repeat: null, done: false, created: Date.now() });
  $("idea-in").value = "";
};
function fromHash() { const h = location.hash.slice(1); if (["gun", "hafta", "ay", "yil"].includes(h)) { state.view = h; render(); } }
window.addEventListener("hashchange", fromHash);
// gece yarısı geçince "bugün" güncellensin
setInterval(() => { if (state.view === "gun" && !document.hidden) render(); }, 60000);

/* ================= Giriş ================= */
function authError(err) {
  const c = (err && err.code) || "";
  if (c.includes("invalid-credential") || c.includes("wrong-password") || c.includes("user-not-found") || c.includes("invalid-email")) return "E-posta veya şifre hatalı.";
  if (c.includes("too-many-requests")) return "Çok fazla deneme yapıldı. Biraz bekleyip tekrar dene.";
  if (c.includes("network")) return "İnternet bağlantısı yok.";
  if (c.includes("weak-password")) return "Şifre çok zayıf, daha uzun bir şifre seç.";
  if (c.includes("requires-recent-login")) return "Güvenlik için çıkış yapıp tekrar giriş yap.";
  return "Bir sorun oluştu (" + (c || "bilinmiyor") + ").";
}
$("login-form").onsubmit = async (e) => {
  e.preventDefault();
  const email = $("l-email").value.trim(), pass = $("l-pass").value, msg = $("l-msg");
  msg.className = "login-msg"; msg.textContent = "";
  if (!email || !pass) { msg.textContent = "E-posta ve şifreyi yaz."; return; }
  $("l-submit").disabled = true; $("l-submit").textContent = "Giriş yapılıyor…";
  try { await store.signIn(email, pass); }
  catch (err) { msg.textContent = authError(err); }
  finally { $("l-submit").disabled = false; $("l-submit").textContent = "Giriş yap"; }
};
$("l-forgot").onclick = async () => {
  const email = $("l-email").value.trim(), msg = $("l-msg");
  if (!email) { msg.className = "login-msg"; msg.textContent = "Önce e-posta adresini yaz."; return; }
  try { await store.resetPassword(email); msg.className = "login-msg ok"; msg.textContent = "Şifre sıfırlama bağlantısı e-postana gönderildi."; }
  catch (err) { msg.className = "login-msg"; msg.textContent = authError(err); }
};

/* ================= İlk kurulum verisi ================= */
function seedIfNeeded() {
  if (!store || state.loaded.size < COLLECTIONS.length || state.settings.main || seedIfNeeded.done) return;
  seedIfNeeded.done = true;
  const t0 = Date.now();
  [["Eren Growth", "#F97316"], ["Hyde story", "#7C3AED"], ["Evde Fit", "#16A34A"], ["Kişisel", "#0EA5E9"]]
    .forEach(([name, color], i) => put("projects", "p" + i, { name, color, order: t0 + i }));
  ["Reels", "YouTube videosu", "Canlı yayın", "Toplantı", "Skool içeriği"].forEach((name, i) => put("types", "t" + i, { name, order: t0 + i }));
  if (store.mode === "demo") {
    const s = weekStart(new Date()), d = (n) => iso(addDays(s, n));
    const ex = [
      { title: "Örnek: Reels çekimi", date: d(0), project: "p0", type: "t0" },
      { title: "Örnek: Hyde story seslendirme", date: d(1), project: "p1", type: "t1" },
      { title: "Örnek: Skool canlı yayını", date: d(2), allDay: false, start: "21:00", end: "22:30", project: "p0", type: "t2" },
      { title: "Örnek: Antrenman", date: d(0), project: "p2", repeat: { freq: "weekdays", days: [0, 2, 4], until: null } },
      { title: "Örnek: Reels kurgu", date: d(3), project: "p0", type: "t0", done: false },
    ];
    ex.forEach((x, i) => put("items", "ex" + i, { allDay: true, start: "", end: "", type: "", note: "", repeat: null, done: false, skip: {}, doneDates: {}, created: t0 + i, ...x }));
    put("items", "ex5", { title: "Örnek fikir: Arabada bir gün vlogu", date: null, allDay: true, start: "", end: "", project: "p0", type: "", note: "", repeat: null, done: false, created: t0 });
  }
  put("settings", "main", { seeded: true, created: t0 });
}

/* ================= Başlat ================= */
(async function boot() {
  try {
    store = await initStore({
      onAuth(user) {
        state.user = user;
        $("boot").hidden = true;
        $("login").hidden = !!user; $("app").hidden = !user;
        if (!user) { state.loaded.clear(); COLLECTIONS.forEach((c) => (state[c] = {})); seedIfNeeded.done = false; return; }
        if (store && store.mode === "demo") $("notice").innerHTML = '<div class="notice">Demo modu: veriler sadece bu tarayıcıda duruyor. Firebase kurulumundan sonra giriş ekranı ve cihazlar arası senkron açılacak.</div>';
        fromHash(); render();
      },
      onData(col, data, meta) {
        state[col] = data;
        if (!meta.fromCache) state.loaded.add(col);
        seedIfNeeded();
        render();
      },
      onSync(s) {
        const el = $("sync"); el.dataset.s = s;
        el.textContent = { demo: "Demo", synced: "Senkron", saving: "Kaydediliyor…", offline: "Çevrimdışı", error: "Bağlantı sorunu" }[s] || "";
      },
    });
    seedIfNeeded(); render();
  } catch (err) {
    console.error(err);
    $("boot").textContent = "Uygulama açılamadı. İnternet bağlantını kontrol edip sayfayı yenile.";
  }
})();
