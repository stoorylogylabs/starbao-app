/* 視圖 B：客戶管理、報價單、跟進任務 */
(function () {
  "use strict";
  var APP = window.APP, SB = APP.SB, U = SB.U, icon = SB.icon, D = SB.data, $ = APP.$, $$ = APP.$$, esc = U.esc;
  var STATUSES = ["新名單", "洽談中", "已成交", "暫緩"];
  var SOURCES = ["WhatsApp", "Facebook", "Instagram", "TikTok", "朋友介紹", "實體活動", "網站自我檢測", "健康評估", "其他"];

  /* ====================== 客戶管理 ====================== */
  var cState = { q: "", status: "", sol: "", owner: "" };
  APP.views.clients = {
    title: "客戶管理 CRM", group: "客戶與銷售",
    render: function (args) {
      if (args[0] && args[0] !== "new") return detail(args[0]);
      var list = APP.clients();
      return '<div class="page-head"><div><h2>客戶管理</h2><p>手動建檔、拖放截圖附件、評估／問答／報價／跟進完整時間軸。</p></div><div class="actions">' +
        '<button class="btn btn-ghost btn-sm" data-imp>' + icon("upload") + '匯入 CSV／JSON</button><button class="btn btn-ghost btn-sm" data-exp-csv>' + icon("download") + '匯出 CSV</button><button class="btn btn-ghost btn-sm" data-exp-json>' + icon("download") + '匯出 JSON</button><button class="btn btn-gold btn-sm" data-new>' + icon("plus") + "新增客戶</button></div></div>" +
        '<input type="file" id="impFile" accept=".csv,.json,application/json,text/csv" hidden>' +
        '<div class="toolbar"><div class="search-in">' + icon("search") + '<input class="input" id="cQ" placeholder="搜尋姓名、電話、備註" value="' + esc(cState.q) + '"></div>' +
        '<select class="select" id="cStatus"><option value="">全部狀態</option>' + STATUSES.map(function (s) { return "<option" + (cState.status === s ? " selected" : "") + ">" + s + "</option>"; }).join("") + "</select>" +
        '<select class="select" id="cSol"><option value="">全部關注方案</option>' + D.solutions.map(function (s) { return '<option value="' + s.id + '"' + (cState.sol === s.id ? " selected" : "") + ">" + s.name + "</option>"; }).join("") + "</select>" +
        (APP.me().role !== "agent" ? '<select class="select" id="cOwner"><option value="">全部負責人</option>' + APP.userOptions(cState.owner) + "</select>" : "") + "</div>" +
        '<div class="card table-wrap"><table class="tbl responsive"><thead><tr><th>客戶</th><th>電話</th><th>關注方案</th><th>狀態</th><th>負責人</th><th>來源</th><th>更新</th><th></th></tr></thead><tbody id="cBody"></tbody></table><div class="empty" id="cEmpty" style="display:none">' + icon("users") + "<div>沒有符合的客戶</div></div></div>" +
        '<p class="xs muted" style="margin-top:10px">CSV 欄位：姓名, 電話, 性別, 年齡, 地區, 狀態, 來源, 備註, 推薦碼（第一列為標題）。</p>';
    },
    bind: function (el, args) {
      if (args[0] && args[0] !== "new") return bindDetail(el, args[0]);
      function draw() {
        var q = cState.q.toLowerCase();
        var list = APP.clients().filter(function (c) {
          return (!q || (c.name + " " + (c.phone || "") + " " + (c.notes || "") + " " + (c.location || "")).toLowerCase().indexOf(q) > -1) && (!cState.status || c.status === cState.status) && (!cState.sol || (c.concerns || []).indexOf(cState.sol) > -1) && (!cState.owner || c.resellerId === cState.owner);
        }).sort(function (a, b) { return (b.updatedAt || "").localeCompare(a.updatedAt || ""); });
        $("#cBody", el).innerHTML = list.map(function (c) {
          var u = APP.user(c.resellerId);
          return '<tr class="click" data-go="' + c.id + '"><td><div class="cname"><span class="avatar sm">' + esc(APP.initials(c.name)) + "</span>" + esc(c.name) + (c.demo ? ' <span class="tag gray">示範</span>' : "") + '</div></td><td class="hide-m">' + esc(c.phone || "—") + '</td><td class="hide-m">' + APP.solTags(c.concerns, 3) + '</td><td><span class="st st-' + c.status + '">' + c.status + '</span></td><td class="hide-m">' + (u ? esc(APP.cleanName(u.name)) : "—") + '</td><td class="hide-m">' + esc(c.source || "—") + '</td><td class="hide-m xs muted">' + U.ago(c.updatedAt || c.createdAt) + '</td><td class="num">' + (c.phone ? '<a class="icon-btn wa" target="_blank" rel="noopener" href="' + U.wa(c.phone, "您好 " + APP.cleanName(c.name) + "，") + '" data-wa-client="' + c.id + '" onclick="event.stopPropagation()">' + icon("whatsapp") + "</a>" : "") + "</td></tr>";
        }).join("");
        $("#cEmpty", el).style.display = list.length ? "none" : "block";
      }
      $("#cQ", el).oninput = function (e) { cState.q = e.target.value; draw(); };
      $("#cStatus", el).onchange = function (e) { cState.status = e.target.value; draw(); };
      $("#cSol", el).onchange = function (e) { cState.sol = e.target.value; draw(); };
      var o = $("#cOwner", el); if (o) o.onchange = function (e) { cState.owner = e.target.value; draw(); };
      $("#cBody", el).onclick = function (e) { var tr = e.target.closest("[data-go]"); if (tr && !e.target.closest("a")) APP.go("#/clients/" + tr.getAttribute("data-go")); };
      $("[data-new]", el).onclick = function () { APP.clientModal(); };
      $("[data-exp-csv]", el).onclick = exportCSV;
      $("[data-exp-json]", el).onclick = function () { U.download("starbao-clients-" + U.today() + ".json", JSON.stringify(APP.clients(), null, 2), "application/json"); };
      $("[data-imp]", el).onclick = function () { $("#impFile", el).click(); };
      $("#impFile", el).onchange = function (e) { var f = e.target.files[0]; if (f) importFile(f); e.target.value = ""; };
      draw();
      if (args[0] === "new") APP.clientModal();
    }
  };
  function exportCSV() {
    var rows = [["姓名", "電話", "性別", "年齡", "地區", "狀態", "來源", "關注方案", "負責人", "推薦碼", "備註", "建立日期"]];
    APP.clients().forEach(function (c) { var u = APP.user(c.resellerId); rows.push([c.name, c.phone, c.gender === "F" ? "女" : c.gender === "M" ? "男" : "", c.age, c.location, c.status, c.source, (c.concerns || []).map(function (s) { return (SB.sol(s) || {}).name; }).join("/"), u ? u.name : "", c.refCode || (u ? u.code : ""), c.notes, U.fmtDate(c.createdAt)]); });
    U.download("starbao-clients-" + U.today() + ".csv", U.csv(rows), "text/csv;charset=utf-8"); APP.toast("已匯出 CSV", "download");
  }
  function importFile(file) {
    var fr = new FileReader();
    fr.onload = function () {
      var db = APP.db(), me = APP.me(), n = 0;
      try {
        if (/\.json$/i.test(file.name)) {
          var arr = JSON.parse(fr.result); if (!Array.isArray(arr)) arr = arr.clients || [];
          arr.forEach(function (c) { if (!c.name) return; if (db.clients.some(function (x) { return x.id === c.id; })) return; c.id = c.id || U.uid("c"); c.timeline = c.timeline || []; c.attachments = c.attachments || []; c.resellerId = c.resellerId || me.id; db.clients.push(c); n++; });
        } else {
          var rows = U.parseCSV(fr.result), head = rows.shift().map(function (h) { return h.trim(); });
          var ix = function (k) { return head.indexOf(k); };
          rows.forEach(function (r) {
            var g = function (k) { var i = ix(k); return i > -1 ? (r[i] || "").trim() : ""; };
            if (!g("姓名")) return;
            var ref = SB.Store.userByCode(g("推薦碼"));
            db.clients.push({ id: U.uid("c"), name: g("姓名"), phone: U.normPhone(g("電話")), gender: g("性別") === "女" ? "F" : g("性別") === "男" ? "M" : "", age: g("年齡"), location: g("地區"), status: STATUSES.indexOf(g("狀態")) > -1 ? g("狀態") : "新名單", source: g("來源") || "匯入", notes: g("備註"), concerns: [], resellerId: ref ? ref.id : me.id, refCode: g("推薦碼"), createdAt: U.now(), updatedAt: U.now(), attachments: [], timeline: [{ id: U.uid("tl"), type: "note", text: "由檔案匯入", at: U.now() }] });
            n++;
          });
        }
        APP.log("匯入 " + n + " 位客戶", "upload"); APP.save(); APP.toast("已匯入 " + n + " 位客戶", "upload"); APP.refresh();
      } catch (err) { APP.toast("匯入失敗：" + err.message, "alert"); }
    };
    fr.readAsText(file, "utf-8");
  }

  APP.clientModal = function (c) {
    var isNew = !c; c = c || { gender: "", status: "新名單", source: "WhatsApp", concerns: [], resellerId: APP.me().id, attachments: [] };
    var pending = [];
    APP.modal({
      title: isNew ? "新增客戶" : "編輯客戶：" + esc(c.name), wide: true,
      body: '<div class="fgrid"><div class="f"><label>姓名／稱呼 <span class="req">*</span></label><input class="input" name="name" value="' + esc(c.name || "") + '" required></div>' +
        '<div class="f"><label>電話／WhatsApp</label><input class="input" name="phone" type="tel" value="' + esc(c.phone || "") + '" placeholder="012-345 6789"></div>' +
        '<div class="f"><label>性別</label><select class="select" name="gender"><option value="">—</option><option value="F"' + (c.gender === "F" ? " selected" : "") + '>女</option><option value="M"' + (c.gender === "M" ? " selected" : "") + ">男</option></select></div>" +
        '<div class="f"><label>年齡</label><input class="input" name="age" type="number" min="1" max="120" value="' + esc(c.age || "") + '"></div>' +
        '<div class="f"><label>地區</label><input class="input" name="location" value="' + esc(c.location || "") + '" placeholder="例：吉隆坡 Cheras"></div>' +
        '<div class="f"><label>來源</label><select class="select" name="source">' + SOURCES.map(function (s) { return "<option" + (c.source === s ? " selected" : "") + ">" + s + "</option>"; }).join("") + "</select></div>" +
        '<div class="f"><label>狀態</label><select class="select" name="status">' + STATUSES.map(function (s) { return "<option" + (c.status === s ? " selected" : "") + ">" + s + "</option>"; }).join("") + "</select></div>" +
        '<div class="f"><label>負責經銷商／代理</label><select class="select" name="resellerId"' + (APP.can("assign") ? "" : " disabled") + ">" + APP.userOptions(c.resellerId) + "</select></div>" +
        '<div class="f full"><span class="lbl">健康關注（解決方案）</span><div class="checks">' + D.solutions.map(function (s) { return '<label class="ck"><input type="checkbox" name="concerns" value="' + s.id + '"' + ((c.concerns || []).indexOf(s.id) > -1 ? " checked" : "") + "><span>" + s.name + "</span></label>"; }).join("") + "</div></div>" +
        '<div class="f full"><label>備註／客戶提問</label><textarea class="textarea" name="notes" placeholder="例：睡眠差、在服用血壓藥、預算考量⋯">' + esc(c.notes || "") + "</textarea></div>" +
        (isNew ? '<div class="f full"><span class="lbl">截圖／附件（拖放、貼上或點擊）</span><label class="drop" id="cmDrop">' + icon("upload") + '<b>拖放 WhatsApp 截圖、圖片或檔案</b><div class="xs">圖片會自動壓縮後存入客戶紀錄</div><input type="file" multiple></label><div class="thumbs" id="cmThumbs"></div></div>' : "") + "</div>",
      onOpen: function (m) {
        if (!isNew) return;
        var add = function (files) { Promise.all(files.map(function (f) { return APP.readFile(f); })).then(function (arr) { pending = pending.concat(arr); $("#cmThumbs", m).innerHTML = pending.map(function (f) { return '<div class="thumb">' + (/^image/.test(f.type) ? '<img src="' + f.dataUrl + '">' : '<div class="file">' + icon("quote") + "</div>") + '<div class="fn">' + esc(f.name) + "</div></div>"; }).join(""); }).catch(function (e) { APP.toast(e.message, "alert"); }); };
        APP.bindDrop($("#cmDrop", m), add); APP.onPaste(add);
      },
      onOk: function (m) {
        var f = APP.formData(m);
        if (!f.name) { APP.toast("請輸入客戶姓名", "alert"); return false; }
        var db = APP.db();
        var data = { name: f.name, phone: U.normPhone(f.phone), gender: f.gender, age: f.age, location: f.location, source: f.source, status: f.status, concerns: f.concerns || [], notes: f.notes };
        if (APP.can("assign") && f.resellerId) data.resellerId = f.resellerId;
        if (isNew) {
          var nc = Object.assign({ id: U.uid("c"), resellerId: APP.me().id, createdAt: U.now(), updatedAt: U.now(), attachments: pending, timeline: [] }, data);
          nc.timeline.push({ id: U.uid("tl"), type: "lead", text: "建立客戶資料（來源：" + f.source + "）" + (pending.length ? "，附 " + pending.length + " 個附件" : ""), at: U.now() });
          if (f.notes) nc.timeline.unshift({ id: U.uid("tl"), type: "note", text: f.notes, at: U.now() });
          db.clients.unshift(nc); APP.log(APP.cleanName(APP.me().name) + " 新增客戶 " + nc.name, "users");
          if (APP.save()) { APP.toast("已新增客戶"); APP.go("#/clients/" + nc.id); }
        } else {
          var old = c.resellerId; Object.assign(c, data, { updatedAt: U.now() });
          if (data.resellerId && data.resellerId !== old) APP.addTimeline(c.id, "note", "指派給 " + APP.user(data.resellerId).name);
          APP.save(); APP.toast("已更新"); APP.refresh();
        }
        APP.onPaste(null);
      }
    });
  };

  var TL_ICON = { note: "edit", question: "chat", assessment: "pulse", quote: "quote", task: "tasks", whatsapp: "whatsapp", lead: "star", file: "image" };
  function detail(id) {
    var c = APP.client(id); if (!c || APP.clients().indexOf(c) < 0) return '<div class="empty">找不到此客戶，或您沒有檢視權限。</div>';
    var db = APP.db(), u = APP.user(c.resellerId);
    var as = db.assessments.filter(function (a) { return a.clientId === id; });
    var qs = db.quotes.filter(function (q) { return q.clientId === id; });
    var ts = db.tasks.filter(function (t) { return t.clientId === id; });
    var hi = "您好 " + APP.cleanName(c.name) + "，我是星寶 Star Bao 的 " + APP.cleanName(APP.me().name) + "。";
    return '<div class="row" style="margin-bottom:14px"><a class="btn btn-ghost btn-sm" href="#/clients">' + icon("back") + "客戶列表</a></div>" +
      '<div class="card card-b" style="margin-bottom:18px"><div class="row" style="gap:16px"><span class="avatar" style="width:56px;height:56px;font-size:1.2rem">' + esc(APP.initials(c.name)) + '</span><div><h2 class="h-serif" style="margin:0;font-size:1.5rem">' + esc(c.name) + (c.demo ? ' <span class="tag gray">示範資料</span>' : "") + '</h2><div class="small muted">' + esc(c.phone || "無電話") + "・" + (c.gender === "F" ? "女" : c.gender === "M" ? "男" : "—") + (c.age ? "・" + esc(c.age) + " 歲" : "") + (c.location ? "・" + esc(c.location) : "") + "・負責人：" + (u ? esc(APP.cleanName(u.name)) : "—") + '</div></div>' +
      '<div style="margin-left:auto" class="row"><select class="select" id="cdStatus" style="width:auto">' + STATUSES.map(function (s) { return "<option" + (c.status === s ? " selected" : "") + ">" + s + "</option>"; }).join("") + "</select></div></div>" +
      '<div class="row" style="margin-top:14px">' + (c.phone ? '<a class="btn btn-wa btn-sm" target="_blank" rel="noopener" href="' + U.wa(c.phone, hi) + '" data-wa-client="' + c.id + '">' + icon("whatsapp") + '<span>WhatsApp</span></a><a class="btn btn-ghost btn-sm" href="' + U.sms(c.phone, hi) + '">' + icon("sms") + '短訊 SMS</a><a class="btn btn-ghost btn-sm" href="tel:+' + U.normPhone(c.phone) + '">' + icon("phone") + "撥打</a>" : "") +
      '<a class="btn btn-ghost btn-sm" href="#/assess/' + c.id + '">' + icon("pulse") + '健康評估</a><a class="btn btn-ghost btn-sm" href="#/qa/' + c.id + '">' + icon("chat") + '智能問答</a><button class="btn btn-ghost btn-sm" data-q>' + icon("quote") + '建立報價單</button><button class="btn btn-ghost btn-sm" data-t>' + icon("tasks") + '新增任務</button><button class="btn btn-ghost btn-sm" data-edit>' + icon("edit") + "編輯</button>" + (APP.can("deleteData") || c.resellerId === APP.me().id ? '<button class="btn btn-ghost btn-sm" data-del style="color:var(--red)">' + icon("trash") + "刪除</button>" : "") + "</div></div>" +
      '<div class="grid g-main" style="align-items:start"><div class="stack">' +
      '<div class="card"><div class="card-h"><h3>' + icon("clock") + '時間軸</h3></div><div class="card-b"><div class="row" style="margin-bottom:12px;flex-wrap:nowrap"><input class="input" id="noteIn" placeholder="新增備註、客戶回覆或跟進紀錄⋯"><button class="btn btn-dark btn-sm" id="noteAdd">' + icon("plus") + "新增</button></div><ul class=\"tl\">" +
      ((c.timeline || []).slice().sort(function (a, b) { return (b.at || "").localeCompare(a.at || ""); }).map(function (t) { return '<li><span class="dot">' + icon(TL_ICON[t.type] || "star") + '</span><div><div class="t">' + esc(t.text) + '</div><div class="d">' + U.fmtDate(t.at, true) + "</div></div></li>"; }).join("") || '<li class="muted small">尚無紀錄</li>') + "</ul></div></div>" +
      '<div class="card"><div class="card-h"><h3>' + icon("image") + "截圖與附件（" + (c.attachments || []).length + '）</h3></div><div class="card-b"><label class="drop" id="cdDrop">' + icon("upload") + '<b>拖放、貼上（Ctrl/⌘+V）或點擊上傳截圖／檔案</b><div class="xs">圖片可按「OCR」辨識文字（繁中，需網路）</div><input type="file" multiple></label><div class="thumbs">' +
      (c.attachments || []).map(function (f) { return '<div class="thumb">' + (/^image/.test(f.type) ? '<a href="' + f.dataUrl + '" target="_blank" rel="noopener"><img src="' + f.dataUrl + '" alt="' + esc(f.name) + '"></a><button class="ocr" data-ocr="' + f.id + '">OCR</button>' : '<a class="file" href="' + f.dataUrl + '" download="' + esc(f.name) + '">' + icon("download") + "</a>") + '<button class="x" data-rmf="' + f.id + '" title="刪除">' + icon("x") + '</button><div class="fn" title="' + esc(f.ocrText || f.name) + '">' + esc(f.name) + "</div></div>"; }).join("") + '</div><div id="ocrOut" class="small" style="margin-top:8px"></div></div></div></div>' +
      '<div class="stack"><div class="card"><div class="card-h"><h3>' + icon("users") + '客戶資料</h3></div><div class="card-b small stack"><div><b>健康關注：</b>' + (APP.solTags(c.concerns) || "—") + "</div><div><b>來源：</b>" + esc(c.source || "—") + (c.refCode ? "（推薦碼 " + esc(c.refCode) + "）" : "") + "</div><div><b>建立：</b>" + U.fmtDate(c.createdAt, true) + '</div><div><b>備註：</b><div style="white-space:pre-wrap">' + esc(c.notes || "—") + "</div></div></div></div>" +
      '<div class="card"><div class="card-h"><h3>' + icon("pulse") + "健康評估（" + as.length + ')</h3></div><div class="card-b tight">' + (as.map(function (a) { return '<div class="li"><span class="act-ic">' + icon(a.redFlags.length ? "alert" : "pulse") + '</span><div><div class="ttl" style="font-weight:500">' + (a.redFlags.length ? '<span style="color:var(--red)">就醫警訊</span>' : a.focus.map(function (f) { return SB.sol(f).name; }).join("、") || "—") + '</div><div class="meta">' + U.fmtDate(a.at, true) + (a.source === "landing" ? "・首頁自我檢測" : "") + '</div></div><div class="end"><button class="icon-btn" data-va="' + a.id + '" title="查看">' + icon("search") + "</button></div></div>"; }).join("") || '<div class="empty small">尚無評估</div>') + "</div></div>" +
      '<div class="card"><div class="card-h"><h3>' + icon("quote") + "報價單（" + qs.length + ')</h3></div><div class="card-b tight">' + (qs.map(function (q) { var k = APP.quoteCalc(q); return '<a class="li" style="text-decoration:none;color:inherit" href="#/quotes/' + q.id + '"><span class="act-ic">' + icon("quote") + '</span><div><div class="ttl">' + esc(q.no) + '</div><div class="meta">' + U.fmtDate(q.createdAt) + "・" + APP.money(k.total) + '</div></div><div class="end"><span class="st st-' + q.status + '">' + q.status + "</span></div></a>"; }).join("") || '<div class="empty small">尚無報價單</div>') + "</div></div>" +
      '<div class="card"><div class="card-h"><h3>' + icon("tasks") + "跟進任務（" + ts.length + ')</h3></div><div class="card-b tight">' + (ts.map(function (t) { return '<div class="li"><span class="pri pri-' + t.priority + '"></span><div><div class="ttl" style="' + (t.status === "done" ? "text-decoration:line-through;color:var(--muted)" : "") + '">' + esc(t.title) + '</div><div class="meta">' + U.fmtDate(t.due) + "・" + { todo: "待辦", doing: "跟進中", done: "已完成" }[t.status] + "</div></div></div>"; }).join("") || '<div class="empty small">尚無任務</div>') + "</div></div></div></div>";
  }
  function bindDetail(el, id) {
    var c = APP.client(id); if (!c) return;
    $("#cdStatus", el).onchange = function (e) { var old = c.status; c.status = e.target.value; APP.addTimeline(id, "note", "狀態：" + old + " → " + c.status); APP.log(c.name + " 狀態更新為 " + c.status, "users"); APP.save(); APP.refresh(); };
    $("#noteAdd", el).onclick = function () { var v = $("#noteIn", el).value.trim(); if (!v) return; APP.addTimeline(id, "note", v); APP.save(); APP.refresh(); };
    $("#noteIn", el).onkeydown = function (e) { if (e.key === "Enter") $("#noteAdd", el).click(); };
    $("[data-edit]", el).onclick = function () { APP.clientModal(c); };
    $("[data-q]", el).onclick = function () { APP.newQuote({ clientId: id }); };
    $("[data-t]", el).onclick = function () { APP.taskModal({ clientId: id }); };
    var del = $("[data-del]", el); if (del) del.onclick = function () { APP.confirm("確定刪除客戶「" + esc(c.name) + "」及其附件？（評估、報價單紀錄將保留）", function () { var db = APP.db(); db.clients = db.clients.filter(function (x) { return x.id !== id; }); APP.log("刪除客戶 " + c.name, "trash"); APP.save(); APP.go("#/clients"); }, "刪除"); };
    var add = function (files) {
      Promise.all(files.map(function (f) { return APP.readFile(f); })).then(function (arr) {
        c.attachments = arr.concat(c.attachments || []);
        APP.addTimeline(id, "file", "新增 " + arr.length + " 個附件：" + arr.map(function (f) { return f.name; }).join("、"));
        if (APP.save()) { APP.toast("已新增附件"); APP.refresh(); } else { c.attachments = c.attachments.slice(arr.length); }
      }).catch(function (e) { APP.toast(e.message, "alert"); });
    };
    APP.bindDrop($("#cdDrop", el), add); APP.onPaste(add);
    el.addEventListener("click", function (e) {
      var rm = e.target.closest("[data-rmf]");
      if (rm) { e.preventDefault(); c.attachments = c.attachments.filter(function (f) { return f.id !== rm.getAttribute("data-rmf"); }); APP.save(); APP.refresh(); return; }
      var oc = e.target.closest("[data-ocr]");
      if (oc) {
        e.preventDefault(); var f = c.attachments.filter(function (x) { return x.id === oc.getAttribute("data-ocr"); })[0], out = $("#ocrOut", el);
        out.textContent = "載入 OCR 元件中⋯";
        APP.ocr(f.dataUrl, function (m) { out.textContent = "OCR " + (m.status || "") + " " + (m.progress ? Math.round(m.progress * 100) + "%" : ""); }).then(function (txt) {
          f.ocrText = txt; APP.addTimeline(id, "question", "截圖辨識文字：「" + txt.slice(0, 200) + "」"); APP.save();
          out.innerHTML = '<div class="note-box green"><b>辨識結果（已加入時間軸，請核對）：</b><div style="white-space:pre-wrap">' + esc(txt) + '</div><a class="btn btn-ghost btn-sm" style="margin-top:8px" href="#/qa/' + id + '">用智能問答分析</a></div>';
          try { sessionStorage.setItem("starbao.qaPrefill", txt); } catch (er) {}
        }).catch(function (err) { out.innerHTML = '<div class="note-box amber">⚠️ ' + esc(err.message) + "</div>"; });
        return;
      }
      var va = e.target.closest("[data-va]");
      if (va) { var a = APP.db().assessments.filter(function (x) { return x.id === va.getAttribute("data-va"); })[0]; APP.modal({ title: "健康評估紀錄", body: APP.renderAssessment(a, false), footer: '<button class="btn btn-ghost" data-mclose>關閉</button><a class="btn btn-wa" target="_blank" rel="noopener" href="' + U.wa(c.phone, APP.assessText(a, APP.cleanName(c.name))) + '">' + icon("whatsapp") + "傳給客戶</a>" }); }
    });
  }

  /* ====================== 報價單 ====================== */
  var QSTAT = ["草稿", "已發送", "已確認", "已成交", "已取消"];
  var qFilter = "";
  APP.newQuote = function (preset) { APP._draftQuote = preset || {}; APP.go("#/quotes/new"); };
  APP.views.quotes = {
    title: "報價單", group: "客戶與銷售",
    render: function (args) {
      if (args[0]) return editor(args[0]);
      var list = APP.visible(APP.db().quotes).filter(function (q) { return !qFilter || q.status === qFilter; }).sort(function (a, b) { return (b.createdAt || "").localeCompare(a.createdAt || ""); });
      return '<div class="page-head"><div><h2>報價單</h2><p>價格目前為「價格待定」，管理員可於 設定 → 價格表 填寫。可列印／另存 PDF，或以 WhatsApp 發送摘要。</p></div><div class="actions"><button class="btn btn-gold btn-sm" data-newq>' + icon("plus") + "建立報價單</button></div></div>" +
        '<div class="chipbar" style="margin-bottom:14px"><button data-qf="" class="' + (!qFilter ? "active" : "") + '">全部</button>' + QSTAT.map(function (s) { return '<button data-qf="' + s + '" class="' + (qFilter === s ? "active" : "") + '">' + s + "</button>"; }).join("") + "</div>" +
        '<div class="card table-wrap"><table class="tbl responsive"><thead><tr><th>報價單號</th><th>客戶</th><th>品項</th><th>負責人</th><th>日期</th><th class="num">金額</th><th>狀態</th></tr></thead><tbody>' +
        (list.map(function (q) { var c = APP.client(q.clientId), u = APP.user(q.resellerId), k = APP.quoteCalc(q); return '<tr class="click" data-go="' + q.id + '"><td><b>' + esc(q.no) + "</b>" + (q.demo ? ' <span class="tag gray">示範</span>' : "") + "</td><td>" + (c ? esc(c.name) : "—") + '</td><td class="hide-m small">' + q.items.map(function (i) { var p = SB.prod(i.productId); return p ? esc(p.name) + " ×" + i.qty : ""; }).join("、") + '</td><td class="hide-m">' + (u ? esc(APP.cleanName(u.name)) : "—") + '</td><td class="hide-m">' + U.fmtDate(q.createdAt) + '</td><td class="num">' + APP.money(k.total) + '</td><td><span class="st st-' + q.status + '">' + q.status + "</span></td></tr>"; }).join("") || '<tr><td colspan="7"><div class="empty">' + icon("quote") + "<div>尚無報價單</div></div></td></tr>") + "</tbody></table></div>";
    },
    bind: function (el, args) {
      if (args[0]) return bindEditor(el, args[0]);
      $("[data-newq]", el).onclick = function () { APP.newQuote({}); };
      $$("[data-qf]", el).forEach(function (b) { b.onclick = function () { qFilter = b.getAttribute("data-qf"); APP.refresh(); }; });
      $$("[data-go]", el).forEach(function (tr) { tr.onclick = function () { APP.go("#/quotes/" + tr.getAttribute("data-go")); }; });
    }
  };
  var draft = null;
  function editor(id) {
    var db = APP.db();
    if (id === "new") {
      var p = APP._draftQuote || {};
      draft = { id: null, no: APP.nextQuoteNo(), clientId: p.clientId || "", resellerId: (p.clientId && APP.client(p.clientId) ? APP.client(p.clientId).resellerId : null) || APP.me().id, items: (p.items && p.items.length ? p.items : [{ productId: SB.products()[0].id, qty: 1 }]).map(function (x) { return Object.assign({}, x); }), discountType: "pct", discountValue: 0, status: "草稿", notes: p.notes || "", validDays: db.settings.quoteValidDays, createdAt: U.now() };
      APP._draftQuote = null;
    } else {
      var q = db.quotes.filter(function (x) { return x.id === id; })[0];
      if (!q) return '<div class="empty">找不到報價單</div>';
      draft = JSON.parse(JSON.stringify(q));
    }
    return '<div class="row" style="margin-bottom:14px"><a class="btn btn-ghost btn-sm" href="#/quotes">' + icon("back") + "報價單列表</a></div>" +
      '<div class="grid g-main" style="align-items:start"><div class="stack"><div class="card"><div class="card-h"><h3>' + icon("quote") + "報價單 " + esc(draft.no) + '</h3><div class="actions"><select class="select" id="qStatus" style="width:auto">' + QSTAT.map(function (s) { return "<option" + (draft.status === s ? " selected" : "") + ">" + s + "</option>"; }).join("") + "</select></div></div>" +
      '<div class="card-b stack"><div class="fgrid"><div class="f"><label>客戶</label><select class="select" id="qClient">' + APP.clientOptions(draft.clientId) + '</select></div><div class="f"><label>負責人</label><select class="select" id="qOwner"' + (APP.can("assign") ? "" : " disabled") + ">" + APP.userOptions(draft.resellerId) + "</select></div></div>" +
      '<div class="table-wrap"><table class="tbl"><thead><tr><th>產品</th><th style="width:80px">數量</th><th style="width:140px">單價</th><th class="num" style="width:130px">小計</th><th style="width:40px"></th></tr></thead><tbody id="qItems"></tbody></table></div>' +
      '<div><button class="btn btn-ghost btn-sm" id="qAdd">' + icon("plus") + "新增品項</button></div>" +
      '<div class="fgrid"><div class="f"><label>折扣</label><div class="row" style="flex-wrap:nowrap"><select class="select" id="qDT" style="width:110px"><option value="pct"' + (draft.discountType === "pct" ? " selected" : "") + '>百分比 %</option><option value="amt"' + (draft.discountType === "amt" ? " selected" : "") + ">金額</option></select><input class=\"input\" id=\"qDV\" type=\"number\" min=\"0\" step=\"0.01\" value=\"" + esc(draft.discountValue || 0) + '"></div></div><div class="f"><label>有效天數</label><input class="input" id="qValid" type="number" min="1" value="' + esc(draft.validDays || 14) + '"></div>' +
      '<div class="f full"><label>備註</label><textarea class="textarea" id="qNotes" rows="3">' + esc(draft.notes || "") + "</textarea></div></div></div></div></div>" +
      '<div class="stack" style="position:sticky;top:84px"><div class="card"><div class="card-h"><h3>' + icon("check") + '金額摘要</h3></div><div class="card-b" id="qSum"></div></div>' +
      '<div class="card card-b stack"><button class="btn btn-gold" id="qSave">' + icon("check") + '儲存報價單</button><button class="btn btn-ghost" id="qPrint">' + icon("print") + '列印／另存 PDF</button><button class="btn btn-wa" id="qWA">' + icon("whatsapp") + '<span>WhatsApp 發送摘要</span></button><button class="btn btn-ghost" id="qCopy">' + icon("copy") + "複製摘要</button>" + (draft.id ? '<button class="btn btn-ghost" id="qDel" style="color:var(--red)">' + icon("trash") + "刪除</button>" : "") + '</div><p class="xs muted">價格待定的品項，總額會顯示「價格待定」。可在單價欄針對此報價單個別填寫，或請管理員於設定中統一定價。</p></div></div>';
  }
  function itemsHTML() {
    var ps = SB.products();
    var k = APP.quoteCalc(draft);
    return k.lines.map(function (l, i) {
      var def = APP.priceOf(l.item.productId);
      return '<tr><td><select class="select" data-i="' + i + '" data-k="productId">' + ps.map(function (p) { return '<option value="' + p.id + '"' + (p.id === l.item.productId ? " selected" : "") + ">" + esc(p.name) + "</option>"; }).join("") + '</select></td><td><input class="input" type="number" min="1" data-i="' + i + '" data-k="qty" value="' + esc(l.item.qty) + '"></td><td><input class="input" type="number" min="0" step="0.01" data-i="' + i + '" data-k="unitPrice" value="' + (l.item.unitPrice != null ? esc(l.item.unitPrice) : "") + '" placeholder="' + (def != null ? def : "價格待定") + '"></td><td class="num">' + APP.money(l.total) + '</td><td><button class="icon-btn danger" data-rm="' + i + '">' + icon("trash") + "</button></td></tr>";
    }).join("");
  }
  function sumHTML() {
    var k = APP.quoteCalc(draft);
    return '<div class="stack small"><div class="row between"><span>小計</span><b>' + APP.money(k.subtotal) + '</b></div><div class="row between"><span>折扣' + (draft.discountType === "pct" ? "（" + (draft.discountValue || 0) + "%）" : "") + "</span><b>" + (k.discount == null ? "—" : "- " + APP.money(k.discount)) + '</b></div><div class="hr" style="margin:4px 0"></div><div class="row between"><span class="h-serif" style="font-size:1.05rem">總計</span><b class="h-serif" style="font-size:1.4rem;color:var(--gold-deep)">' + APP.money(k.total) + "</b></div>" + (k.unknown ? '<span class="tag amber">含價格待定品項</span>' : "") + "</div>";
  }
  function quoteSummary() {
    var c = APP.client(draft.clientId), k = APP.quoteCalc(draft), s = APP.db().settings;
    var L = ["【" + s.company.name + " 報價單 " + draft.no + "】", c ? "客戶：" + APP.cleanName(c.name) : "", "日期：" + U.fmtDate(draft.createdAt) + "（有效 " + (draft.validDays || 14) + " 天）", ""];
    k.lines.forEach(function (l, i) { L.push((i + 1) + ". " + (l.product ? l.product.name : "") + " × " + l.item.qty + "　" + APP.money(l.total)); });
    L.push(""); if (draft.discountValue) L.push("折扣：" + (draft.discountType === "pct" ? draft.discountValue + "%" : APP.money(draft.discountValue)));
    L.push("總計：" + APP.money(k.total)); if (draft.notes) L.push("備註：" + draft.notes);
    L.push("", "※ " + D.disclaimers.supplement, "如有任何問題，歡迎隨時回覆 🙏", "— " + APP.cleanName(APP.me().name) + "｜" + s.company.name + " " + s.company.phone);
    return L.filter(function (x, i) { return x !== "" || i > 2; }).join("\n");
  }
  function printQuote() {
    var s = APP.db().settings, c = APP.client(draft.clientId), k = APP.quoteCalc(draft), u = APP.user(draft.resellerId);
    var valid = new Date(new Date(draft.createdAt).getTime() + (draft.validDays || 14) * 86400000).toISOString();
    $("#printArea").innerHTML = '<div class="qdoc"><div class="qh"><div><img src="assets/brand/logo-wordmark.png" alt=""><div style="margin-top:6px">' + esc(s.company.legal || s.company.name) + (s.company.regNo ? "（" + esc(s.company.regNo) + "）" : "") + "<br>" + esc(s.company.address || "") + "<br>WhatsApp：" + esc(s.company.phone) + (s.company.email ? "｜" + esc(s.company.email) : "") + '</div></div><div style="text-align:right"><h1>報 價 單</h1><div>單號：<b>' + esc(draft.no) + "</b><br>日期：" + U.fmtDate(draft.createdAt) + "<br>有效至：" + U.fmtDate(valid) + "<br>狀態：" + esc(draft.status) + "</div></div></div>" +
      '<div style="display:flex;justify-content:space-between"><div><b>客戶</b><br>' + (c ? esc(c.name) + "<br>" + esc(c.phone || "") + "<br>" + esc(c.location || "") : "—") + '</div><div style="text-align:right"><b>負責顧問</b><br>' + (u ? esc(APP.cleanName(u.name)) + "（" + APP.ROLE[u.role] + "）<br>推薦碼 " + esc(u.code) : "") + "</div></div>" +
      '<table><thead><tr><th>#</th><th>產品</th><th>規格</th><th class="r">數量</th><th class="r">單價</th><th class="r">小計</th></tr></thead><tbody>' + k.lines.map(function (l, i) { return "<tr><td>" + (i + 1) + "</td><td><b>" + esc(l.product ? l.product.name : "") + "</b><br><span style='color:#7D6C5B'>" + esc(l.product ? l.product.tagline : "") + "</span></td><td>" + esc(l.product ? l.product.format : "") + '</td><td class="r">' + esc(l.item.qty) + '</td><td class="r">' + APP.money(l.unit) + '</td><td class="r">' + APP.money(l.total) + "</td></tr>"; }).join("") + "</tbody></table>" +
      '<div class="tot"><div><span>小計</span><span>' + APP.money(k.subtotal) + "</span></div><div><span>折扣</span><span>" + (k.discount == null ? "—" : "- " + APP.money(k.discount)) + '</span></div><div class="g"><span>總計</span><span>' + APP.money(k.total) + "</span></div></div>" +
      (draft.notes ? "<p><b>備註：</b>" + esc(draft.notes) + "</p>" : "") + '<div class="terms">' + esc(s.quoteTerms) + '</div><div class="sign"><div>顧問簽名</div><div>客戶確認</div></div></div>';
    document.body.classList.add("printing");
    setTimeout(function () { window.print(); }, 150);
  }
  window.addEventListener("afterprint", function () { setTimeout(function () { document.body.classList.remove("printing"); }, 800); });
  function bindEditor(el, id) {
    if (!draft) return;
    function redraw() { $("#qItems", el).innerHTML = itemsHTML(); $("#qSum", el).innerHTML = sumHTML(); }
    redraw();
    $("#qItems", el).addEventListener("change", function (e) {
      var t = e.target, i = t.getAttribute("data-i"); if (i == null) return;
      var k = t.getAttribute("data-k"), v = t.value;
      draft.items[i][k] = k === "qty" ? Math.max(1, parseInt(v, 10) || 1) : k === "unitPrice" ? (v === "" ? null : Number(v)) : v;
      redraw();
    });
    $("#qItems", el).addEventListener("click", function (e) { var b = e.target.closest("[data-rm]"); if (b) { draft.items.splice(+b.getAttribute("data-rm"), 1); redraw(); } });
    $("#qAdd", el).onclick = function () { draft.items.push({ productId: SB.products()[0].id, qty: 1 }); redraw(); };
    $("#qDT", el).onchange = function (e) { draft.discountType = e.target.value; redraw(); };
    $("#qDV", el).oninput = function (e) { draft.discountValue = Number(e.target.value) || 0; redraw(); };
    $("#qValid", el).oninput = function (e) { draft.validDays = parseInt(e.target.value, 10) || 14; };
    $("#qNotes", el).oninput = function (e) { draft.notes = e.target.value; };
    $("#qStatus", el).onchange = function (e) { draft.status = e.target.value; };
    $("#qClient", el).onchange = function (e) { draft.clientId = e.target.value; var c = APP.client(draft.clientId); if (c && c.resellerId) { draft.resellerId = c.resellerId; $("#qOwner", el).value = c.resellerId; } };
    $("#qOwner", el).onchange = function (e) { draft.resellerId = e.target.value; };
    function save(silent) {
      if (!draft.clientId) { APP.toast("請選擇客戶", "alert"); return false; }
      if (!draft.items.length) { APP.toast("請至少新增一個品項", "alert"); return false; }
      var db = APP.db(), isNew = !draft.id, old = isNew ? null : db.quotes.filter(function (q) { return q.id === draft.id; })[0];
      if (isNew) { draft.id = U.uid("q"); db.quotes.unshift(JSON.parse(JSON.stringify(draft))); APP.addTimeline(draft.clientId, "quote", "建立報價單 " + draft.no, draft.id); APP.log(APP.cleanName(APP.me().name) + " 建立報價單 " + draft.no, "quote"); }
      else {
        if (old.status !== draft.status) { APP.addTimeline(draft.clientId, "quote", "報價單 " + draft.no + " 狀態：" + draft.status, draft.id); APP.log("報價單 " + draft.no + " → " + draft.status, draft.status === "已成交" ? "trophy" : "quote"); }
        Object.assign(old, JSON.parse(JSON.stringify(draft)));
      }
      if (draft.status === "已成交") { var c = APP.client(draft.clientId); if (c && c.status !== "已成交") { c.status = "已成交"; } }
      APP.save(); if (!silent) APP.toast("報價單已儲存");
      if (isNew) history.replaceState(null, "", "#/quotes/" + draft.id);
      return true;
    }
    $("#qSave", el).onclick = function () { if (save()) APP.refresh(); };
    $("#qPrint", el).onclick = function () { printQuote(); };
    $("#qCopy", el).onclick = function () { APP.copy(quoteSummary(), "報價摘要已複製"); };
    $("#qWA", el).onclick = function () {
      if (!save(true)) return;
      var c = APP.client(draft.clientId);
      var q = APP.db().quotes.filter(function (x) { return x.id === draft.id; })[0];
      if (q.status === "草稿") { q.status = draft.status = "已發送"; }
      APP.addTimeline(draft.clientId, "whatsapp", "WhatsApp 發送報價單 " + draft.no); APP.save();
      window.open(U.wa(c ? c.phone : "", quoteSummary()), "_blank"); APP.refresh();
    };
    var del = $("#qDel", el); if (del) del.onclick = function () { APP.confirm("確定刪除報價單 " + esc(draft.no) + "？", function () { var db = APP.db(); db.quotes = db.quotes.filter(function (q) { return q.id !== draft.id; }); APP.save(); APP.go("#/quotes"); }, "刪除"); };
  }

  /* ====================== 跟進任務 ====================== */
  var tState = { scope: "all", overdue: false, client: "" };
  var COLS = [{ id: "todo", name: "待辦", color: "#4D6C8C" }, { id: "doing", name: "跟進中", color: "#C98A1B" }, { id: "done", name: "已完成", color: "#6E8D5C" }];
  APP.views.tasks = {
    title: "跟進任務", group: "客戶與銷售",
    render: function () {
      var me = APP.me(), today = U.today(), db = APP.db();
      var list = APP.visible(db.tasks).filter(function (t) { return (tState.scope === "all" || t.resellerId === me.id) && (!tState.overdue || (t.status !== "done" && t.due && t.due < today)) && (!tState.client || t.clientId === tState.client); });
      return '<div class="page-head"><div><h2>跟進任務</h2><p>像專案看板一樣管理跟進：拖曳卡片切換狀態，一鍵 WhatsApp／短訊（自動帶入範本訊息）。</p></div><div class="actions"><button class="btn btn-gold btn-sm" data-newt>' + icon("plus") + "新增任務</button></div></div>" +
        '<div class="toolbar"><div class="chipbar"><button data-scope="all" class="' + (tState.scope === "all" ? "active" : "") + '">' + (me.role === "agent" ? "我的任務" : "全部（含下線）") + '</button>' + (me.role !== "agent" ? '<button data-scope="me" class="' + (tState.scope === "me" ? "active" : "") + '">只看我的</button>' : "") + '<button data-ov class="' + (tState.overdue ? "active" : "") + '">' + icon("alert") + " 只看逾期</button></div>" +
        '<select class="select" id="tClient"><option value="">全部客戶</option>' + APP.clients().map(function (c) { return '<option value="' + c.id + '"' + (tState.client === c.id ? " selected" : "") + ">" + esc(c.name) + "</option>"; }).join("") + "</select></div>" +
        '<div class="kanban">' + COLS.map(function (col) {
          var items = list.filter(function (t) { return t.status === col.id; }).sort(function (a, b) { return (a.due || "9").localeCompare(b.due || "9"); });
          return '<section class="col" data-col="' + col.id + '"><div class="col-h"><span class="dotc" style="background:' + col.color + '"></span><h3>' + col.name + '</h3><span class="n">' + items.length + '</span><button class="icon-btn" style="margin-left:auto;width:28px;height:28px" data-newt="' + col.id + '" title="新增">' + icon("plus") + "</button></div>" + items.map(tcard).join("") + (items.length ? "" : '<div class="empty small" style="padding:20px 6px">拖曳卡片到這裡</div>') + "</section>";
        }).join("") + "</div>" +
        '<div class="card" style="margin-top:22px"><div class="card-h"><h3>' + icon("chat") + '跟進訊息範本</h3><div class="actions">' + (APP.can("settings") ? '<a class="btn btn-ghost btn-sm" href="#/settings">編輯範本</a>' : "") + '</div></div><div class="card-b grid g-3">' + db.settings.templates.map(function (t) { return '<div class="script"><h4>' + esc(t.name) + '</h4><pre>' + esc(t.text) + '</pre><button class="icon-btn" data-cpt="' + t.id + '" title="複製">' + icon("copy") + "</button></div>"; }).join("") + '</div><div class="card-b xs muted" style="padding-top:0">可用變數：{客戶} {顧問} {產品} {方案} {報價單號}</div></div>';
    },
    bind: function (el) {
      $$("[data-scope]", el).forEach(function (b) { b.onclick = function () { tState.scope = b.getAttribute("data-scope"); APP.refresh(); }; });
      $("[data-ov]", el).onclick = function () { tState.overdue = !tState.overdue; APP.refresh(); };
      $("#tClient", el).onchange = function (e) { tState.client = e.target.value; APP.refresh(); };
      $$("[data-newt]", el).forEach(function (b) { b.onclick = function () { APP.taskModal({ status: b.getAttribute("data-newt") || "todo" }); }; });
      $$("[data-cpt]", el).forEach(function (b) { b.onclick = function () { var t = APP.db().settings.templates.filter(function (x) { return x.id === b.getAttribute("data-cpt"); })[0]; APP.copy(t.text, "範本已複製"); }; });
      var dragId = null;
      $$(".tcard", el).forEach(function (c) {
        c.addEventListener("dragstart", function (e) { dragId = c.getAttribute("data-id"); c.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", dragId); } catch (er) {} });
        c.addEventListener("dragend", function () { c.classList.remove("dragging"); });
      });
      $$(".col", el).forEach(function (col) {
        col.addEventListener("dragover", function (e) { e.preventDefault(); col.classList.add("over"); });
        col.addEventListener("dragleave", function () { col.classList.remove("over"); });
        col.addEventListener("drop", function (e) { e.preventDefault(); col.classList.remove("over"); moveTask(dragId, col.getAttribute("data-col")); });
      });
      el.addEventListener("click", function (e) {
        var mv = e.target.closest("[data-mv]"); if (mv) { moveTask(mv.getAttribute("data-mv"), mv.getAttribute("data-to")); return; }
        var ed = e.target.closest("[data-edt]"); if (ed) { APP.taskModal(APP.db().tasks.filter(function (t) { return t.id === ed.getAttribute("data-edt"); })[0]); return; }
        var wa = e.target.closest("[data-twa]"); if (wa) { var t = APP.db().tasks.filter(function (x) { return x.id === wa.getAttribute("data-twa"); })[0]; if (t && t.clientId) { APP.addTimeline(t.clientId, wa.getAttribute("data-kind") === "sms" ? "whatsapp" : "whatsapp", (wa.getAttribute("data-kind") === "sms" ? "短訊跟進：" : "WhatsApp 跟進：") + t.title); if (t.status === "todo") t.status = "doing"; APP.save(); setTimeout(APP.refresh, 300); } }
      });
    }
  };
  function moveTask(id, to) {
    var t = APP.db().tasks.filter(function (x) { return x.id === id; })[0]; if (!t || t.status === to) return;
    t.status = to; if (to === "done") { t.doneAt = U.now(); if (t.clientId) APP.addTimeline(t.clientId, "task", "完成任務：" + t.title, t.id); APP.log("完成任務：" + t.title, "check"); }
    APP.save(); APP.refresh();
  }
  function taskMsg(t) {
    var c = APP.client(t.clientId), tpl = APP.db().settings.templates.filter(function (x) { return x.id === t.templateId; })[0];
    var q = APP.db().quotes.filter(function (x) { return x.clientId === t.clientId; })[0];
    var a = APP.db().assessments.filter(function (x) { return x.clientId === t.clientId; })[0];
    var vars = APP.tplVars(c, { "報價單號": q ? q.no : "", "產品": q && q.items[0] ? (SB.prod(q.items[0].productId) || {}).name : "", "方案": a ? a.focus.map(function (f) { return SB.sol(f).name; }).join("、") : "" });
    return tpl ? U.fill(tpl.text, vars) : "您好 " + vars["客戶"] + "，";
  }
  function tcard(t) {
    var today = U.today(), c = APP.client(t.clientId), u = APP.user(t.resellerId);
    var od = t.status !== "done" && t.due && t.due < today, td = t.status !== "done" && t.due === today;
    var msg = taskMsg(t), idx = COLS.map(function (x) { return x.id; }).indexOf(t.status);
    return '<article class="tcard ' + (od ? "overdue" : td ? "today" : "") + (t.status === "done" ? " done" : "") + '" draggable="true" data-id="' + t.id + '">' +
      '<div class="tt">' + esc(t.title) + "</div>" +
      '<div class="tm"><span class="pri pri-' + (t.priority || "normal") + '"></span>' + (c ? '<a href="#/clients/' + c.id + '" style="color:inherit">' + icon("users") + " " + esc(APP.cleanName(c.name)) + "</a>" : "") +
      (t.due ? '<span class="tag ' + (od ? "red" : td ? "amber" : "gray") + '">' + icon("clock") + " " + (od ? "逾期 " : td ? "今天 " : "") + U.fmtDate(t.due).slice(5) + "</span>" : "") +
      (u ? '<span class="avatar sm" title="' + esc(u.name) + '">' + esc(APP.initials(u.name)) + "</span>" : "") + "</div>" +
      (t.note ? '<div class="xs muted">' + esc(t.note) + "</div>" : "") +
      '<div class="ta">' + (c && c.phone ? '<a class="icon-btn wa" target="_blank" rel="noopener" href="' + U.wa(c.phone, msg) + '" data-twa="' + t.id + '" title="WhatsApp（範本訊息）">' + icon("whatsapp") + '</a><a class="icon-btn" href="' + U.sms(c.phone, msg) + '" data-twa="' + t.id + '" data-kind="sms" title="短訊 SMS">' + icon("sms") + "</a>" : '<span class="xs muted">未連結電話</span>') +
      '<span class="sp"></span>' + (idx > 0 ? '<button class="icon-btn" data-mv="' + t.id + '" data-to="' + COLS[idx - 1].id + '" title="移到 ' + COLS[idx - 1].name + '">' + icon("back") + "</button>" : "") + (idx < 2 ? '<button class="icon-btn" data-mv="' + t.id + '" data-to="' + COLS[idx + 1].id + '" title="移到 ' + COLS[idx + 1].name + '">' + icon("arrow") + "</button>" : "") + '<button class="icon-btn" data-edt="' + t.id + '" title="編輯">' + icon("edit") + "</button></div></article>";
  }
  APP.taskModal = function (t) {
    var isNew = !t || !t.id; t = Object.assign({ title: "", clientId: "", resellerId: APP.me().id, status: "todo", due: U.today(1), priority: "normal", channel: "whatsapp", templateId: "", note: "" }, t || {});
    var tpls = APP.db().settings.templates;
    APP.modal({
      title: isNew ? "新增跟進任務" : "編輯任務",
      body: '<div class="fgrid"><div class="f full"><label>任務標題 <span class="req">*</span></label><input class="input" name="title" value="' + esc(t.title) + '" placeholder="例：回訪御芯眠使用感受"></div>' +
        '<div class="f"><label>連結客戶</label><select class="select" name="clientId">' + APP.clientOptions(t.clientId, "— 不連結 —") + '</select></div><div class="f"><label>負責人</label><select class="select" name="resellerId"' + (APP.can("assign") ? "" : " disabled") + ">" + APP.userOptions(t.resellerId) + "</select></div>" +
        '<div class="f"><label>到期日</label><input class="input" type="date" name="due" value="' + esc(t.due) + '"></div><div class="f"><label>優先度</label><select class="select" name="priority"><option value="high"' + (t.priority === "high" ? " selected" : "") + '>高</option><option value="normal"' + (t.priority === "normal" ? " selected" : "") + '>中</option><option value="low"' + (t.priority === "low" ? " selected" : "") + ">低</option></select></div>" +
        '<div class="f"><label>跟進方式</label><select class="select" name="channel"><option value="whatsapp"' + (t.channel === "whatsapp" ? " selected" : "") + '>WhatsApp</option><option value="sms"' + (t.channel === "sms" ? " selected" : "") + '>短訊 SMS</option><option value="call"' + (t.channel === "call" ? " selected" : "") + ">電話</option></select></div>" +
        '<div class="f"><label>狀態</label><select class="select" name="status">' + COLS.map(function (c) { return '<option value="' + c.id + '"' + (t.status === c.id ? " selected" : "") + ">" + c.name + "</option>"; }).join("") + "</select></div>" +
        '<div class="f full"><label>訊息範本</label><select class="select" name="templateId"><option value="">— 不使用 —</option>' + tpls.map(function (x) { return '<option value="' + x.id + '"' + (t.templateId === x.id ? " selected" : "") + ">" + esc(x.name) + "</option>"; }).join("") + '</select><div class="note-box green xs" id="tplPrev" style="white-space:pre-wrap;display:none"></div></div>' +
        '<div class="f full"><label>備註</label><textarea class="textarea" name="note" rows="3">' + esc(t.note || "") + "</textarea></div></div>",
      footer: (isNew ? "" : '<button class="btn btn-ghost" data-tdel style="color:var(--red);margin-right:auto">' + icon("trash") + "刪除</button>") + '<button class="btn btn-ghost" data-mclose>取消</button><button class="btn btn-gold" data-mok>儲存</button>',
      onOpen: function (m, close) {
        var prev = function () { var f = APP.formData(m); var p = $("#tplPrev", m); if (!f.templateId) { p.style.display = "none"; return; } p.style.display = "block"; p.textContent = taskMsg({ clientId: f.clientId, templateId: f.templateId }); };
        $("[name=templateId]", m).onchange = prev; $("[name=clientId]", m).onchange = prev; prev();
        var d = $("[data-tdel]", m); if (d) d.onclick = function () { var db = APP.db(); db.tasks = db.tasks.filter(function (x) { return x.id !== t.id; }); APP.save(); close(); APP.refresh(); };
      },
      onOk: function (m) {
        var f = APP.formData(m); if (!f.title) { APP.toast("請輸入任務標題", "alert"); return false; }
        var db = APP.db();
        if (!APP.can("assign")) f.resellerId = t.resellerId;
        if (!f.resellerId && f.clientId && APP.client(f.clientId)) f.resellerId = APP.client(f.clientId).resellerId;
        if (isNew) { var nt = Object.assign({ id: U.uid("t"), createdAt: U.now() }, f); db.tasks.unshift(nt); if (f.clientId) APP.addTimeline(f.clientId, "task", "新增跟進任務：" + f.title + "（" + U.fmtDate(f.due) + "）", nt.id); APP.log("新增任務：" + f.title, "tasks"); }
        else { var real = db.tasks.filter(function (x) { return x.id === t.id; })[0]; Object.assign(real, f); if (f.status === "done" && !real.doneAt) real.doneAt = U.now(); }
        APP.save(); APP.toast("任務已儲存"); APP.refresh();
      }
    });
  };
})();
