/* 視圖 A：儀表板、解決方案目錄、健康評估、智能問答 */
(function () {
  "use strict";
  var APP = window.APP, SB = APP.SB, U = SB.U, icon = SB.icon, D = SB.data, $ = APP.$, $$ = APP.$$, esc = U.esc;

  /* ====================== 儀表板 ====================== */
  APP.views.dashboard = {
    title: "儀表板 總覽", group: "總覽",
    render: function () {
      var db = APP.db(), me = APP.me(), today = U.today();
      var clients = APP.clients(), tasks = APP.visible(db.tasks), quotes = APP.visible(db.quotes);
      var open = tasks.filter(function (t) { return t.status !== "done"; });
      var dueToday = open.filter(function (t) { return t.due === today; });
      var overdue = open.filter(function (t) { return t.due && t.due < today; });
      var month = today.slice(0, 7);
      var qMonth = quotes.filter(function (q) { return (q.createdAt || "").slice(0, 7) === month; });
      var won = quotes.filter(function (q) { return q.status === "已成交"; });
      var wonAmt = 0, wonUnknown = false; won.forEach(function (q) { var c = APP.quoteCalc(q); if (c.total == null) wonUnknown = true; else wonAmt += c.total; });
      var h = new Date().getHours(), greet = h < 12 ? "早安" : h < 18 ? "午安" : "晚安";
      var sols = D.solutions.map(function (s) { return { s: s, n: clients.filter(function (c) { return (c.concerns || []).indexOf(s.id) > -1; }).length }; }).sort(function (a, b) { return b.n - a.n; });
      var maxN = Math.max(1, sols[0] ? sols[0].n : 1);
      var stat = ["新名單", "洽談中", "已成交", "暫緩"], colors = { "新名單": "#4D6C8C", "洽談中": "#C98A1B", "已成交": "#6E8D5C", "暫緩": "#B9AC9C" };
      var sc = stat.map(function (s) { return { s: s, n: clients.filter(function (c) { return c.status === s; }).length }; });
      var lb = APP.leaderboard("deals").slice(0, 3);
      var taskList = overdue.concat(dueToday).slice(0, 7);

      return '<section class="greet"><span class="avatar" style="width:52px;height:52px;font-size:1.1rem">' + esc(APP.initials(me.name)) + '</span><div><h2>' + greet + "，" + esc(APP.cleanName(me.name)) + '</h2><p>' + U.fmtDate(U.now()) + "・" + APP.ROLE[me.role] + "・今天有 " + dueToday.length + " 項任務" + (overdue.length ? "，" + overdue.length + " 項已逾期" : "") + '</p></div>' +
        '<div class="qa"><a class="btn btn-gold btn-sm" href="#/clients/new">' + icon("plus") + '新增客戶</a><a class="btn btn-ghost btn-sm" href="#/assess">' + icon("pulse") + '健康評估</a><a class="btn btn-ghost btn-sm" href="#/qa">' + icon("chat") + '智能問答</a><a class="btn btn-ghost btn-sm" href="#/quotes/new">' + icon("quote") + "建立報價單</a></div></section>" +
        '<div class="grid g-5" style="margin-bottom:18px">' +
        kpi("#/clients", "users", "客戶數", clients.length, "新名單 " + sc[0].n + " 位", "") +
        kpi("#/tasks", "tasks", "待跟進", open.length, overdue.length ? overdue.length + " 項逾期" : "沒有逾期任務", "k2", overdue.length ? "red" : "") +
        kpi("#/tasks", "clock", "今日任務", dueToday.length, "含逾期共 " + (dueToday.length + overdue.length) + " 項", "k3") +
        kpi("#/quotes", "quote", "報價單", quotes.length, "本月新增 " + qMonth.length + " 張", "k4") +
        kpi("#/team", "trophy", "團隊業績", won.length + " 單", wonUnknown || !won.length ? (won.length ? "金額：價格待定" : "尚無成交") : APP.money(wonAmt), "k5") +
        "</div>" +
        '<div class="grid g-main"><div class="stack">' +
        '<div class="card"><div class="card-h"><h2>' + icon("clock") + '今日與逾期任務</h2><div class="actions"><a class="btn btn-ghost btn-sm" href="#/tasks">查看看板</a></div></div><div class="card-b tight">' +
        (taskList.length ? taskList.map(function (t) {
          var c = APP.client(t.clientId), tpl = db.settings.templates.filter(function (x) { return x.id === t.templateId; })[0];
          var msg = tpl ? U.fill(tpl.text, APP.tplVars(c)) : "";
          return '<div class="li"><span class="act-ic">' + icon(t.channel === "sms" ? "sms" : "whatsapp") + '</span><div><div class="ttl">' + esc(t.title) + '</div><div class="meta">' + (c ? esc(c.name) + "・" : "") + (t.due < today ? '<span style="color:var(--red);font-weight:600">逾期 ' + U.fmtDate(t.due) + "</span>" : "今天到期") + '</div></div><div class="end">' +
            (c && c.phone ? '<a class="icon-btn wa" target="_blank" rel="noopener" href="' + U.wa(c.phone, msg) + '" data-wa-client="' + c.id + '" data-wa-what="' + esc(t.title) + '">' + icon("whatsapp") + "</a>" + APP.smsBtn(c.phone, msg) : "") +
            '<button class="icon-btn" data-done="' + t.id + '" title="標記完成">' + icon("check") + "</button></div></div>";
        }).join("") : '<div class="empty">' + icon("check") + "<div>今天沒有待辦任務，太棒了！</div></div>") + "</div></div>" +
        '<div class="card"><div class="card-h"><h2>' + icon("star") + '最近動態</h2></div><div class="card-b tight">' +
        (db.activity.slice(0, 8).map(function (a) { return '<div class="li"><span class="act-ic">' + icon(a.icon || "star") + '</span><div><div class="ttl" style="font-weight:500">' + esc(a.text) + '</div><div class="meta">' + U.ago(a.at) + "</div></div></div>"; }).join("") || '<div class="empty">尚無動態</div>') + "</div></div>" +
        "</div><div class=\"stack\">" +
        '<div class="card"><div class="card-h"><h2>' + icon("users") + '客戶狀態</h2></div><div class="card-b"><div class="pipe">' + sc.map(function (x) { return x.n ? '<i style="width:' + (x.n / Math.max(1, clients.length) * 100) + "%;background:" + colors[x.s] + '" title="' + x.s + '"></i>' : ""; }).join("") + '</div><div class="row" style="gap:14px">' + sc.map(function (x) { return '<span class="small"><span class="pri" style="background:' + colors[x.s] + '"></span> ' + x.s + " <b>" + x.n + "</b></span>"; }).join("") + "</div></div></div>" +
        '<div class="card"><div class="card-h"><h2>' + icon("leaf") + '客戶關注的解決方案</h2></div><div class="card-b">' + sols.filter(function (x) { return x.n; }).slice(0, 7).map(function (x) { return '<div class="hbar"><span>' + x.s.name + '</span><span class="t"><i style="width:' + (x.n / maxN * 100) + "%;background:" + x.s.color + '"></i></span><b>' + x.n + "</b></div>"; }).join("") + (sols.some(function (x) { return x.n; }) ? "" : '<div class="empty small">尚無資料</div>') + "</div></div>" +
        '<div class="card"><div class="card-h"><h2>' + icon("trophy") + '業績排行</h2><div class="actions"><a class="btn btn-ghost btn-sm" href="#/team">完整排行</a></div></div><div class="card-b"><div class="lb">' + lb.map(function (r, i) { return '<div class="lb-row r' + (i + 1) + '"><span class="rk">' + (i + 1) + '</span><span class="avatar sm">' + esc(APP.initials(r.user.name)) + "</span><div><b>" + esc(APP.cleanName(r.user.name)) + '</b><div class="xs muted">' + APP.ROLE[r.user.role] + '</div></div><div class="v">' + r.deals + " 單<small>" + r.amountLabel + "</small></div></div>"; }).join("") + "</div></div></div>" +
        "</div></div>";
      function kpi(href, ic, lbl, val, sub, cls, subcls) {
        return '<a class="card kpi ' + (cls || "") + '" href="' + href + '"><span class="ic">' + icon(ic) + '</span><span class="lbl">' + lbl + '</span><span class="val">' + val + '</span><span class="sub ' + (subcls || "") + '">' + esc(sub) + "</span></a>";
      }
    },
    bind: function (el) {
      el.addEventListener("click", function (e) {
        var d = e.target.closest("[data-done]"); if (!d) return;
        var t = APP.db().tasks.filter(function (x) { return x.id === d.getAttribute("data-done"); })[0];
        if (t) { t.status = "done"; t.doneAt = U.now(); if (t.clientId) APP.addTimeline(t.clientId, "task", "完成任務：" + t.title, t.id); APP.log("完成任務：" + t.title, "check"); APP.save(); APP.toast("已標記完成"); APP.refresh(); }
      });
    }
  };

  /* ====================== 解決方案目錄 ====================== */
  var catState = { sol: "all", q: "", line: "all" };
  APP.views.catalog = {
    title: "解決方案目錄", group: "解決方案",
    render: function (args) {
      if (args[0]) return detail(args[0]);
      var ps = SB.products();
      return '<div class="page-head"><div><h2>解決方案目錄</h2><p>我們不賣產品，我們陪你找到適合的解決方案——依客戶需求，從 10 大方向挑選配方。</p></div><div class="actions">' +
        (APP.can("editProducts") ? '<button class="btn btn-ghost btn-sm" data-export-products>' + icon("download") + "匯出 products.js</button>" : "") + "</div></div>" +
        '<div class="toolbar"><div class="search-in">' + icon("search") + '<input class="input" id="catQ" placeholder="搜尋產品、成分、功效（例：GABA、便秘、鐵觀音）" value="' + esc(catState.q) + '"></div>' +
        '<select class="select" id="catLine"><option value="all">全部系列</option><option value="supplement"' + (catState.line === "supplement" ? " selected" : "") + '>營養補充食品</option><option value="skincare"' + (catState.line === "skincare" ? " selected" : "") + ">時光駐顏（肌膚）</option></select></div>" +
        '<div class="chipbar" style="margin-bottom:18px"><button data-sol="all" class="' + (catState.sol === "all" ? "active" : "") + '">全部方案</button>' + D.solutions.map(function (s) { return '<button data-sol="' + s.id + '" class="' + (catState.sol === s.id ? "active" : "") + '">' + s.name + "</button>"; }).join("") + "</div>" +
        (catState.sol !== "all" ? '<div class="card card-b" style="margin-bottom:18px;display:flex;gap:14px;align-items:center"><span class="act-ic" style="background:' + SB.sol(catState.sol).color + ';color:#fff;width:44px;height:44px">' + icon(SB.sol(catState.sol).icon) + '</span><div><b class="h-serif" style="font-size:1.1rem">' + SB.sol(catState.sol).name + '</b><div class="small muted">' + SB.sol(catState.sol).desc + "</div></div></div>" : "") +
        '<div class="pgrid" id="catGrid">' + ps.map(card).join("") + "</div><div class='empty' id='catEmpty' style='display:none'>" + icon("search") + "<div>找不到符合的產品</div></div>";
    },
    bind: function (el, args) {
      if (args[0]) return bindDetail(el, args[0]);
      function apply() {
        var q = catState.q.toLowerCase(), n = 0;
        $$(".pcard", el).forEach(function (c) {
          var p = SB.prod(c.getAttribute("data-id"));
          var sols = p.solutions.primary.concat(p.solutions.secondary);
          var txt = (p.name + p.tagline + p.description + (p.nameAlt || []).concat(p.searchAlt || [], p.packagingName ? [p.packagingName] : []).join(" ") + p.benefits.join(" ") + p.ingredients.map(function (i) { return i.name + i.desc; }).join(" ") + p.highlights.join(" ")).toLowerCase();
          var ok = (catState.sol === "all" || sols.indexOf(catState.sol) > -1) && (catState.line === "all" || p.line === catState.line) && (!q || txt.indexOf(q) > -1);
          c.style.display = ok ? "" : "none"; if (ok) n++;
        });
        $("#catEmpty").style.display = n ? "none" : "block";
      }
      $("#catQ").addEventListener("input", function (e) { catState.q = e.target.value; apply(); });
      $("#catLine").addEventListener("change", function (e) { catState.line = e.target.value; apply(); });
      $$(".chipbar button", el).forEach(function (b) { b.onclick = function () { catState.sol = b.getAttribute("data-sol"); APP.refresh(); }; });
      var ex = $("[data-export-products]", el); if (ex) ex.onclick = exportProducts;
      apply();
    }
  };
  function card(p) {
    var s = SB.sol(p.solutions.primary[0]);
    return '<a class="pcard" href="#/catalog/' + p.id + '" data-id="' + p.id + '"><div class="im"><img src="' + p.thumb + '" alt="' + esc(p.name) + '" loading="lazy"><span class="tag" style="background:' + s.color + ';color:#fff">' + s.name + '</span></div><div class="bd"><span class="xs" style="color:var(--gold-deep);letter-spacing:.08em">' + esc(p.series) + "</span><h3>" + esc(p.name) + "</h3><p>" + esc(p.tagline) + '</p><div class="ft">' +
      (p.patents.length ? '<span class="tag green">' + icon("patent") + p.patents.length + " 項專利</span>" : '<span class="tag gray">專利資料待補</span>') + '<span class="tag">' + p.benefits.length + " 項功效</span>" + (p.packagingNote ? '<span class="tag red" title="' + esc(p.packagingNote) + '">⚠️ 確認包裝名稱</span>' : '') + (APP.priceOf(p.id) != null ? '<span class="tag blue">' + APP.money(APP.priceOf(p.id)) + "</span>" : '<span class="tag amber">價格待定</span>') + "</div></div></a>";
  }
  function productText(p) {
    return "【" + p.name + "】" + p.tagline + "\n" + p.description + "\n\n✨ 亮點特色\n" + p.highlights.map(function (h) { return "・" + h; }).join("\n") +
      "\n\n🏅 專利原料\n" + (p.patents.length ? p.patents.map(function (h) { return "・" + h; }).join("\n") : "・資料待補") +
      "\n\n✅ 功效重點\n" + p.benefits.map(function (h, i) { return (i + 1) + ". " + h; }).join("\n") +
      "\n\n👥 適合：" + p.suitableFor.join("、") + "\n\n※ " + (p.line === "supplement" ? D.disclaimers.supplement : D.disclaimers.skincare);
  }
  APP.productText = productText;
  function detail(id) {
    var p = SB.prod(id); if (!p) return '<div class="empty">找不到此產品</div>';
    var sols = p.solutions.primary.map(function (s) { return '<span class="tag" style="background:' + SB.sol(s).color + ';color:#fff">' + SB.sol(s).name + "</span>"; }).join(" ") + " " + APP.solTags(p.solutions.secondary);
    var ov = APP.db().productOverrides[p.id];
    return '<div class="row" style="margin-bottom:14px"><a class="btn btn-ghost btn-sm" href="#/catalog">' + icon("back") + "返回目錄</a>" + (ov ? '<span class="tag amber">已於系統內修改</span>' : "") + "</div>" +
      '<div class="pdetail"><div class="poster"><img src="' + p.image + '" alt="' + esc(p.name) + ' 產品海報"></div><div>' +
      '<span class="xs" style="color:var(--gold-deep);letter-spacing:.12em">' + esc(p.series) + "・" + esc(p.category) + "</span><h2>" + esc(p.name) + '</h2><p style="margin:0 0 8px;font-weight:600;color:var(--brown-2)">' + esc(p.tagline) + '</p><div class="row" style="margin-bottom:12px">' + sols + "</div>" +
      '<div class="row" style="margin-bottom:6px"><span class="tag gray">' + esc(p.format) + "</span>" + (APP.priceOf(p.id) != null ? '<span class="tag blue">建議售價 ' + APP.money(APP.priceOf(p.id)) + "</span>" : '<span class="tag amber">價格待定</span>') + "</div>" +
      '<div class="row" style="margin:14px 0"><button class="btn btn-gold btn-sm" data-addquote>' + icon("quote") + '加入報價單</button><button class="btn btn-ghost btn-sm" data-copy>' + icon("copy") + '複製產品介紹</button><a class="btn btn-wa btn-sm" target="_blank" rel="noopener" href="' + U.wa("", productText(p)) + '">' + icon("whatsapp") + "WhatsApp 分享</a>" +
      (APP.can("editProducts") ? '<button class="btn btn-ghost btn-sm" data-edit>' + icon("edit") + "編輯（管理員）</button>" : "") + "</div>" +
      '<div class="card card-b"><p style="margin:0">' + esc(p.description) + "</p></div>" +
      '<h3 class="sec-t">' + icon("star") + '亮點特色</h3><ul class="ul-dot">' + p.highlights.map(function (h) { return "<li>" + esc(h) + "</li>"; }).join("") + "</ul>" +
      '<h3 class="sec-t">' + icon("patent") + "專利原料</h3>" + (p.patents.length ? '<div class="patent-box">' + p.patents.map(function (x) { return "<span>" + icon("patent") + esc(x) + "</span>"; }).join("") + "</div>" + (p.patentNote ? '<p class="small muted" style="margin:8px 0 0">' + esc(p.patentNote) + "</p>" : "") : '<span class="tag gray">資料待補</span><span class="small muted">　專利原料資料尚未提供，取得書面資料後再補上。</span>') +
      '<h3 class="sec-t">' + icon("check") + "功效重點（" + p.benefits.length + ' 項）</h3><ol class="benefits">' + p.benefits.map(function (h) { return "<li>" + esc(h) + "</li>"; }).join("") + "</ol>" +
      '<h3 class="sec-t">' + icon("leaf") + '明星成分</h3><div class="card table-wrap"><table class="tbl ing-tbl"><tbody>' + p.ingredients.map(function (i) { return "<tr><td>" + (i.star ? "★ " : "") + esc(i.name) + "</td><td>" + esc(i.desc) + "</td></tr>"; }).join("") + "</tbody></table></div>" +
      '<div class="grid g-2" style="margin-top:18px"><div><h3 class="sec-t" style="margin-top:0">' + icon("users") + '適合族群</h3><ul class="ul-dot">' + p.suitableFor.map(function (h) { return "<li>" + esc(h) + "</li>"; }).join("") + "</ul></div>" +
      '<div><h3 class="sec-t" style="margin-top:0">' + icon("clock") + '食用／使用方式</h3><p class="small" style="margin:0 0 8px">' + esc(p.usage) + "</p>" + (p.cautions ? '<div class="note-box amber">⚠️ ' + esc(p.cautions) + "</div>" : "") + "</div></div>" +
      (p.quality && p.quality.length ? '<h3 class="sec-t">' + icon("shield") + '品質與檢驗（來源資料）</h3><ul class="ul-dot">' + p.quality.map(function (h) { return "<li>" + esc(h) + "</li>"; }).join("") + "</ul>" : "") +
      (p.packagingName ? '<h3 class="sec-t">' + icon("lock") + '包裝／來源原名（團隊專屬）</h3><div class="note-box amber"><b>' + esc(p.packagingName) + '</b>' + (p.packagingNote ? '<br><span class="small">' + esc(p.packagingNote) + '</span>' : '') + '</div>' : "") +
      (p.internalNotes ? '<h3 class="sec-t">' + icon("lock") + '團隊備註（團隊專屬）</h3><div class="note-box int">' + esc(p.internalNotes) + "</div>" : "") +
      (APP.internal ? (APP.internal.images.posters && APP.internal.images.posters[p.id] ? '<p style="margin-top:12px"><button type="button" class="btn btn-ghost btn-sm" data-poster="' + esc(p.id) + '">' + icon("image") + "查看原始海報（團隊專屬）</button></p>" : "")
        : '<div style="margin-top:18px">' + APP.teamOnlyBox("團隊備註、品質與檢驗來源、包裝原名與原始海報") + "</div>") +
      '<div class="note-box green" style="margin-top:18px">' + esc(p.line === "supplement" ? D.disclaimers.supplement : D.disclaimers.skincare) + "</div>" +
      (p.source ? '<p class="xs muted" style="margin-top:12px">資料來源：' + esc(p.source) + "</p>" : "") + "</div></div>";
  }
  function bindDetail(el, id) {
    var p = SB.prod(id); if (!p) return;
    $("[data-copy]", el).onclick = function () { APP.copy(productText(p), "產品介紹已複製"); };
    $("[data-addquote]", el).onclick = function () { APP.newQuote({ items: [{ productId: p.id, qty: 1 }] }); };
    var ed = $("[data-edit]", el); if (ed) ed.onclick = function () { editProduct(p); };
    var po = $("[data-poster]", el); if (po) po.onclick = function () { APP.openPoster(p.id); };
  }
  function editProduct(p) {
    var lines = function (a) { return esc((a || []).join("\n")); };
    APP.modal({
      title: "編輯產品：" + esc(p.name), wide: true,
      body: '<p class="note-box amber" style="margin-top:0">修改會儲存在此瀏覽器並立即套用於系統。若要永久更新網站，請按目錄頁「匯出 products.js」，把修改的欄位合併回原始 data/products.js（系統載入的是公開版資料＋團隊專屬內容，請勿直接覆蓋）後執行 node tools/build.mjs。<br><b>請勿填寫來源資料未載明的專利、認證或療效。</b></p>' +
        '<div class="fgrid"><div class="f"><label>產品名稱</label><input class="input" name="name" value="' + esc(p.name) + '"></div><div class="f"><label>標語</label><input class="input" name="tagline" value="' + esc(p.tagline) + '"></div>' +
        '<div class="f"><label>類型</label><input class="input" name="category" value="' + esc(p.category) + '"></div><div class="f"><label>規格</label><input class="input" name="format" value="' + esc(p.format) + '"></div>' +
        '<div class="f full"><label>產品描述</label><textarea class="textarea" name="description">' + esc(p.description) + "</textarea></div>" +
        '<div class="f"><label>亮點特色（一行一項）</label><textarea class="textarea" name="highlights" rows="6">' + lines(p.highlights) + "</textarea></div>" +
        '<div class="f"><label>專利原料（一行一項，留空＝資料待補）</label><textarea class="textarea" name="patents" rows="6">' + lines(p.patents) + "</textarea></div>" +
        '<div class="f"><label>功效重點（建議 5–8 項，一行一項）</label><textarea class="textarea" name="benefits" rows="8">' + lines(p.benefits) + "</textarea></div>" +
        '<div class="f"><label>適合族群（一行一項）</label><textarea class="textarea" name="suitableFor" rows="8">' + lines(p.suitableFor) + "</textarea></div>" +
        '<div class="f"><label>食用方式</label><textarea class="textarea" name="usage" rows="3">' + esc(p.usage) + '</textarea></div><div class="f"><label>注意事項</label><textarea class="textarea" name="cautions" rows="3">' + esc(p.cautions) + "</textarea></div></div>",
      footer: '<button class="btn btn-ghost" data-reset>還原原始資料</button><button class="btn btn-ghost" data-mclose>取消</button><button class="btn btn-gold" data-mok>儲存</button>',
      onOpen: function (m, close) { $("[data-reset]", m).onclick = function () { delete APP.db().productOverrides[p.id]; APP.save(); close(); APP.toast("已還原"); APP.refresh(); }; },
      onOk: function (m) {
        var f = APP.formData(m), sp = function (s) { return s.split("\n").map(function (x) { return x.trim(); }).filter(Boolean); };
        var b = sp(f.benefits);
        if (b.length < 5) { APP.toast("功效重點至少 5 項", "alert"); return false; }
        APP.db().productOverrides[p.id] = { name: f.name, tagline: f.tagline, category: f.category, format: f.format, description: f.description, highlights: sp(f.highlights), patents: sp(f.patents), benefits: b, suitableFor: sp(f.suitableFor), usage: f.usage, cautions: f.cautions };
        APP.log("管理員更新產品資料：" + f.name, "edit"); APP.save(); APP.toast("產品資料已更新"); APP.refresh();
      }
    });
  }
  function exportProducts() {
    var data = JSON.parse(JSON.stringify(D)); data.products = SB.products(); data.version = U.today();
    var js = "/*! Star Bao 產品資料（由系統匯出 " + U.fmtDate(U.now(), true) + "）。請把修改的欄位合併回原始 data/products.js（勿直接覆蓋：此檔的圖片為公開版路徑）後執行 node tools/build.mjs */\n(function (root) {\n  var data = " + JSON.stringify(data, null, 2) + ";\n  root.STARBAO = data;\n  if (typeof module !== \"undefined\" && module.exports) module.exports = data;\n})(typeof window !== \"undefined\" ? window : globalThis);\n";
    U.download("products.js", js, "text/javascript;charset=utf-8"); APP.toast("已匯出 products.js", "download");
  }

  /* ====================== 健康評估 ====================== */
  var lastAssess = null;
  APP.views.assess = {
    title: "健康評估", group: "解決方案",
    render: function (args) {
      var R = SB.RULES, pre = args[0] || "";
      return '<div class="page-head"><div><h2>健康生活評估</h2><p>問卷＋症狀勾選＋自由描述，規則引擎對應解決方案並排序推薦產品。此為調理建議，非醫療診斷。</p></div></div>' +
        '<div class="note-box amber" style="margin-bottom:16px">' + icon("alert") + " " + esc(D.disclaimers.assessment) + "</div>" +
        '<div class="grid g-main" style="align-items:start"><form class="stack" id="asForm">' +
        '<div class="card"><div class="card-h"><h3>' + icon("users") + '客戶</h3></div><div class="card-b"><div class="fgrid"><div class="f full"><label>選擇既有客戶</label><select class="select" name="clientId">' + APP.clientOptions(pre, "— 新客戶／不指定 —") + "</select></div>" +
        '<div class="f"><label>新客戶稱呼</label><input class="input" name="newName" placeholder="選擇既有客戶可略過"></div><div class="f"><label>WhatsApp 電話</label><input class="input" name="newPhone" placeholder="012-345 6789"></div>' +
        '<div class="f"><label>性別</label><select class="select" name="gender"><option value="">—</option><option value="F">女</option><option value="M">男</option></select></div><div class="f"><label>年齡</label><input class="input" name="age" type="number" min="1" max="120"></div></div></div></div>' +
        '<div class="card"><div class="card-h"><h3>' + icon("chat") + '客戶自述／症狀描述</h3></div><div class="card-b"><textarea class="textarea" name="text" id="asText" placeholder="可直接貼上客戶的 WhatsApp 訊息，例如：最近都睡不好，半夜會醒，白天很累，愛喝奶茶，下午腳很腫⋯"></textarea><div id="asKw" class="small" style="margin-top:8px"></div></div></div>' +
        '<div class="card"><div class="card-h"><h3>' + icon("check") + '症狀勾選</h3><div class="actions"><span class="xs muted">可複選</span></div></div><div class="card-b grid g-2">' +
        R.groups.map(function (g) { return '<div class="sym-group"><h4>' + g.title + '</h4><div class="checks">' + g.items.map(function (i) { return '<label class="ck"><input type="checkbox" name="symptoms" value="' + i.id + '"><span>' + i.label + "</span></label>"; }).join("") + "</div></div>"; }).join("") + "</div></div>" +
        '<div class="card"><div class="card-h"><h3>' + icon("sun") + '生活習慣問卷</h3></div><div class="card-b stack">' +
        R.lifestyle.map(function (q) { return '<div class="f"><span class="lbl">' + q.label + '</span><div class="checks">' + q.options.map(function (o) { return '<label class="ck"><input type="radio" name="ls_' + q.id + '" value="' + o.v + '"><span>' + o.label + "</span></label>"; }).join("") + "</div></div>"; }).join("") + "</div></div>" +
        '<div class="card"><div class="card-h"><h3>' + icon("alert") + '安全篩檢</h3></div><div class="card-b stack"><div class="f"><span class="lbl">就醫警訊（勾選任一項將不提供產品推薦，改為建議就醫）</span><div class="checks">' + R.redFlags.map(function (r) { return '<label class="ck red"><input type="checkbox" name="redFlags" value="' + r.id + '"><span>' + r.label + "</span></label>"; }).join("") + '</div></div>' +
        '<div class="f"><span class="lbl">需先諮詢醫師的情況</span><div class="checks">' + R.cautions.map(function (r) { return '<label class="ck amber"><input type="checkbox" name="cautions" value="' + r.id + '"><span>' + r.label + "</span></label>"; }).join("") + "</div></div></div></div>" +
        '<div class="row"><button type="submit" class="btn btn-gold btn-lg">' + icon("pulse") + '產生評估結果</button><button type="reset" class="btn btn-ghost">清除</button></div></form>' +
        '<div id="asResult" style="position:sticky;top:84px"><div class="card card-b empty">' + icon("pulse") + "<div>填寫左側問卷後，按「產生評估結果」。</div></div></div></div>";
    },
    bind: function (el) {
      var form = $("#asForm", el), kw = $("#asKw", el);
      $("#asText", el).addEventListener("input", function (e) {
        var s = SB.scanText(e.target.value);
        var symMap = {}; SB.RULES.groups.forEach(function (g) { g.items.forEach(function (i) { symMap[i.id] = i; }); });
        kw.innerHTML = (s.symptoms.length || s.redFlags.length || s.cautions.length) ? "自動偵測：" + s.symptoms.map(function (x) { return '<span class="kw">' + symMap[x].label + "</span>"; }).join("") +
          s.redFlags.map(function (x) { return '<span class="kw red">⚠ ' + SB.RULES.redFlags.filter(function (r) { return r.id === x; })[0].label + "</span>"; }).join("") +
          s.cautions.map(function (x) { return '<span class="kw amber">' + SB.RULES.cautions.filter(function (r) { return r.id === x; })[0].label + "</span>"; }).join("") : "";
      });
      form.addEventListener("reset", function () { setTimeout(function () { kw.innerHTML = ""; }, 0); });
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var f = APP.formData(form), ls = {};
        SB.RULES.lifestyle.forEach(function (q) { if (f["ls_" + q.id]) ls[q.id] = f["ls_" + q.id]; });
        var a = SB.assess({ symptoms: f.symptoms, lifestyle: ls, redFlags: f.redFlags, cautions: f.cautions, text: f.text });
        lastAssess = { a: a, f: f };
        $("#asResult", el).innerHTML = APP.renderAssessment(a, true);
        bindResult(el);
        if (window.innerWidth < 980) $("#asResult", el).scrollIntoView({ behavior: "smooth" });
      });
    }
  };
  APP.renderAssessment = function (a, withActions) {
    var H = ['<div class="card"><div class="card-h"><h3>' + icon("pulse") + '評估結果</h3><div class="actions"><span class="xs muted">' + U.fmtDate(a.at, true) + "</span></div></div><div class=\"card-b stack\">"];
    if (a.redFlags.length) {
      H.push('<div class="note-box red" style="font-size:.95rem"><b style="font-size:1.15rem">' + icon("alert") + " 請盡快就醫</b><br>偵測到就醫警訊：「" + esc(a.redFlagLabels.join("、")) + "」。<br>" + esc(D.disclaimers.redFlag) + (a.redFlags.indexOf("rf_self") > -1 ? "<br>如有立即危險請撥 999，或聯絡 Befrienders 03-7627 2929。" : "") + "</div><p class='small muted' style='margin:0'>依合規原則，此情況不提供產品推薦。請先協助客戶就醫，並建立跟進任務關心後續狀況。</p>");
    } else {
      var top = a.ranked.filter(function (r) { return r.raw > 0; }).slice(0, 6);
      H.push('<div class="result-hero"><div class="small muted">優先調理方向</div><div class="h-serif" style="font-size:1.35rem">' + (a.focus.length ? a.focus.map(function (f) { return SB.sol(f).name; }).join("・") : "目前無明顯失衡") + "</div></div>");
      if (top.length) H.push("<div>" + top.map(function (r) { var s = SB.sol(r.id); return '<div class="hbar"><span>' + s.name + '</span><span class="t"><i style="width:' + Math.max(6, r.pct) + "%;background:" + s.color + '"></i></span><b>' + r.pct + "</b></div>"; }).join("") + "</div>");
      if (a.products.length) {
        H.push('<div><div class="lbl small" style="font-weight:600;margin-bottom:8px">推薦產品（依符合度排序）</div><div class="stack">' + a.products.map(function (r, i) {
          var p = SB.prod(r.id);
          return '<a class="rec-card" href="#/catalog/' + p.id + '" style="text-decoration:none;color:inherit"><img src="' + p.thumb + '" alt=""><div><b>' + (i + 1) + ". " + esc(p.name) + '</b><div class="small muted">' + esc(p.tagline) + '</div><div class="why">' + esc(r.reasons.join("；")) + '</div></div><div class="score">' + r.score + "<small>符合度</small></div></a>";
        }).join("") + "</div></div>");
      }
      var reasons = a.ranked.filter(function (r) { return a.focus.indexOf(r.id) > -1; }).map(function (r) { return "<li><b>" + r.name + "：</b>" + esc(r.reasons.slice(0, 4).join("、")) + "</li>"; }).join("");
      if (reasons) H.push('<div><div class="small" style="font-weight:600">判斷依據</div><ul class="small" style="margin:6px 0 0;padding-left:1.2em">' + reasons + "</ul></div>");
      if (a.tips.length) H.push('<div><div class="small" style="font-weight:600">生活調理建議</div><ul class="ul-dot small" style="margin-top:6px">' + a.tips.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul></div>");
    }
    if (a.cautions.length) H.push('<div class="note-box amber">⚠️ 客戶有「' + esc(a.cautionLabels.join("、")) + "」：食用任何營養補充食品前，請先諮詢醫師，並持續遵照醫囑。</div>");
    H.push('<div class="xs muted">' + esc(D.disclaimers.assessment) + "</div>");
    if (withActions) H.push('<div class="row"><button class="btn btn-gold btn-sm" data-as-save>' + icon("users") + "儲存至客戶紀錄</button>" + (a.products.length ? '<button class="btn btn-dark btn-sm" data-as-quote>' + icon("quote") + "一鍵轉成報價單</button>" : "") + '<button class="btn btn-ghost btn-sm" data-as-copy>' + icon("copy") + '複製結果</button><button class="btn btn-wa btn-sm" data-as-wa>' + icon("whatsapp") + "傳給客戶</button></div>");
    H.push("</div></div>");
    return H.join("");
  };
  APP.assessText = function (a, name) {
    var L = ["【星寶 健康生活評估結果】" + (name ? "\n" + name + " 您好！" : "")];
    if (a.redFlags.length) { L.push("您提到「" + a.redFlagLabels.join("、") + "」，請盡快就醫，由醫師為您評估。"); }
    else {
      L.push("建議優先調理方向：" + (a.focus.map(function (f) { return SB.sol(f).name; }).join("、") || "—"));
      if (a.products.length) { L.push("\n推薦參考："); a.products.forEach(function (r) { var p = SB.prod(r.id); L.push("✅ " + p.name + "｜" + p.tagline); }); }
      if (a.tips.length) { L.push("\n生活小建議："); a.tips.slice(0, 4).forEach(function (t) { L.push("・" + t); }); }
    }
    if (a.cautions.length) L.push("\n⚠️ 因您有「" + a.cautionLabels.join("、") + "」，食用前請先諮詢醫師。");
    L.push("\n※ 評估結果僅供參考，不構成醫療建議。" + D.disclaimers.supplement);
    return L.join("\n");
  };
  function ensureClient(f) {
    var db = APP.db();
    if (f.clientId) return APP.client(f.clientId);
    if (!f.newName && !f.newPhone) return null;
    var me = APP.me();
    var c = { id: U.uid("c"), name: f.newName || "未命名客戶", phone: U.normPhone(f.newPhone), gender: f.gender, age: f.age, location: "", concerns: [], status: "新名單", source: "健康評估", resellerId: me.id, notes: "", createdAt: U.now(), updatedAt: U.now(), attachments: [], timeline: [] };
    db.clients.unshift(c); APP.log(APP.cleanName(me.name) + " 新增客戶 " + c.name, "users");
    return c;
  }
  function saveAssessment() {
    if (!lastAssess) return null;
    var c = ensureClient(lastAssess.f);
    if (!c) { APP.toast("請選擇客戶或填寫新客戶稱呼", "alert"); return null; }
    var a = JSON.parse(JSON.stringify(lastAssess.a));
    if (lastAssess.saved && lastAssess.saved.clientId === c.id) return { c: c, a: lastAssess.saved };
    a.id = U.uid("a"); a.clientId = c.id; a.resellerId = c.resellerId; a.by = APP.me().id;
    APP.db().assessments.unshift(a);
    c.concerns = (c.concerns || []).concat(a.focus).filter(function (x, i, arr) { return arr.indexOf(x) === i; });
    APP.addTimeline(c.id, "assessment", "完成健康生活評估：" + (a.redFlags.length ? "⚠️ 就醫警訊（" + a.redFlagLabels.join("、") + "）" : "優先關注 " + a.focus.map(function (f) { return SB.sol(f).name; }).join("、")), a.id);
    APP.log(c.name + " 完成健康生活評估", "pulse");
    if (a.redFlags.length) APP.db().tasks.unshift({ id: U.uid("t"), title: "關心就醫狀況：" + c.name, clientId: c.id, resellerId: c.resellerId, status: "todo", due: U.today(2), priority: "high", channel: "whatsapp", templateId: "", note: "評估出現就醫警訊", createdAt: U.now() });
    APP.save(); lastAssess.saved = a; lastAssess.f.clientId = c.id;
    return { c: c, a: a };
  }
  function bindResult(el) {
    var r = $("#asResult", el);
    var s = $("[data-as-save]", r); if (s) s.onclick = function () { var x = saveAssessment(); if (x) { APP.toast("已儲存至 " + x.c.name + " 的紀錄"); } };
    var q = $("[data-as-quote]", r); if (q) q.onclick = function () { var x = saveAssessment(); if (!x) return; APP.newQuote({ clientId: x.c.id, items: x.a.products.filter(function (p) { return SB.prod(p.id).line === "supplement"; }).slice(0, 3).map(function (p) { return { productId: p.id, qty: 1 }; }), notes: "依健康生活評估建議（" + U.fmtDate(x.a.at) + "）" }); };
    $("[data-as-copy]", r).onclick = function () { APP.copy(APP.assessText(lastAssess.a), "評估結果已複製"); };
    $("[data-as-wa]", r).onclick = function () { var c = lastAssess.f.clientId ? APP.client(lastAssess.f.clientId) : null; var ph = c ? c.phone : lastAssess.f.newPhone; window.open(U.wa(ph, APP.assessText(lastAssess.a, c ? APP.cleanName(c.name) : lastAssess.f.newName)), "_blank"); if (c) { APP.addTimeline(c.id, "whatsapp", "WhatsApp 發送評估結果"); APP.save(); } };
  }

  /* ====================== 智能問答 ====================== */
  var qaState = { file: null, result: null };
  APP.views.qa = {
    title: "智能問答／推薦", group: "解決方案",
    render: function (args) {
      var recent = APP.db().questions.filter(function (q) { return !q.resellerId || APP.visibleUserIds().indexOf(q.resellerId) > -1 || APP.me().role === "admin"; }).slice(0, 6);
      return '<div class="page-head"><div><h2>智能問答／推薦</h2><p>輸入客戶問題，或拖放／貼上 WhatsApp 截圖，系統會比對關鍵字、推薦產品並產生可直接發送的繁體中文回覆。</p></div></div>' +
        '<div class="grid g-2" style="align-items:start"><div class="stack"><div class="card"><div class="card-h"><h3>' + icon("chat") + '客戶問題</h3></div><div class="card-b stack">' +
        '<div class="f"><label>客戶（選填）</label><select class="select" id="qaClient">' + APP.clientOptions(args[0] || "", "— 不指定 —") + "</select></div>" +
        '<label class="drop" id="qaDrop">' + icon("image") + '<b>拖放或點擊上傳 WhatsApp 截圖</b><div class="xs">也可以直接 Ctrl/⌘ + V 貼上截圖・支援瀏覽器內 OCR 文字辨識（繁中）</div><input type="file" accept="image/*"></label>' +
        '<div id="qaPreview"></div>' +
        '<div class="f"><label>問題內容</label><textarea class="textarea" id="qaText" rows="5" placeholder="例：我最近睡不好又很累，有在吃血壓藥，可以吃什麼調理？價格多少？"></textarea></div>' +
        '<div class="row"><button class="btn btn-gold" id="qaGo">' + icon("sparkle") + '分析並產生回覆</button><button class="btn btn-ghost btn-sm" data-ex="我最近都睡不好，半夜三點會醒，白天很累，要怎麼調理？">範例：睡眠</button><button class="btn btn-ghost btn-sm" data-ex="愛喝奶茶，飯後很想睡，肚子越來越大，有什麼推薦？價格多少？">範例：糖代謝</button><button class="btn btn-ghost btn-sm" data-ex="下午小腿很腫，久坐辦公室，有在吃降血壓藥可以吃嗎？">範例：浮腫＋用藥</button></div></div></div>' +
        '<div class="card"><div class="card-h"><h3>' + icon("clock") + '最近問答紀錄</h3></div><div class="card-b tight">' + (recent.length ? recent.map(function (q) { var c = APP.client(q.clientId); return '<div class="li"><span class="act-ic">' + icon("chat") + '</span><div><div class="ttl" style="font-weight:500">' + esc(q.text.slice(0, 60)) + '</div><div class="meta">' + (c ? esc(c.name) + "・" : "") + U.ago(q.at) + "</div></div></div>"; }).join("") : '<div class="empty small">尚無紀錄</div>') + "</div></div></div>" +
        '<div id="qaOut"><div class="card card-b empty">' + icon("sparkle") + "<div>輸入問題後按「分析並產生回覆」。</div></div></div></div>";
    },
    bind: function (el) {
      qaState.file = null;
      try { var pre = sessionStorage.getItem("starbao.qaPrefill"); if (pre) { $("#qaText", el).value = pre; sessionStorage.removeItem("starbao.qaPrefill"); } } catch (er) {}
      function setFile(files) {
        APP.readFile(files[0], 1600).then(function (f) {
          qaState.file = f;
          $("#qaPreview", el).innerHTML = '<div class="thumbs" style="grid-template-columns:140px 1fr;align-items:start"><div class="thumb"><img src="' + f.dataUrl + '" alt="截圖"><button class="x" data-rm>' + icon("x") + '</button></div><div class="stack"><button class="btn btn-dark btn-sm" data-ocr>' + icon("search") + ' OCR 辨識截圖文字</button><div class="xs muted" id="ocrMsg">首次使用需下載辨識模型（約 10–20MB），需要網路。辨識結果請人工核對。</div></div></div>';
          $("[data-rm]", el).onclick = function (e) { e.preventDefault(); qaState.file = null; $("#qaPreview", el).innerHTML = ""; };
          $("[data-ocr]", el).onclick = function () {
            var msg = $("#ocrMsg", el), btn = this; btn.disabled = true; msg.textContent = "載入 OCR 元件中⋯";
            APP.ocr(f.dataUrl, function (m) { msg.textContent = (m.status === "recognizing text" ? "辨識中 " : m.status + " ") + (m.progress ? Math.round(m.progress * 100) + "%" : ""); })
              .then(function (txt) { var ta = $("#qaText", el); ta.value = (ta.value ? ta.value + "\n" : "") + txt; msg.textContent = "✓ 辨識完成，已填入問題內容（請核對）。"; btn.disabled = false; })
              .catch(function (err) { msg.textContent = "⚠️ " + err.message; btn.disabled = false; });
          };
        }).catch(function (e) { APP.toast(e.message, "alert"); });
      }
      APP.bindDrop($("#qaDrop", el), setFile);
      APP.onPaste(setFile);
      $$("[data-ex]", el).forEach(function (b) { b.onclick = function () { $("#qaText", el).value = b.getAttribute("data-ex"); run(); }; });
      $("#qaGo", el).onclick = run;
      function run() {
        var text = $("#qaText", el).value.trim();
        if (!text) { APP.toast(qaState.file ? "請先按「OCR 辨識」或手動輸入截圖中的問題" : "請輸入客戶問題", "alert"); return; }
        var c = APP.client($("#qaClient", el).value);
        var r = SB.answer(text, { clientName: c ? APP.cleanName(c.name) : "", signature: APP.cleanName(APP.me().name) + "｜" + APP.db().settings.signature });
        qaState.result = r;
        var symMap = {}; SB.RULES.groups.forEach(function (g) { g.items.forEach(function (i) { symMap[i.id] = i; }); });
        var TOP = { price: "詢價", usage: "用法", drug: "用藥", kidney: "腎臟", diabetes: "糖尿病", pregnant: "懷孕哺乳", join: "加入團隊", diet_halal: "飲食限制／素食", effect: "見效時間" };
        $("#qaOut", el).innerHTML = '<div class="card"><div class="card-h"><h3>' + icon("sparkle") + '分析結果</h3></div><div class="card-b stack">' +
          '<div class="small">偵測關鍵字：' + (r.scan.symptoms.map(function (s) { return '<span class="kw">' + symMap[s].label + "</span>"; }).join("") + r.topics.map(function (t) { return '<span class="kw amber">' + TOP[t] + "</span>"; }).join("") + r.ingredientHits.map(function (t) { return '<span class="kw">' + esc(t) + "</span>"; }).join("") + r.scan.redFlags.map(function (x) { return '<span class="kw red">⚠ ' + SB.RULES.redFlags.filter(function (y) { return y.id === x; })[0].label + "</span>"; }).join("") || '<span class="muted">（無明確關鍵字）</span>') + "</div>" +
          (r.scan.redFlags.length ? '<div class="note-box red"><b>' + icon("alert") + " 請盡快就醫</b>：此問題含就醫警訊，系統不推薦產品。</div>" : "") +
          (r.products.length ? '<div class="stack">' + r.products.map(function (x) { var p = SB.prod(x.id); return '<a class="rec-card" href="#/catalog/' + p.id + '" style="text-decoration:none;color:inherit"><img src="' + p.thumb + '" alt=""><div><b>' + esc(p.name) + '</b><div class="small muted">' + esc(p.tagline) + '</div><div class="why">' + esc((x.reasons || []).join("；")) + "</div></div></a>"; }).join("") + "</div>" : "") +
          '<div class="f"><label>建議回覆（可編輯）</label><textarea class="textarea" id="qaReply" rows="14">' + esc(r.reply) + "</textarea></div>" +
          '<div class="row"><button class="btn btn-ghost btn-sm" data-qa-copy>' + icon("copy") + '複製</button><button class="btn btn-wa btn-sm" data-qa-wa>' + icon("whatsapp") + 'WhatsApp 發送</button><button class="btn btn-gold btn-sm" data-qa-save>' + icon("users") + '儲存到客戶紀錄</button><button class="btn btn-ghost btn-sm" data-qa-task>' + icon("tasks") + "建立跟進任務</button>" + (r.products.length ? '<button class="btn btn-ghost btn-sm" data-qa-quote>' + icon("quote") + "轉報價單</button>" : "") + "</div></div></div>";
        var out = $("#qaOut", el);
        $("[data-qa-copy]", out).onclick = function () { APP.copy($("#qaReply", out).value, "回覆已複製"); };
        $("[data-qa-wa]", out).onclick = function () { var cc = APP.client($("#qaClient", el).value); window.open(U.wa(cc ? cc.phone : "", $("#qaReply", out).value), "_blank"); if (cc) { APP.addTimeline(cc.id, "whatsapp", "WhatsApp 回覆客戶問題"); APP.save(); } };
        $("[data-qa-save]", out).onclick = function () { saveQ(true); };
        $("[data-qa-task]", out).onclick = function () { var cid = saveQ(false); APP.taskModal({ clientId: cid, title: "跟進客戶問題" + (c ? "：" + APP.cleanName(c.name) : ""), due: U.today(1), note: text.slice(0, 120) }); };
        var qq = $("[data-qa-quote]", out); if (qq) qq.onclick = function () { var cid = saveQ(false); APP.newQuote({ clientId: cid, items: r.products.map(function (x) { return { productId: x.id, qty: 1 }; }) }); };
        if (window.innerWidth < 980) out.scrollIntoView({ behavior: "smooth" });
      }
      function saveQ(toastIt) {
        var cid = $("#qaClient", el).value, r = qaState.result, db = APP.db();
        if (!cid) { if (toastIt) APP.toast("請先選擇客戶（或到客戶管理新增）", "alert"); db.questions.unshift({ id: U.uid("q"), text: r.question, at: U.now(), reply: $("#qaReply", el).value, resellerId: APP.me().id }); APP.save(); return ""; }
        if (qaState.savedFor === cid + r.question) { if (toastIt) APP.toast("此問題已儲存"); return cid; }
        var c = APP.client(cid);
        db.questions.unshift({ id: U.uid("q"), clientId: cid, text: r.question, at: U.now(), matched: r.products.map(function (x) { return x.id; }), reply: $("#qaReply", el).value, resellerId: c.resellerId });
        if (qaState.file) { c.attachments = c.attachments || []; qaState.file.ocrText = r.question; c.attachments.unshift(qaState.file); }
        APP.addTimeline(cid, "question", "「" + r.question.slice(0, 120) + "」" + (r.products.length ? " → 推薦 " + r.products.map(function (x) { return SB.prod(x.id).name; }).join("、") : ""));
        c.concerns = (c.concerns || []).concat(r.scan.focus).filter(function (x, i, a) { return a.indexOf(x) === i; });
        APP.log(c.name + " 的問題已記錄", "chat");
        APP.save(); qaState.savedFor = cid + r.question; if (toastIt) APP.toast("已儲存到 " + c.name + " 的紀錄");
        return cid;
      }
    }
  };
})();
