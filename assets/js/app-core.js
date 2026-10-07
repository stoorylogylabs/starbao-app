/* Star Bao 系統核心：外框、路由、權限、登入、共用元件 */
(function () {
  "use strict";
  var SB = window.SB, U = SB.U, icon = SB.icon, Store = SB.Store, D = SB.data;
  var APP = window.APP = { views: {}, SB: SB };
  var $ = APP.$ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = APP.$$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  APP.esc = U.esc;
  APP.db = function () { return Store.load(); };
  APP.cloud = function () { return !!(SB.Cloud && SB.Cloud.enabled); };
  APP.save = function () { return Store.save(); };

  /* ---------- 權限 ---------- */
  APP.ROLE = { admin: "總部 Admin", manager: "經理", reseller: "經銷商", agent: "代理" };
  APP.me = function () { var db = APP.db(); return db.session ? db.users.filter(function (u) { return u.id === db.session.userId; })[0] : null; };
  APP.user = function (id) { return APP.db().users.filter(function (u) { return u.id === id; })[0]; };
  APP.descendants = function (uid) {
    var users = APP.db().users, out = [];
    (function walk(id) { users.forEach(function (u) { if (u.parentId === id && out.indexOf(u.id) < 0) { out.push(u.id); walk(u.id); } }); })(uid);
    return out;
  };
  APP.visibleUserIds = function (me) {
    me = me || APP.me(); if (!me) return [];
    if (me.role === "admin") return APP.db().users.map(function (u) { return u.id; });
    // 雲端模式與資料庫 RLS 一致：只有經理可看下線，經銷商／代理只看自己
    if (APP.cloud() && me.role !== "manager") return [me.id];
    return [me.id].concat(APP.descendants(me.id));
  };
  APP.can = function (action, me) {
    me = me || APP.me(); if (!me) return false;
    var r = me.role;
    switch (action) {
      case "settings": case "editProducts": case "deleteData": case "prices": return r === "admin";
      case "manageTeam": return r === "admin" || r === "manager";
      case "assign": return r !== "agent";
      default: return true;
    }
  };
  APP.visible = function (list) {
    var ids = APP.visibleUserIds();
    return list.filter(function (x) { return !x.resellerId || ids.indexOf(x.resellerId) > -1 || APP.me().role === "admin"; });
  };
  APP.clients = function () { return APP.visible(APP.db().clients); };
  APP.client = function (id) { return APP.db().clients.filter(function (c) { return c.id === id; })[0]; };
  APP.initials = function (name) { name = String(name || "?").replace(/（.*?）|\(.*?\)/g, "").trim(); var cjk = name.match(/[\u3400-\u9fff]/); return cjk ? cjk[0] : name.split(/\s+/).map(function (w) { return w[0]; }).join("").slice(0, 2).toUpperCase(); };
  APP.cleanName = function (n) { return String(n || "").replace(/（示範資料）|（示範）/g, ""); };
  APP.roleTag = function (role) { return '<span class="role role-' + role + '">' + APP.ROLE[role] + "</span>"; };
  APP.solTags = function (ids, max) { return (ids || []).slice(0, max || 9).map(function (id) { var s = SB.sol(id); return s ? '<span class="tag" style="background:' + s.color + '1A;color:' + s.color + '">' + s.name + "</span>" : ""; }).join(" "); };

  /* ---------- 報價計算 ---------- */
  APP.priceOf = function (pid) { var v = APP.db().settings.prices[pid]; return v === "" || v == null || isNaN(v) ? null : Number(v); };
  APP.quoteCalc = function (q) {
    var unknown = false, sub = 0;
    var lines = (q.items || []).map(function (it) {
      var unit = it.unitPrice != null && it.unitPrice !== "" ? Number(it.unitPrice) : APP.priceOf(it.productId);
      var total = unit == null ? null : unit * (Number(it.qty) || 0);
      if (total == null) unknown = true; else sub += total;
      return { item: it, product: SB.prod(it.productId), unit: unit, total: total };
    });
    var disc = 0;
    if (!unknown) disc = q.discountType === "amt" ? Number(q.discountValue || 0) : sub * Number(q.discountValue || 0) / 100;
    return { lines: lines, unknown: unknown, subtotal: unknown ? null : sub, discount: unknown ? null : disc, total: unknown ? null : Math.max(0, sub - disc) };
  };
  APP.money = function (v) { return U.money(v, APP.db().settings.currency); };
  APP.nextQuoteNo = function () {
    var db = APP.db(), y = new Date().getFullYear(), pre = (db.settings.quotePrefix || "SB") + "-" + y + "-";
    var max = 0; db.quotes.forEach(function (q) { if (q.no && q.no.indexOf(pre) === 0) max = Math.max(max, parseInt(q.no.slice(pre.length), 10) || 0); });
    return pre + String(max + 1).padStart(4, "0");
  };

  /* ---------- UI 元件 ---------- */
  APP.toast = function (msg, ic) {
    var t = document.createElement("div"); t.className = "toast"; t.innerHTML = icon(ic || "check") + U.esc(msg);
    $("#toastRoot").appendChild(t); setTimeout(function () { t.style.opacity = "0"; t.style.transition = "opacity .3s"; }, 2200); setTimeout(function () { t.remove(); }, 2600);
  };
  APP.modal = function (opts) {
    var root = $("#modalRoot");
    root.innerHTML = '<div class="modal ' + (opts.wide ? "wide" : "") + '"><div class="modal-h"><h3>' + opts.title + '</h3><button class="icon-btn" data-mclose aria-label="關閉">' + icon("x") + '</button></div><div class="modal-b">' + opts.body + "</div>" +
      (opts.footer !== false ? '<div class="modal-f">' + (opts.footer || '<button class="btn btn-ghost" data-mclose>取消</button><button class="btn btn-gold" data-mok>' + (opts.ok || "儲存") + "</button>") + "</div>" : "") + "</div>";
    root.classList.add("show");
    var close = function () { root.classList.remove("show"); root.innerHTML = ""; document.removeEventListener("keydown", esc); };
    var esc = function (e) { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", esc);
    root.onclick = function (e) {
      if (e.target === root || e.target.closest("[data-mclose]")) { close(); return; }
      if (e.target.closest("[data-mok]") && opts.onOk) { if (opts.onOk(root.querySelector(".modal")) !== false) close(); }
    };
    if (opts.onOpen) opts.onOpen(root.querySelector(".modal"), close);
    var first = root.querySelector("input,select,textarea"); if (first && !opts.noFocus) setTimeout(function () { first.focus(); }, 50);
    return close;
  };
  /* ---------- 團隊專屬內容（團隊筆記、來源、原始海報、培訓資料；登入後由 Supabase 載入） ----------
   * 不放在網站程式碼裡：存在 Supabase 的 internal_content 資料表與私有 bucket「internal-assets」，
   * 只有已核准（active）的登入成員讀得到；登入後由 cloud.js 載入並呼叫 APP.setInternal()。 */
  APP.internal = null;
  APP.INTERNAL_BUCKET = "internal-assets";
  APP.setInternal = function (rows) {
    var by = {}; (rows || []).forEach(function (r) { by[r.key] = r.data; });
    if (!by.products && !by.training) { APP.internal = null; return; }
    APP.internal = { products: by.products || {}, science: by.science || {}, training: by.training || {}, images: by.images || {} };
    (SB.data.products || []).forEach(function (p) { var x = APP.internal.products[p.id]; if (x) Object.assign(p, x); });
    SB.data.science = Object.assign({}, SB.data.science, APP.internal.science);
  };
  APP.teamOnlyBox = function (what) {
    var msg = !APP.cloud() ? "示範模式不含團隊專屬內容。" + what + "存放在雲端資料庫，請使用雲端版系統並以已核准的成員帳號登入後查看。"
      : what + "只開放給已核准的成員；您的帳號核准後重新整理即可看到。";
    return '<div class="note-box int">' + icon("lock") + " " + U.esc(msg) + "</div>";
  };
  var signedCache = {};
  APP.internalUrl = function (path) {
    if (!path || !APP.cloud() || !SB.Cloud.client) return Promise.resolve("");
    var c = signedCache[path]; if (c && c.exp > Date.now()) return Promise.resolve(c.url);
    return SB.Cloud.client.storage.from(APP.INTERNAL_BUCKET).createSignedUrl(path, 3600).then(function (r) {
      var url = (r.data && r.data.signedUrl) || ""; if (url) signedCache[path] = { url: url, exp: Date.now() + 50 * 60000 }; return url;
    }).catch(function () { return ""; });
  };
  APP.loadInternalImages = function (el) {
    $$("img[data-internal-img]", el).forEach(function (img) {
      var path = img.getAttribute("data-internal-img"); if (!path) return;
      APP.internalUrl(path).then(function (u) { if (u) img.src = u; else img.replaceWith(document.createRange().createContextualFragment(APP.teamOnlyBox("此圖片"))); });
    });
  };
  APP.openPoster = function (pid) {
    var p = SB.prod(pid), poster = APP.internal && APP.internal.images && APP.internal.images.posters && APP.internal.images.posters[pid];
    if (!p || !poster) return;
    APP.modal({ title: U.esc(p.name) + "｜原始海報（團隊專屬，勿對外使用）", wide: true, footer: false,
      body: '<div class="note-box red" style="margin-bottom:10px">' + icon("lock") + " 原始海報含不可對外的宣傳字眼，只供團隊了解產品；對外請使用系統內的產品圖與合規用語。</div>" +
        '<img data-internal-img="' + U.esc(poster.image) + '" alt="' + U.esc(p.name) + ' 原始海報" style="width:100%;border-radius:12px;min-height:200px;background:#f5ecdd">',
      onOpen: function (m) { APP.loadInternalImages(m); } });
  };
  APP.confirm = function (msg, cb, okText) {
    APP.modal({ title: "請確認", body: "<p style='margin:0'>" + msg + "</p>", ok: okText || "確定", onOk: function () { cb(); } });
  };
  APP.copy = function (text, msg) { U.copy(text).then(function () { APP.toast(msg || "已複製到剪貼簿", "copy"); }); };
  APP.formData = function (el) {
    var o = {};
    $$("[name]", el).forEach(function (f) {
      if (f.type === "checkbox") { if (!o[f.name]) o[f.name] = []; if (f.checked) o[f.name].push(f.value); }
      else if (f.type === "radio") { if (f.checked) o[f.name] = f.value; else if (!(f.name in o)) o[f.name] = ""; }
      else o[f.name] = f.value.trim();
    });
    return o;
  };
  APP.userOptions = function (sel, includeNone) {
    var ids = APP.visibleUserIds();
    return (includeNone ? '<option value="">— 未指派 —</option>' : "") + APP.db().users.filter(function (u) { return ids.indexOf(u.id) > -1; }).map(function (u) {
      return '<option value="' + u.id + '"' + (u.id === sel ? " selected" : "") + ">" + U.esc(u.name) + "｜" + APP.ROLE[u.role] + "</option>";
    }).join("");
  };
  APP.clientOptions = function (sel, none) {
    return '<option value="">' + (none || "— 選擇客戶 —") + "</option>" + APP.clients().map(function (c) { return '<option value="' + c.id + '"' + (c.id === sel ? " selected" : "") + ">" + U.esc(c.name) + (c.phone ? "（" + c.phone + "）" : "") + "</option>"; }).join("");
  };
  APP.waBtn = function (phone, text, label, cls) {
    return '<a class="' + (cls || "icon-btn wa") + '" href="' + U.wa(phone, text) + '" target="_blank" rel="noopener" title="WhatsApp" data-wa-log>' + icon("whatsapp") + (label ? "<span>" + label + "</span>" : "") + "</a>";
  };
  APP.smsBtn = function (phone, text, label) {
    return '<a class="icon-btn" href="' + U.sms(phone, text) + '" title="短訊 SMS">' + icon("sms") + (label || "") + "</a>";
  };
  APP.addTimeline = function (clientId, type, text, refId) {
    var c = APP.client(clientId); if (!c) return;
    c.timeline = c.timeline || [];
    c.timeline.unshift({ id: U.uid("tl"), type: type, text: text, at: U.now(), refId: refId || null });
    c.updatedAt = U.now();
  };
  APP.log = function (t, ic) { Store.log(t, ic); };
  APP.tplVars = function (client, extra) {
    var me = APP.me();
    return Object.assign({ "客戶": client ? APP.cleanName(client.name) : "", "顧問": me ? APP.cleanName(me.name) : "", "產品": "", "方案": "", "報價單號": "" }, extra || {});
  };

  /* 圖片壓縮（附件存 localStorage，需控制大小） */
  APP.readFile = function (file, maxW) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onerror = rej;
      fr.onload = function () {
        if (!/^image\//.test(file.type)) {
          if (file.size > 800 * 1024) { rej(new Error("非圖片檔案請小於 800KB")); return; }
          res({ id: U.uid("f"), name: file.name, type: file.type || "application/octet-stream", dataUrl: fr.result, addedAt: U.now() }); return;
        }
        var img = new Image();
        img.onload = function () {
          var w = img.width, h = img.height, m = maxW || 1400;
          if (w > m) { h = Math.round(h * m / w); w = m; }
          var c = document.createElement("canvas"); c.width = w; c.height = h;
          var ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
          res({ id: U.uid("f"), name: file.name || "screenshot.jpg", type: "image/jpeg", dataUrl: c.toDataURL("image/jpeg", 0.78), addedAt: U.now() });
        };
        img.onerror = function () { res({ id: U.uid("f"), name: file.name, type: file.type, dataUrl: fr.result, addedAt: U.now() }); };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  };
  /** 綁定拖放／貼上／選檔 */
  APP.bindDrop = function (zone, onFiles) {
    if (!zone) return;
    var input = zone.querySelector("input[type=file]");
    ["dragenter", "dragover"].forEach(function (ev) { zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.add("over"); }); });
    ["dragleave", "drop"].forEach(function (ev) { zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.remove("over"); }); });
    zone.addEventListener("drop", function (e) { var f = Array.prototype.slice.call(e.dataTransfer.files || []); if (f.length) onFiles(f); });
    if (input) input.addEventListener("change", function () { var f = Array.prototype.slice.call(input.files || []); if (f.length) onFiles(f); input.value = ""; });
  };
  APP._pasteHandler = null;
  APP.onPaste = function (fn) { APP._pasteHandler = fn; };
  document.addEventListener("paste", function (e) {
    if (!APP._pasteHandler) return;
    var items = Array.prototype.slice.call((e.clipboardData || {}).items || []);
    var files = items.filter(function (i) { return i.kind === "file"; }).map(function (i) { return i.getAsFile(); }).filter(Boolean);
    if (files.length) { e.preventDefault(); APP._pasteHandler(files); }
  });

  /* OCR（Tesseract.js，CDN 動態載入；無法載入時優雅降級） */
  APP.ocr = function (dataUrl, onProgress) {
    function run() {
      return window.Tesseract.recognize(dataUrl, "chi_tra+eng", { logger: function (m) { if (onProgress && m.status) onProgress(m); } })
        .then(function (r) { return (r.data.text || "").replace(/[ \t]+/g, " ").replace(/(\S) (?=[\u4e00-\u9fff])/g, "$1").trim(); });
    }
    if (window.Tesseract) return run();
    return new Promise(function (res, rej) {
      var s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
      s.onload = function () { run().then(res, rej); };
      s.onerror = function () { rej(new Error("OCR 元件無法載入（可能離線）。請手動輸入文字。")); };
      document.head.appendChild(s);
    });
  };

  /* ---------- 外框 ---------- */
  var NAV = [
    { sec: "總覽" },
    { id: "dashboard", label: "儀表板 總覽", icon: "dashboard" },
    { sec: "解決方案" },
    { id: "catalog", label: "解決方案目錄", icon: "catalog" },
    { id: "assess", label: "健康評估", icon: "pulse" },
    { id: "qa", label: "智能問答／推薦", icon: "chat" },
    { sec: "客戶與銷售" },
    { id: "clients", label: "客戶管理 CRM", icon: "users", count: "newClients" },
    { id: "quotes", label: "報價單", icon: "quote" },
    { id: "tasks", label: "跟進任務", icon: "tasks", count: "dueTasks" },
    { sec: "團隊" },
    { id: "team", label: "團隊／經銷商", icon: "team" },
    { id: "training", label: "培訓中心", icon: "training" },
    { sec: "系統" },
    { id: "settings", label: "設定", icon: "settings" }
  ];
  APP.counts = function () {
    var today = U.today();
    var tasks = APP.visible(APP.db().tasks).filter(function (t) { return t.status !== "done" && t.due && t.due <= today; });
    var newC = APP.clients().filter(function (c) { return c.status === "新名單"; });
    return { dueTasks: tasks.length, newClients: newC.length };
  };

  function shell() {
    var me = APP.me(), db = APP.db(), counts = APP.counts();
    var nav = NAV.map(function (n) {
      if (n.sec) return '<div class="sb-sec">' + n.sec + "</div>";
      var c = n.count ? counts[n.count] : 0;
      return '<a href="#/' + n.id + '" data-nav="' + n.id + '">' + icon(n.icon) + "<span>" + n.label + "</span>" + (c ? '<span class="count' + (n.count === "newClients" ? " gold" : "") + '">' + c + "</span>" : "") + "</a>";
    }).join("");
    $("#root").innerHTML =
      (APP.cloud() ? SB.Cloud.bannerHTML() : '<div class="demo-banner">前端示範系統：資料儲存在此瀏覽器（localStorage），登入 PIN 僅為示範、非真正安全機制。標示「示範」者為示範資料。</div>') +
      '<div class="shell"><aside class="sidebar" id="sidebar"><div class="sb-brand"><img src="assets/brand/logo-wordmark.png" alt="星寶 Star Bao"><span>顧問<br>系統</span></div>' +
      '<nav class="sb-nav" aria-label="系統選單">' + nav + "</nav>" +
      '<div class="sb-foot"><div class="sb-user"><span class="avatar">' + U.esc(APP.initials(me.name)) + "</span><div><b>" + U.esc(APP.cleanName(me.name)) + "</b>" + APP.roleTag(me.role) + ' <span class="xs">推薦碼 ' + U.esc(me.code) + '</span></div></div><div class="row between"><a href="' + U.esc(SB.config().siteUrl || "index.html") + '" target="_blank" rel="noopener">' + icon("link") + ' 品牌首頁</a><a href="#" data-logout>' + icon("logout") + (APP.cloud() ? " 登出" : " 切換身分") + "</a></div></div></aside>" +
      '<div class="scrim" id="scrim"></div>' +
      '<div class="main"><header class="topbar"><button class="menu-btn" id="menuBtn" aria-label="開啟選單">' + icon("menu") + '</button><div><div class="crumb" id="crumb">星寶 Star Bao</div><h1 id="pageTitle">儀表板</h1></div>' +
      '<div class="tb-search"><span>' + icon("search") + '</span><input id="gSearch" placeholder="搜尋客戶、產品、成分…" autocomplete="off" aria-label="全域搜尋"><div class="results" id="gResults"></div></div>' +
      '<button class="btn btn-wa btn-sm" data-quickwa>' + icon("whatsapp") + '<span class="hide-s">直接 WhatsApp</span></button></header>' +
      '<main class="view" id="view"></main></div></div>' +
      '<button class="wa-float" data-quickwa aria-label="直接 WhatsApp">' + icon("whatsapp") + "<span>WhatsApp</span></button>";
    bindShell();
  }

  function bindShell() {
    var sb = $("#sidebar"), scrim = $("#scrim");
    $("#menuBtn").onclick = function () { sb.classList.add("open"); scrim.classList.add("show"); };
    scrim.onclick = function () { sb.classList.remove("open"); scrim.classList.remove("show"); };
    $$(".sb-nav a").forEach(function (a) { a.addEventListener("click", function () { sb.classList.remove("open"); scrim.classList.remove("show"); }); });
    document.querySelector("[data-logout]").onclick = function (e) { e.preventDefault(); if (APP.cloud()) { SB.Cloud.signOut(); return; } APP.db().session = null; APP.save(); APP.start(); };
    $$("[data-quickwa]").forEach(function (b) { b.onclick = function () { APP.quickWA(); }; });
    var gs = $("#gSearch"), gr = $("#gResults");
    gs.addEventListener("input", function () {
      var q = gs.value.trim().toLowerCase(); if (!q) { gr.style.display = "none"; return; }
      var cs = APP.clients().filter(function (c) { return (c.name + " " + (c.phone || "") + " " + (c.notes || "")).toLowerCase().indexOf(q) > -1; }).slice(0, 6);
      var ps = SB.products().filter(function (p) { return (p.name + p.tagline + (p.nameAlt || []).concat(p.searchAlt || [], p.packagingName ? [p.packagingName] : []).join(" ") + p.ingredients.map(function (i) { return i.name; }).join(" ")).toLowerCase().indexOf(q) > -1; }).slice(0, 6);
      gr.innerHTML = cs.map(function (c) { return '<a href="#/clients/' + c.id + '">' + icon("users") + U.esc(c.name) + "<small>客戶</small></a>"; }).join("") +
        ps.map(function (p) { return '<a href="#/catalog/' + p.id + '">' + icon("catalog") + U.esc(p.name) + "<small>產品</small></a>"; }).join("") || '<div class="empty small">找不到符合的結果</div>';
      gr.style.display = "block";
    });
    gs.addEventListener("blur", function () { setTimeout(function () { gr.style.display = "none"; }, 200); });
    gr.addEventListener("click", function () { gs.value = ""; gr.style.display = "none"; });
    // 記錄 WhatsApp 點擊到客戶時間軸
    document.getElementById("view").addEventListener("click", function (e) {
      var a = e.target.closest("[data-wa-client]");
      if (a) { APP.addTimeline(a.getAttribute("data-wa-client"), "whatsapp", "透過 WhatsApp 發送訊息" + (a.getAttribute("data-wa-what") ? "：" + a.getAttribute("data-wa-what") : "")); APP.save(); }
    });
  }

  APP.quickWA = function (preset) {
    preset = preset || {};
    var tpls = APP.db().settings.templates;
    APP.modal({
      title: icon("whatsapp") + " 直接 WhatsApp",
      body: '<div class="stack"><div class="fgrid"><div class="f"><label>選擇客戶（選填）</label><select class="select" name="cid">' + APP.clientOptions(preset.clientId, "— 不指定 —") + '</select></div>' +
        '<div class="f"><label>電話號碼</label><input class="input" name="phone" placeholder="例：010-927 9131" value="' + U.esc(preset.phone || "") + '"></div></div>' +
        '<div class="f"><label>訊息範本</label><select class="select" name="tpl"><option value="">— 自行輸入 —</option>' + tpls.map(function (t) { return '<option value="' + t.id + '">' + U.esc(t.name) + "</option>"; }).join("") + "</select></div>" +
        '<div class="f"><label>訊息內容</label><textarea class="textarea" name="msg" rows="6">' + U.esc(preset.text || "") + '</textarea></div><p class="xs muted" style="margin:0">馬來西亞號碼會自動轉成國際格式（例：010-9279131 → 60109279131）。不填號碼時，WhatsApp 會讓您自行選擇聯絡人。</p></div>',
      footer: '<button class="btn btn-ghost" data-mclose>取消</button><button class="btn btn-ghost" data-sms>' + icon("sms") + '短訊 SMS</button><button class="btn btn-wa" data-send>' + icon("whatsapp") + "開啟 WhatsApp</button>",
      onOpen: function (m, close) {
        var cid = $("[name=cid]", m), ph = $("[name=phone]", m), tpl = $("[name=tpl]", m), msg = $("[name=msg]", m);
        function fill() { var c = APP.client(cid.value); var t = tpls.filter(function (x) { return x.id === tpl.value; })[0]; if (t) msg.value = U.fill(t.text, APP.tplVars(c)); }
        cid.onchange = function () { var c = APP.client(cid.value); if (c) ph.value = c.phone || ""; fill(); };
        tpl.onchange = fill;
        function go(kind) {
          var url = kind === "sms" ? U.sms(ph.value, msg.value) : U.wa(ph.value, msg.value);
          if (cid.value) { APP.addTimeline(cid.value, "whatsapp", (kind === "sms" ? "發送短訊：" : "發送 WhatsApp：") + msg.value.slice(0, 60)); APP.save(); }
          window.open(url, "_blank"); close();
        }
        $("[data-send]", m).onclick = function () { go("wa"); };
        $("[data-sms]", m).onclick = function () { go("sms"); };
      }
    });
  };

  /* ---------- 路由 ---------- */
  APP.go = function (hash) { if (location.hash === hash) APP.route(); else location.hash = hash; };
  APP.route = function () {
    if (!APP.me()) return;
    var parts = (location.hash.replace(/^#\/?/, "") || "dashboard").split("/");
    var name = parts[0], view = APP.views[name];
    if (!view) { name = "dashboard"; view = APP.views.dashboard; }
    APP.onPaste(null);
    $$(".sb-nav a").forEach(function (a) { a.classList.toggle("active", a.getAttribute("data-nav") === name); });
    var counts = APP.counts();
    $$(".sb-nav a").forEach(function (a) { var n = NAV.filter(function (x) { return x.id === a.getAttribute("data-nav"); })[0]; var badge = a.querySelector(".count"); if (n && n.count) { var c = counts[n.count]; if (badge && !c) badge.remove(); else if (badge) badge.textContent = c; else if (c) a.insertAdjacentHTML("beforeend", '<span class="count' + (n.count === "newClients" ? " gold" : "") + '">' + c + "</span>"); } });
    var el = $("#view");
    $("#pageTitle").textContent = view.title;
    $("#crumb").textContent = "星寶 Star Bao ／ " + (view.group || "系統");
    document.title = view.title + "｜星寶 Star Bao 系統";
    try { el.innerHTML = view.render(parts.slice(1)); if (view.bind) view.bind(el, parts.slice(1)); }
    catch (err) { console.error(err); el.innerHTML = '<div class="card card-b note-box red">頁面發生錯誤：' + U.esc(err.message) + "</div>"; }
    window.scrollTo(0, 0);
  };
  APP.refresh = function () { APP.route(); };

  /* ---------- 登入 ---------- */
  function login() {
    var db = APP.db(), sel = null;
    $("#root").innerHTML = '<div class="login"><div class="login-art"><img src="assets/brand/logo-wordmark.png" alt="星寶 Star Bao" style="height:40px;width:auto"><div><h1>我們不賣產品，<br>我們陪你找到適合的解決方案</h1><p>顧問與經銷商專用系統：解決方案目錄、健康生活評估、智能問答、客戶管理、報價單、跟進任務與團隊業績，一站完成。</p></div><p class="xs" style="color:#9C8768">© ' + new Date().getFullYear() + " 星寶 Star Bao</p></div>" +
      '<div class="login-form"><h2>選擇登入身分</h2><p class="muted small">示範帳號已預設建立，可在「團隊／經銷商」新增成員。</p><div class="acct">' +
      db.users.map(function (u) { return '<button type="button" data-u="' + u.id + '"><span class="avatar">' + U.esc(APP.initials(u.name)) + "</span><span><b>" + U.esc(u.name) + "</b><small>" + APP.ROLE[u.role] + "・推薦碼 " + U.esc(u.code) + (u.demo ? "・PIN " + U.esc(u.pin) : "") + "</small></span></button>"; }).join("") +
      '</div><label class="f"><span class="lbl">PIN 碼</span><div class="pin"><input class="input" id="pin" type="password" inputmode="numeric" maxlength="6" placeholder="••••" autocomplete="off"><button class="btn btn-gold" id="loginBtn">登入</button></div></label>' +
      '<p class="note-box amber" style="margin-top:16px">' + icon("lock") + " 這是前端示範登入：PIN 碼存放於瀏覽器，僅用於切換角色視角，<b>不是真正的安全機制</b>。正式上線請改用具後端驗證的系統。</p>" +
      '<p class="xs muted"><a href="' + U.esc(SB.config().siteUrl || "index.html") + '">← 返回品牌首頁</a></p></div></div>';
    $$("[data-u]").forEach(function (b) { b.onclick = function () { $$("[data-u]").forEach(function (x) { x.classList.remove("sel"); }); b.classList.add("sel"); sel = b.getAttribute("data-u"); $("#pin").focus(); }; });
    function doLogin() {
      if (!sel) { APP.toast("請先選擇登入身分", "alert"); return; }
      var u = APP.user(sel);
      if (String(u.pin || "") !== $("#pin").value.trim()) { APP.toast("PIN 碼不正確", "alert"); $("#pin").select(); return; }
      db.session = { userId: u.id, at: U.now() }; APP.save(); APP.start();
    }
    $("#loginBtn").onclick = doLogin;
    $("#pin").addEventListener("keydown", function (e) { if (e.key === "Enter") doLogin(); });
  }

  APP.startShell = function () {
    if (!APP.me()) { if (APP.cloud()) SB.Cloud.showLogin(); else login(); return; }
    shell();
    if (!APP._routing) { window.addEventListener("hashchange", APP.route); APP._routing = true; }
    APP.route();
  };
  APP.start = function () {
    // 雲端模式：Supabase 登入；已登入時只重繪畫面
    if (APP.cloud()) { if (SB.Cloud.booted) APP.startShell(); else SB.Cloud.start(); return; }
    Store.load();
    // 支援 ?as=u-admin&pin=8888 自動登入（方便截圖／示範）
    var m = location.search.match(/[?&]as=([^&]+)/), p = location.search.match(/[?&]pin=([^&]+)/);
    if (m && p) { var u = APP.user(decodeURIComponent(m[1])); if (u && u.pin === decodeURIComponent(p[1])) { APP.db().session = { userId: u.id, at: U.now() }; APP.save(); } }
    if (!APP.me()) { login(); return; }
    shell();
    if (!APP._routing) { window.addEventListener("hashchange", APP.route); APP._routing = true; }
    APP.route();
  };
  // 其他分頁（例如首頁）寫入新名單時同步
  window.addEventListener("storage", function (e) { if (!APP.cloud() && e.key === Store.KEY) { Store.reload(); if (APP.me()) { APP.toast("資料已同步（可能有新名單）", "users"); APP.route(); } } });
})();
