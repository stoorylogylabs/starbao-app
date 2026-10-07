/*
 * 星寶 Star Bao｜Supabase 雲端資料轉接層 (data adapter)
 * - config.js 有 supabaseUrl + supabaseAnonKey → 雲端模式；否則完全不啟用（示範模式不變）
 * - 做法：登入後把使用者可見的資料（RLS 過濾）載入記憶體，畫面程式不變；
 *   每次 Store.save() 時比對差異，只把新增／修改／刪除的資料列寫回 Supabase。
 */
(function () {
  "use strict";
  var SB = window.SB, U = SB.U, Store = SB.Store, cfg = SB.config();
  var Cloud = SB.Cloud = { enabled: cfg.cloud, cfg: cfg, client: null, user: null, profile: null, booted: false, leaderboard: null, invitations: [] };
  if (!Cloud.enabled) return;

  var SNAP = {};              // table → { id: { str, row } }
  var timer = null, flushing = null, again = false, lastFlushAt = 0, retryMs = 4000;
  Cloud.dirty = false;

  /* ---------- Store 改走雲端快取 ---------- */
  function emptyDb() {
    return { meta: { cloud: true }, settings: Store.defaultSettings(), productOverrides: {}, session: null, users: [], clients: [], assessments: [], quotes: [], tasks: [], questions: [], activity: [], invitations: [] };
  }
  Store.load = function () { if (!this._db) this._db = emptyDb(); return this._db; };
  Store.save = function () { Cloud.queue(); return true; };
  Store.reload = function () { return this.load(); };
  Store.reset = function () { throw new Error("雲端模式不可重設資料，請在 Supabase 後台管理。"); };

  /* ---------- 工具 ---------- */
  function stable(v) {
    if (v === undefined) return "null";
    if (v === null || typeof v !== "object") return JSON.stringify(v);
    if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
    return "{" + Object.keys(v).sort().filter(function (k) { return v[k] !== undefined; }).map(function (k) { return JSON.stringify(k) + ":" + stable(v[k]); }).join(",") + "}";
  }
  function ts(v) { if (!v) return null; var d = new Date(v); return isNaN(d) ? null : d.toISOString(); }
  var CONV = {
    text: function (v) { return v == null ? null : String(v); },
    int: function (v) { if (v === "" || v == null) return null; var n = parseInt(v, 10); return isNaN(n) ? null : n; },
    num: function (v) { if (v === "" || v == null) return null; var n = Number(v); return isNaN(n) ? null : n; },
    bool: function (v) { return !!v; },
    arr: function (v) { return Array.isArray(v) ? v.slice() : []; },
    ts: ts,
    date: function (v) { return v ? String(v).slice(0, 10) : null; }
  };
  /** 欄位對照：app 欄位 → [資料庫欄位, 型別, 預設值] */
  function Mapper(map, extra, skip) {
    var keys = Object.keys(map); skip = skip || [];
    return {
      toRow: function (rec) {
        var row = {};
        keys.forEach(function (k) { var m = map[k], v = CONV[m[1] || "text"](rec[k]); if (v == null && m.length > 2) v = m[2]; row[m[0]] = v; });
        if (extra) { var ex = {}; Object.keys(rec).forEach(function (k) { if (!map[k] && skip.indexOf(k) < 0 && rec[k] !== undefined) ex[k] = rec[k]; }); row[extra] = ex; }
        return row;
      },
      fromRow: function (row) {
        var rec = extra && row[extra] ? JSON.parse(JSON.stringify(row[extra])) : {};
        keys.forEach(function (k) { var m = map[k], v = row[m[0]]; if (m[1] === "ts") v = ts(v); if (m[1] === "num" && v != null) v = Number(v); if (v != null) rec[k] = v; });
        return rec;
      }
    };
  }
  var MAP = {
    clients: Mapper({ id: ["id"], name: ["name", "text", ""], phone: ["phone"], gender: ["gender"], age: ["age", "int"], location: ["location"], concerns: ["concerns", "arr"], status: ["status", "text", "新名單"], source: ["source"], resellerId: ["reseller_id"], refCode: ["ref_code"], notes: ["notes"], demo: ["is_demo", "bool"], createdAt: ["created_at", "ts"], updatedAt: ["updated_at", "ts"] }, "extra", ["attachments", "timeline"]),
    attachments: Mapper({ id: ["id"], clientId: ["client_id"], name: ["name", "text", "file"], type: ["mime"], size: ["size", "int"], storagePath: ["storage_path"], ocrText: ["ocr_text"], addedAt: ["created_at", "ts"] }, "extra", ["dataUrl", "_local"]),
    timeline: Mapper({ id: ["id"], clientId: ["client_id"], type: ["type", "text", "note"], text: ["text", "text", ""], refId: ["ref_id"], at: ["created_at", "ts"] }, null),
    assessments: Mapper({ id: ["id"], clientId: ["client_id"], resellerId: ["reseller_id"], source: ["source"], focus: ["focus", "arr"], redFlags: ["red_flags", "arr"], at: ["created_at", "ts"] }, "result"),
    quotes: Mapper({ id: ["id"], no: ["quote_no"], clientId: ["client_id"], resellerId: ["reseller_id"], status: ["status", "text", "草稿"], discountType: ["discount_type", "text", "pct"], discountValue: ["discount_value", "num", 0], validDays: ["valid_days", "int", 14], notes: ["notes"], demo: ["is_demo", "bool"], createdAt: ["created_at", "ts"] }, "extra", ["items"]),
    tasks: Mapper({ id: ["id"], title: ["title", "text", "(未命名)"], clientId: ["client_id"], resellerId: ["reseller_id"], status: ["status", "text", "todo"], due: ["due", "date"], priority: ["priority", "text", "normal"], channel: ["channel"], templateId: ["template_id"], note: ["note"], demo: ["is_demo", "bool"], doneAt: ["done_at", "ts"], createdAt: ["created_at", "ts"] }, "extra"),
    questions: Mapper({ id: ["id"], clientId: ["client_id"], resellerId: ["reseller_id"], text: ["question", "text", ""], at: ["created_at", "ts"] }, "extra"),
    activity: Mapper({ id: ["id"], icon: ["icon"], text: ["text", "text", ""], at: ["created_at", "ts"] }, "extra"),
    users: Mapper({ id: ["id"], name: ["name", "text", ""], phone: ["phone"], role: ["role"], tier: ["tier_id"], code: ["referral_code"], parentId: ["upline_id"], active: ["active", "bool"] }, null)
  };
  function nullIfEmpty(v) { return v === "" ? null : v; }

  /* ---------- 資料集合（含排序：父表先寫、子表先刪） ---------- */
  function flat(db, field) {
    var out = [];
    db.clients.forEach(function (c) { (c[field] || []).forEach(function (x) { out.push({ rec: Object.assign({}, x, { clientId: c.id }), orig: x }); }); });
    return out;
  }
  function plain(list) { return (list || []).map(function (x) { return { rec: x, orig: x }; }); }
  var isAdmin = function () { return Cloud.profile && Cloud.profile.role === "admin"; };
  var COLS = [
    { key: "users", table: "profiles", map: MAP.users, list: function (db) { return plain(db.users); }, updateOnly: true, adminOnly: false },
    { key: "settings", table: "app_settings", adminOnly: true, list: function (db) { var s = Object.assign({}, db.settings); delete s.prices; delete s.tiers; return [{ rec: { id: 1, data: s } }]; }, raw: true, noDelete: true },
    { key: "tiers", table: "commission_tiers", adminOnly: true, raw: true, list: function (db) { return (db.settings.tiers || []).map(function (t, i) { return { rec: { id: t.id, name: t.name, role: t.role || (["agent", "reseller", "manager", "admin"].indexOf(t.id) > -1 ? t.id : "agent"), rate: Number(t.rate) || 0, override: Number(t.override) || 0, target: t.target || null, sort: i + 1 } }; }); } },
    { key: "prices", table: "product_prices", pk: "product_id", adminOnly: true, raw: true, list: function (db) { var p = db.settings.prices || {}; return Object.keys(p).map(function (k) { return { rec: { product_id: k, price: CONV.num(p[k]) } }; }); } },
    { key: "overrides", table: "product_overrides", pk: "product_id", adminOnly: true, raw: true, list: function (db) { var o = db.productOverrides || {}; return Object.keys(o).map(function (k) { return { rec: { product_id: k, data: o[k] } }; }); } },
    { key: "clients", table: "clients", map: MAP.clients, list: function (db) { return plain(db.clients); } },
    { key: "attachments", table: "client_attachments", map: MAP.attachments, list: function (db) { return flat(db, "attachments"); }, attach: true },
    { key: "timeline", table: "client_timeline", map: MAP.timeline, list: function (db) { return flat(db, "timeline"); } },
    { key: "assessments", table: "assessments", map: MAP.assessments, list: function (db) { return plain(db.assessments); } },
    { key: "quotes", table: "quotations", map: MAP.quotes, list: function (db) { return plain(db.quotes); }, quotes: true },
    { key: "tasks", table: "tasks", map: MAP.tasks, list: function (db) { return plain(db.tasks); } },
    { key: "questions", table: "qa_logs", map: MAP.questions, list: function (db) { return plain(db.questions); } },
    { key: "activity", table: "activity", map: MAP.activity, list: function (db) { return plain(db.activity); }, insertOnly: true }
  ];
  function rowsOf(col, db) {
    var out = {};
    col.list(db).forEach(function (it) {
      var row = col.raw ? it.rec : col.map.toRow(it.rec);
      if (col.quotes) row = Object.assign({}, row, { _items: (it.rec.items || []).map(function (x, i) { return { position: i, product_id: x.productId, qty: Math.max(1, parseInt(x.qty, 10) || 1), unit_price: CONV.num(nullIfEmpty(x.unitPrice)) }; }) });
      var id = row[col.pk || "id"]; if (id == null) return;
      out[id] = { row: row, str: stable(row), orig: it.orig, rec: it.rec };
    });
    return out;
  }
  function snapshotAll(db) { COLS.forEach(function (col) { var r = rowsOf(col, db), s = {}; Object.keys(r).forEach(function (id) { s[id] = { str: r[id].str, row: r[id].row }; }); SNAP[col.key] = s; }); }

  /* ---------- 上傳附件 ---------- */
  function dataUrlToBlob(u) {
    var p = u.split(","), mime = (p[0].match(/:(.*?);/) || [])[1] || "application/octet-stream", bin = atob(p[1]), arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }
  function uploadAttachment(item) {
    var o = item.orig, r = item.rec;
    if (o.storagePath || !o.dataUrl || o.dataUrl.indexOf("data:") !== 0) return Promise.resolve();
    var safe = String(o.name || "file").replace(/[^\w.\-]+/g, "_").slice(-60);
    var path = r.clientId + "/" + o.id + "-" + safe;
    return Cloud.client.storage.from(cfg.storageBucket).upload(path, dataUrlToBlob(o.dataUrl), { contentType: o.type || "application/octet-stream", upsert: true })
      .then(function (res) { if (res.error) throw res.error; o.storagePath = path; item.rec.storagePath = path; item.row = MAP.attachments.toRow(item.rec); item.str = stable(item.row); });
  }

  /* ---------- 寫回 Supabase ---------- */
  function q(p) { return p.then(function (res) { if (res && res.error) throw res.error; return res; }); }
  Cloud.flush = function () {
    if (!Cloud.client || !Cloud.user || !Cloud.booted) return Promise.resolve(true);
    if (flushing) { again = true; return flushing; }
    var db = Store.load();
    setStatus("saving");
    var chain = Promise.resolve(), deletes = [];
    COLS.forEach(function (col) {
      if (col.adminOnly && !isAdmin()) return;
      var cur = rowsOf(col, db), prev = SNAP[col.key] || {};
      var changed = Object.keys(cur).filter(function (id) { return !prev[id] || prev[id].str !== cur[id].str; });
      var removed = Object.keys(prev).filter(function (id) { return !cur[id]; });
      if (col.insertOnly) { changed = changed.filter(function (id) { return !prev[id]; }); removed = []; }
      if (col.noDelete) removed = [];
      if (changed.length) chain = chain.then(function () { return upsert(col, changed.map(function (id) { return cur[id]; }), prev); });
      if (removed.length) deletes.unshift({ col: col, ids: removed, prev: prev });
    });
    deletes.forEach(function (d) { chain = chain.then(function () { return remove(d.col, d.ids, d.prev); }); });
    flushing = chain.then(function () {
      flushing = null; lastFlushAt = Date.now(); retryMs = 4000;
      if (again) { again = false; return Cloud.flush(); }
      Cloud.dirty = false; setStatus("saved"); return true;
    }, function (err) {
      flushing = null; again = false; console.warn("[Supabase] 同步失敗", err);
      setStatus("error", err && (err.message || err.error_description) || String(err));
      if (window.APP && APP.toast) APP.toast("雲端同步失敗：" + ((err && err.message) || err) + "（稍後自動重試）", "alert");
      clearTimeout(timer); timer = setTimeout(Cloud.flush, retryMs); retryMs = Math.min(retryMs * 2, 60000);
      return false;
    });
    return flushing;
  };
  function upsert(col, items, prev) {
    var S = SNAP[col.key] = SNAP[col.key] || {};
    var done = function (it) { var id = it.row[col.pk || "id"]; S[id] = { str: it.str, row: it.row }; };
    if (col.key === "users") {
      return items.reduce(function (p, it) {
        return p.then(function () {
          if (!prev[it.row.id]) return; // 新成員只能透過邀請＋建立帳號產生
          var r = it.row, body = { name: r.name, phone: r.phone };
          if (isAdmin()) Object.assign(body, { role: r.role, tier_id: r.tier_id, referral_code: r.referral_code, upline_id: r.upline_id, active: r.active });
          return q(Cloud.client.from("profiles").update(body).eq("id", r.id)).then(function () { done(it); });
        });
      }, Promise.resolve());
    }
    if (col.attach) {
      return items.reduce(function (p, it) { return p.then(function () { return uploadAttachment(it); }); }, Promise.resolve())
        .then(function () { return q(Cloud.client.from(col.table).upsert(items.map(function (i) { return i.row; }), { onConflict: "id" })); })
        .then(function () { items.forEach(done); });
    }
    if (col.quotes) {
      return items.reduce(function (p, it) {
        return p.then(function () {
          var row = Object.assign({}, it.row), lines = row._items; delete row._items;
          return q(Cloud.client.from("quotations").upsert(row, { onConflict: "id" }).select("id,quote_no")).then(function (res) {
            var srv = res.data && res.data[0];
            if (srv && srv.quote_no && srv.quote_no !== it.orig.no) { it.orig.no = srv.quote_no; it.row.quote_no = srv.quote_no; it.str = stable(it.row); }
            return q(Cloud.client.from("quotation_items").delete().eq("quotation_id", row.id));
          }).then(function () {
            if (!lines.length) return;
            return q(Cloud.client.from("quotation_items").insert(lines.map(function (l) { return Object.assign({ quotation_id: row.id }, l); })));
          }).then(function () { done(it); });
        });
      }, Promise.resolve());
    }
    var rows = items.map(function (i) { return i.row; });
    var opts = { onConflict: col.pk || "id" }; if (col.insertOnly) opts.ignoreDuplicates = true;
    return q(Cloud.client.from(col.table).upsert(rows, opts)).then(function () { items.forEach(done); });
  }
  function remove(col, ids, prev) {
    var S = SNAP[col.key];
    if (col.key === "users") {
      if (!isAdmin()) return Promise.resolve();
      return q(Cloud.client.from("profiles").update({ active: false }).in("id", ids)).then(function () { ids.forEach(function (id) { delete S[id]; }); });
    }
    var paths = col.attach ? ids.map(function (id) { return prev[id] && prev[id].row.storage_path; }).filter(Boolean) : [];
    return q(Cloud.client.from(col.table).delete().in(col.pk || "id", ids)).then(function () {
      ids.forEach(function (id) { delete S[id]; });
      if (paths.length) return Cloud.client.storage.from(cfg.storageBucket).remove(paths);
    });
  }
  Cloud.queue = function () {
    if (!Cloud.booted) return;
    Cloud.dirty = true; setStatus("pending");
    clearTimeout(timer); timer = setTimeout(Cloud.flush, 350);
  };
  window.addEventListener("beforeunload", function (e) { if (Cloud.dirty || flushing) { Cloud.flush(); e.preventDefault(); e.returnValue = "資料仍在同步中"; } });

  /* ---------- 載入 ---------- */
  function fetchAll(table, select, order) {
    var out = [], size = 1000;
    function page(from) {
      var qq = Cloud.client.from(table).select(select || "*").range(from, from + size - 1);
      if (order) qq = qq.order(order, { ascending: false });
      return q(qq).then(function (res) { out = out.concat(res.data || []); return res.data && res.data.length === size ? page(from + size) : out; });
    }
    return page(0);
  }
  Cloud.loadAll = function () {
    var me = Cloud.profile, c = Cloud.client;
    var jobs = {
      users: fetchAll("profiles", "*", "created_at"), tiers: fetchAll("commission_tiers"), settings: q(c.from("app_settings").select("*").eq("id", 1).maybeSingle()),
      prices: fetchAll("product_prices"), overrides: fetchAll("product_overrides"), clients: fetchAll("clients", "*", "created_at"),
      attachments: fetchAll("client_attachments", "*", "created_at"), timeline: fetchAll("client_timeline", "*", "created_at"),
      assessments: fetchAll("assessments", "*", "created_at"), quotes: fetchAll("quotations", "*, quotation_items(*)", "created_at"),
      tasks: fetchAll("tasks", "*", "created_at"), questions: fetchAll("qa_logs", "*", "created_at"),
      activity: q(c.from("activity").select("*").order("created_at", { ascending: false }).limit(150)).then(function (r) { return r.data || []; }),
      leaderboard: c.rpc("team_leaderboard").then(function (r) { return r.error ? null : r.data; }),
      // 團隊專屬內容：RLS 只回傳給已核准成員（未核准 → 空陣列）
      internal: c.from("internal_content").select("key,data").then(function (r) { return r.error ? [] : r.data || []; }, function () { return []; }),
      invitations: (me.role === "admin" || me.role === "manager") ? q(c.from("invitations").select("*").is("accepted_at", null).order("created_at", { ascending: false })).then(function (r) { return r.data || []; }) : Promise.resolve([])
    };
    var names = Object.keys(jobs);
    return Promise.all(names.map(function (k) { return jobs[k]; })).then(function (vals) {
      var R = {}; names.forEach(function (k, i) { R[k] = vals[i]; });
      var paths = R.attachments.map(function (a) { return a.storage_path; }).filter(Boolean);
      var signed = paths.length ? c.storage.from(cfg.storageBucket).createSignedUrls(paths, 60 * 60 * 12).then(function (r) { var m = {}; (r.data || []).forEach(function (x) { if (x.signedUrl) m[x.path] = x.signedUrl; }); return m; }) : Promise.resolve({});
      return signed.then(function (urls) { R.urls = urls; return R; });
    }).then(function (R) {
      var db = emptyDb();
      db.users = R.users.map(function (r) { var u = MAP.users.fromRow(r); u.email = r.email; u.joinedAt = ts(r.created_at); return u; });
      var s = Object.assign(Store.defaultSettings(), (R.settings.data && R.settings.data.data) || {});
      s.prices = {}; R.prices.forEach(function (p) { if (p.price != null) s.prices[p.product_id] = Number(p.price); });
      if (R.tiers.length) s.tiers = R.tiers.sort(function (a, b) { return a.sort - b.sort; }).map(function (t) { return { id: t.id, name: t.name, role: t.role, rate: Number(t.rate), override: Number(t.override), target: t.target || "" }; });
      db.settings = s;
      R.overrides.forEach(function (o) { db.productOverrides[o.product_id] = o.data; });
      var byClient = {};
      db.clients = R.clients.map(function (r) { var cl = MAP.clients.fromRow(r); cl.attachments = []; cl.timeline = []; byClient[cl.id] = cl; return cl; });
      R.attachments.forEach(function (r) { var cl = byClient[r.client_id]; if (!cl) return; var a = MAP.attachments.fromRow(r); delete a.clientId; a.dataUrl = R.urls[r.storage_path] || ""; cl.attachments.push(a); });
      R.timeline.forEach(function (r) { var cl = byClient[r.client_id]; if (!cl) return; var t = MAP.timeline.fromRow(r); delete t.clientId; cl.timeline.push(t); });
      db.assessments = R.assessments.map(MAP.assessments.fromRow);
      db.quotes = R.quotes.map(function (r) { var qt = MAP.quotes.fromRow(r); qt.items = (r.quotation_items || []).sort(function (a, b) { return a.position - b.position; }).map(function (i) { var it = { productId: i.product_id, qty: i.qty }; if (i.unit_price != null) it.unitPrice = Number(i.unit_price); return it; }); return qt; });
      db.tasks = R.tasks.map(MAP.tasks.fromRow);
      db.questions = R.questions.map(MAP.questions.fromRow);
      db.activity = R.activity.map(MAP.activity.fromRow);
      db.invitations = R.invitations;
      db.session = { userId: me.id, at: U.now() };
      Cloud.leaderboard = R.leaderboard;
      if (window.APP && APP.setInternal) APP.setInternal(R.internal);
      Store._db = db;
      snapshotAll(db);
      Cloud.lastLoad = Date.now();
      return db;
    });
  };

  /* ---------- 同步狀態 ---------- */
  var STATUS = { pending: "● 等待同步", saving: "⟳ 同步中…", saved: "✓ 已同步", error: "⚠ 同步失敗", stale: "↻ 有新資料，點此更新" };
  function setStatus(s, msg) {
    Cloud.status = s;
    var el = document.getElementById("syncState"); if (!el) return;
    el.textContent = STATUS[s] || s; el.className = "sync-" + s; el.title = msg || "";
  }
  Cloud.setStatus = setStatus;
  Cloud.bannerHTML = function () {
    var p = Cloud.profile || {};
    return '<div class="demo-banner cloud">雲端模式・Supabase｜' + U.esc(p.email || "") + '｜<button type="button" id="syncState" class="sync-saved">✓ 已同步</button></div>';
  };

  /* ---------- 重新載入（他人修改時） ---------- */
  Cloud.reload = function (silent) {
    return Cloud.flush().then(function () { return Cloud.loadAll(); }).then(function () {
      setStatus("saved");
      if (window.APP && APP.me()) { APP.refresh(); if (!silent) APP.toast("已載入最新雲端資料", "check"); }
    }).catch(function (e) { setStatus("error", e.message); });
  };
  var remoteTimer = null;
  function safeToRefresh() {
    if (document.querySelector("#modalRoot.show")) return false;
    var a = document.activeElement; if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.closest("#view")) return false;
    var h = location.hash.replace(/^#\/?/, "").split("/");
    return ["", "dashboard", "tasks", "team"].indexOf(h[0]) > -1 || ((h[0] === "clients" || h[0] === "quotes") && !h[1]);
  }
  Cloud.remoteChanged = function () {
    clearTimeout(remoteTimer);
    remoteTimer = setTimeout(function () {
      if (!Cloud.dirty && !flushing && safeToRefresh()) Cloud.reload(true);
      else setStatus("stale");
    }, 1500);
  };
  function subscribe() {
    try {
      Cloud.channel = Cloud.client.channel("starbao-sync")
        .on("postgres_changes", { event: "*", schema: "public" }, function () { if (Date.now() - lastFlushAt > 4000) Cloud.remoteChanged(); })
        .subscribe();
    } catch (e) { console.warn("[Supabase] realtime 無法啟用", e); }
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible" && Cloud.booted && Date.now() - (Cloud.lastLoad || 0) > 90000) Cloud.remoteChanged(); });
    document.addEventListener("click", function (e) { if (e.target && e.target.id === "syncState") { if (Cloud.status === "error") Cloud.flush(); else Cloud.reload(); } });
  }

  /* ---------- 登入流程 ---------- */
  function loadLib() {
    if (window.supabase && window.supabase.createClient) return Promise.resolve();
    return new Promise(function (res, rej) {
      var s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
      s.onload = res; s.onerror = function () { rej(new Error("無法載入 Supabase 元件，請檢查網路連線。")); };
      document.head.appendChild(s);
    });
  }
  function screen(html) { document.getElementById("root").innerHTML = '<div class="login"><div class="login-art"><img src="assets/brand/logo-wordmark.png" alt="星寶 Star Bao" style="height:40px;width:auto"><div><h1>我們不賣產品，<br>我們陪你找到適合的解決方案</h1><p>顧問與經銷商專用系統（雲端版）：客戶、評估、報價、跟進與團隊業績，多裝置即時同步。</p></div><p class="xs" style="color:#9C8768">© ' + new Date().getFullYear() + ' 星寶 Star Bao</p></div><div class="login-form">' + html + "</div></div>"; }
  function redirectUrl() { return location.href.split("#")[0].split("?")[0]; }
  function msg(text, kind) { var el = document.getElementById("authMsg"); if (el) { el.className = "note-box " + (kind || "amber"); el.style.display = "block"; el.textContent = text; } }
  function zh(err) {
    var m = (err && err.message) || String(err);
    if (/Invalid login/i.test(m)) return "電郵或密碼不正確。";
    if (/Email not confirmed/i.test(m)) return "電郵尚未驗證，請先到信箱點擊確認連結。";
    if (/already registered/i.test(m)) return "此電郵已有帳號，請直接登入或使用「忘記密碼」。";  // blocklist-ok：比對 Supabase 英文錯誤訊息，不是對外文案
    if (/Password should be/i.test(m)) return "密碼至少需要 6 個字元。";
    if (/rate limit/i.test(m)) return "嘗試次數過多，請稍後再試。";
    return m;
  }
  Cloud.showLogin = function (tab) {
    tab = tab || "login";
    var t = function (id, label) { return '<button type="button" data-atab="' + id + '" class="' + (tab === id ? "active" : "") + '">' + label + "</button>"; };
    var body = "";
    if (tab === "login") body = '<label class="f"><span class="lbl">電郵 Email</span><input class="input" id="aEmail" type="email" autocomplete="email"></label><label class="f"><span class="lbl">密碼 Password</span><input class="input" id="aPass" type="password" autocomplete="current-password"></label><div class="row" style="margin-top:12px"><button class="btn btn-gold" id="aLogin">登入</button><button class="btn btn-ghost" id="aMagic">寄送登入連結（免密碼）</button></div>';
    else if (tab === "signup") body = '<p class="small muted" style="margin-top:0">如果總部或經理已用您的電郵發出邀請，建立帳號後會自動啟用並套用角色；否則帳號需等待總部審核。</p><div class="fgrid"><label class="f"><span class="lbl">姓名</span><input class="input" id="sName"></label><label class="f"><span class="lbl">電話</span><input class="input" id="sPhone" type="tel"></label><label class="f full"><span class="lbl">電郵 Email</span><input class="input" id="sEmail" type="email" autocomplete="email"></label><label class="f"><span class="lbl">密碼（至少 6 字元）</span><input class="input" id="sPass" type="password" autocomplete="new-password"></label><label class="f"><span class="lbl">上線推薦碼（選填）</span><input class="input" id="sRef" style="text-transform:uppercase"></label></div><button class="btn btn-gold" id="aSignup" style="margin-top:12px">建立帳號</button>';
    else body = '<label class="f"><span class="lbl">電郵 Email</span><input class="input" id="fEmail" type="email"></label><button class="btn btn-gold" id="aForgot" style="margin-top:12px">寄送重設密碼連結</button>';
    screen('<h2>顧問系統登入</h2><div class="tabs">' + t("login", "登入") + t("signup", "建立帳號") + t("forgot", "忘記密碼") + "</div>" + body +
      '<div id="authMsg" class="note-box amber" style="display:none;margin-top:14px"></div><p class="xs muted" style="margin-top:16px">' + SB.icon("lock") + ' 雲端模式：帳號由 Supabase Auth 驗證，資料權限由資料庫 Row Level Security 控管。</p><p class="xs muted"><a href="' + U.esc(SB.config().siteUrl || "index.html") + '">← 返回品牌首頁</a></p>');
    Array.prototype.forEach.call(document.querySelectorAll("[data-atab]"), function (b) { b.onclick = function () { Cloud.showLogin(b.getAttribute("data-atab")); }; });
    var $ = function (id) { return document.getElementById(id); }, busy = function (b, on) { if (b) { b.disabled = on; } };
    if ($("aLogin")) {
      var go = function () {
        busy($("aLogin"), true);
        Cloud.client.auth.signInWithPassword({ email: $("aEmail").value.trim(), password: $("aPass").value }).then(function (r) {
          busy($("aLogin"), false); if (r.error) return msg(zh(r.error)); Cloud.afterLogin(r.data.user);
        });
      };
      $("aLogin").onclick = go; $("aPass").onkeydown = function (e) { if (e.key === "Enter") go(); };
      $("aMagic").onclick = function () {
        var em = $("aEmail").value.trim(); if (!em) return msg("請先輸入電郵。");
        Cloud.client.auth.signInWithOtp({ email: em, options: { emailRedirectTo: redirectUrl(), shouldCreateUser: false } }).then(function (r) { msg(r.error ? zh(r.error) : "登入連結已寄出，請到信箱點擊連結（同一個瀏覽器開啟）。", r.error ? "amber" : "green"); });
      };
    }
    if ($("aSignup")) $("aSignup").onclick = function () {
      var em = $("sEmail").value.trim(), pw = $("sPass").value;
      if (!em || pw.length < 6) return msg("請輸入電郵與至少 6 字元的密碼。");
      busy($("aSignup"), true);
      Cloud.client.auth.signUp({ email: em, password: pw, options: { emailRedirectTo: redirectUrl(), data: { name: $("sName").value.trim(), phone: U.normPhone($("sPhone").value), ref: $("sRef").value.trim().toUpperCase() } } }).then(function (r) {
        busy($("aSignup"), false);
        if (r.error) return msg(zh(r.error));
        if (r.data.session) return Cloud.afterLogin(r.data.user);
        msg("帳號已建立！請到信箱點擊確認連結後再登入。", "green");
      });
    };
    if ($("aForgot")) $("aForgot").onclick = function () {
      Cloud.client.auth.resetPasswordForEmail($("fEmail").value.trim(), { redirectTo: redirectUrl() }).then(function (r) { msg(r.error ? zh(r.error) : "重設密碼連結已寄出，請查看信箱。", r.error ? "amber" : "green"); });
    };
  };
  function pendingScreen(p) {
    screen('<h2>帳號待啟用</h2><p class="small">您好 ' + U.esc(p.name || p.email) + '，您的帳號已建立，正在等待總部審核啟用。</p><div class="note-box amber small">請通知您的上線或總部：到系統「團隊／經銷商」→「待審核成員」為您設定角色並啟用。<br>您的推薦碼：<b>' + U.esc(p.referral_code) + '</b></div><div class="row" style="margin-top:14px"><button class="btn btn-gold" id="pRetry">重新檢查</button><button class="btn btn-ghost" id="pOut">登出</button></div>');
    document.getElementById("pRetry").onclick = function () { Cloud.afterLogin(Cloud.user); };
    document.getElementById("pOut").onclick = function () { Cloud.signOut(); };
  }
  function loading(text) { screen('<div class="empty"><div class="spin"></div><p>' + U.esc(text) + "</p></div>"); }
  function errorScreen(text) { screen('<h2>無法連線</h2><div class="note-box red small">' + U.esc(text) + '</div><div class="row" style="margin-top:14px"><button class="btn btn-gold" onclick="location.reload()">重新整理</button><button class="btn btn-ghost" id="pOut">登出</button></div>'); var o = document.getElementById("pOut"); if (o) o.onclick = function () { Cloud.signOut(); }; }

  var afterBusy = false;
  Cloud.afterLogin = function (user) {
    if (afterBusy || !user) return Promise.resolve(); afterBusy = true;
    Cloud.user = user; loading("載入雲端資料中…");
    return q(Cloud.client.from("profiles").select("*").eq("id", user.id).maybeSingle()).then(function (r) {
      var p = r.data;
      if (!p) throw new Error("找不到此帳號的成員資料。請確認已在 Supabase 執行 schema.sql（含建立帳號觸發器），或請總部協助。");
      Cloud.profile = p;
      if (!p.active) { afterBusy = false; pendingScreen(p); return; }
      return Cloud.loadAll().then(function () {
        afterBusy = false;
        var first = !Cloud.booted; Cloud.booted = true;
        if (first) subscribe();
        window.APP.startShell();
        setStatus("saved");
      });
    }).catch(function (e) { afterBusy = false; console.error(e); errorScreen(e.message || String(e)); });
  };
  Cloud.signOut = function () {
    return (Cloud.booted ? Cloud.flush() : Promise.resolve()).then(function () { return Cloud.client.auth.signOut(); }).then(function () {
      Cloud.user = null; Cloud.profile = null; Cloud.booted = false; Store._db = null; SNAP = {};
      if (Cloud.channel) { try { Cloud.client.removeChannel(Cloud.channel); } catch (e) {} Cloud.channel = null; }
      if (window.APP && APP.internal) { location.reload(); return; }   // 清掉記憶體中的團隊專屬內容
      Cloud.showLogin();
    });
  };
  Cloud.start = function () {
    loading("連線中…");
    return loadLib().then(function () {
      if (!Cloud.client) {
        Cloud.client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
        Cloud.client.auth.onAuthStateChange(function (ev, session) {
          setTimeout(function () {
            if (ev === "PASSWORD_RECOVERY") return Cloud.passwordRecovery();
            if (ev === "SIGNED_IN" && session && !Cloud.user) Cloud.afterLogin(session.user);
          }, 0);
        });
      }
      return Cloud.client.auth.getSession();
    }).then(function (r) {
      var s = r && r.data && r.data.session;
      if (s) return Cloud.afterLogin(s.user);
      if (/type=recovery/.test(location.hash)) return;
      Cloud.showLogin();
    }).catch(function (e) { errorScreen(e.message || String(e)); });
  };
  Cloud.passwordRecovery = function () {
    screen('<h2>設定新密碼</h2><label class="f"><span class="lbl">新密碼（至少 6 字元）</span><input class="input" id="nPass" type="password" autocomplete="new-password"></label><button class="btn btn-gold" id="nSave" style="margin-top:12px">儲存新密碼</button><div id="authMsg" class="note-box amber" style="display:none;margin-top:14px"></div>');
    document.getElementById("nSave").onclick = function () {
      Cloud.client.auth.updateUser({ password: document.getElementById("nPass").value }).then(function (r) {
        if (r.error) return msg(zh(r.error));
        history.replaceState(null, "", redirectUrl()); Cloud.afterLogin(r.data.user);
      });
    };
  };
  Cloud.changePassword = function (pw) { return Cloud.client.auth.updateUser({ password: pw }).then(function (r) { if (r.error) throw new Error(zh(r.error)); }); };

  /* ---------- 團隊：邀請 ---------- */
  Cloud.invite = function (inv) {
    return q(Cloud.client.from("invitations").insert({ email: inv.email.toLowerCase(), name: inv.name || null, role: inv.role, upline_id: inv.upline_id || null, tier_id: inv.tier_id || null, referral_code: inv.referral_code || null, invited_by: Cloud.profile.id }).select("*"))
      .then(function (r) { Store.load().invitations.unshift(r.data[0]); return r.data[0]; });
  };
  Cloud.deleteInvite = function (id) {
    return q(Cloud.client.from("invitations").delete().eq("id", id)).then(function () { var db = Store.load(); db.invitations = db.invitations.filter(function (x) { return x.id !== id; }); });
  };

  /* ---------- 一次性遷移：本機 localStorage／備份檔 → Supabase ---------- */
  Cloud.readLocalDemo = function () { try { return JSON.parse(localStorage.getItem(Store.KEY) || "null"); } catch (e) { return null; } };
  Cloud.migrate = function (src, opts) {
    opts = opts || {};
    if (!isAdmin()) return Promise.reject(new Error("只有總部 Admin 可以執行遷移。"));
    if (!src || !src.clients) return Promise.reject(new Error("找不到可遷移的本機資料。"));
    var db = Store.load(), me = Cloud.profile, report = { clients: 0, assessments: 0, quotes: 0, tasks: 0, questions: 0, attachments: 0, skippedExisting: 0, skippedDemo: 0, unmatched: [] };
    var byCode = {}; db.users.forEach(function (u) { if (u.code) byCode[String(u.code).toUpperCase()] = u.id; });
    var umap = {};
    (src.users || []).forEach(function (u) {
      var hit = byCode[String(u.code || "").toUpperCase()];
      umap[u.id] = hit || me.id;
      if (!hit && u.role !== "admin") report.unmatched.push(u.name + "（" + u.code + "）");
    });
    var mapUser = function (id) { return umap[id] || (id && db.users.some(function (u) { return u.id === id; }) ? id : me.id); };
    var copy = function (x) { return JSON.parse(JSON.stringify(x)); };
    var has = function (list, id) { return list.some(function (x) { return x.id === id; }); };
    var skipped = {};
    (src.clients || []).forEach(function (c) {
      if (c.demo && !opts.includeDemo) { skipped[c.id] = 1; report.skippedDemo++; return; }
      if (has(db.clients, c.id)) { report.skippedExisting++; return; }
      var n = copy(c); n.resellerId = mapUser(c.resellerId); n.attachments = n.attachments || []; n.timeline = n.timeline || [];
      n.timeline.unshift({ id: U.uid("tl"), type: "note", text: "由本機資料遷移至雲端", at: U.now() });
      report.attachments += n.attachments.length; db.clients.push(n); report.clients++;
    });
    var okRef = function (r) { return !(r.clientId && skipped[r.clientId]) && (!r.demo || opts.includeDemo); };
    [["assessments", "assessments"], ["quotes", "quotes"], ["tasks", "tasks"], ["questions", "questions"]].forEach(function (k) {
      (src[k[0]] || []).forEach(function (r) {
        if (!okRef(r)) { report.skippedDemo++; return; }
        if (has(db[k[1]], r.id)) { report.skippedExisting++; return; }
        var n = copy(r); n.resellerId = mapUser(r.resellerId);
        if (n.clientId && !has(db.clients, n.clientId)) n.clientId = null;
        db[k[1]].push(n); report[k[0]]++;
      });
    });
    if (opts.settings && src.settings) {
      var s = src.settings;
      ["company", "currency", "quotePrefix", "quoteValidDays", "quoteTerms", "signature", "templates"].forEach(function (k) { if (s[k] != null) db.settings[k] = copy(s[k]); });
      if (s.prices) Object.keys(s.prices).forEach(function (k) { if (s.prices[k] !== "" && s.prices[k] != null) db.settings.prices[k] = Number(s.prices[k]); });
      if (s.tiers) db.settings.tiers = copy(s.tiers);
      if (src.productOverrides) Object.assign(db.productOverrides, copy(src.productOverrides));
    }
    db.activity.unshift({ id: U.uid("ac"), at: U.now(), icon: "upload", text: "從本機遷移 " + report.clients + " 位客戶、" + report.quotes + " 張報價單、" + report.tasks + " 項任務到雲端" });
    Cloud.dirty = true;
    return Cloud.flush().then(function (ok) {
      if (!ok) throw new Error("部分資料寫入失敗，系統會自動重試；請查看上方同步狀態。");
      return Cloud.loadAll().then(function () { return report; });
    });
  };
})();
