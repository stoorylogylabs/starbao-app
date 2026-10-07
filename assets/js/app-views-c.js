/* 視圖 C：團隊／經銷商、培訓中心、設定 */
(function () {
  "use strict";
  var APP = window.APP, SB = APP.SB, U = SB.U, icon = SB.icon, D = SB.data, $ = APP.$, $$ = APP.$$, esc = U.esc;

  /* ---------- 業績計算 ---------- */
  function tierOf(u) { var ts = APP.db().settings.tiers; return ts.filter(function (t) { return t.id === u.tier; })[0] || ts.filter(function (t) { return t.role === u.role; })[0] || { name: APP.ROLE[u.role], rate: 0, override: 0 }; }
  APP.tierOf = tierOf;
  APP.userStats = function (u) {
    var db = APP.db(), month = U.today().slice(0, 7);
    var qs = db.quotes.filter(function (q) { return q.resellerId === u.id; });
    var won = qs.filter(function (q) { return q.status === "已成交"; });
    var amt = 0, unknown = false;
    won.forEach(function (q) { var k = APP.quoteCalc(q); if (k.total == null) unknown = true; else amt += k.total; });
    var cs = db.clients.filter(function (c) { return c.resellerId === u.id; });
    var leads = cs.filter(function (c) { return c.source === "網站自我檢測"; });
    var tasksOpen = db.tasks.filter(function (t) { return t.resellerId === u.id && t.status !== "done"; }).length;
    // 下線（直接下線）成交 → 管理津貼
    var down = db.users.filter(function (x) { return x.parentId === u.id; }).map(function (x) { return x.id; });
    var dAmt = 0, dUnknown = false, dDeals = 0;
    db.quotes.forEach(function (q) { if (q.status === "已成交" && down.indexOf(q.resellerId) > -1) { dDeals++; var k = APP.quoteCalc(q); if (k.total == null) dUnknown = true; else dAmt += k.total; } });
    var t = tierOf(u);
    var comm = unknown || dUnknown ? null : amt * (t.rate || 0) / 100 + dAmt * (t.override || 0) / 100;
    return { user: u, tier: t, clients: cs.length, leads: leads.length, quotes: qs.length, deals: won.length, amount: unknown ? null : amt, amountLabel: won.length ? (unknown ? "金額：價格待定" : APP.money(amt)) : "尚無成交", downDeals: dDeals, commission: comm, commissionLabel: (won.length || dDeals) ? (comm == null ? "待定價" : APP.money(comm)) : "—", tasksOpen: tasksOpen, newThisMonth: cs.filter(function (c) { return (c.createdAt || "").slice(0, 7) === month; }).length };
  };
  APP.leaderboard = function (metric) {
    metric = metric || "deals";
    var C = SB.Cloud;
    if (C && C.enabled && C.leaderboard) {
      return C.leaderboard.map(function (r) {
        var amt = r.amount_known && r.amount != null ? Number(r.amount) : null;
        return { user: { id: r.id, name: r.name, role: r.role, code: r.referral_code }, deals: r.deals, clients: r.clients, leads: r.leads, quotes: r.quotes, amount: amt, amountLabel: r.deals ? (amt == null ? "金額：價格待定" : APP.money(amt)) : "尚無成交" };
      }).sort(function (a, b) { return (metric === "amount" ? (b.amount || 0) - (a.amount || 0) : (b[metric] || 0) - (a[metric] || 0)) || (b.clients - a.clients); });
    }
    return APP.db().users.filter(function (u) { return u.role !== "admin"; }).map(APP.userStats).sort(function (a, b) {
      var x = metric === "amount" ? (b.amount || 0) - (a.amount || 0) : (b[metric] || 0) - (a[metric] || 0);
      return x || (b.clients - a.clients) || (b.quotes - a.quotes);
    });
  };
  // 推薦連結指向公開首頁（config.js 的 siteUrl；系統與首頁分開部署時必填）
  function refLink(code) {
    var site = SB.config().siteUrl, base;
    if (site) base = site.replace(/\/?$/, "/");
    else { base = location.href.split("#")[0].split("?")[0].replace(/app\.html$/, ""); if (!/\/$/.test(base)) base = base.replace(/[^\/]*$/, ""); }
    return base + "?ref=" + encodeURIComponent(code);
  }
  APP.refLink = refLink;

  /* ====================== 團隊／經銷商 ====================== */
  var lbMetric = "deals";
  APP.views.team = {
    title: "團隊／經銷商", group: "團隊",
    render: function () {
      var me = APP.me(), db = APP.db(), ids = APP.visibleUserIds();
      var members = db.users.filter(function (u) { return ids.indexOf(u.id) > -1; });
      var st = members.map(APP.userStats);
      var mine = APP.userStats(me), link = refLink(me.code);
      var tot = st.reduce(function (a, s) { a.c += s.clients; a.d += s.deals; a.l += s.leads; return a; }, { c: 0, d: 0, l: 0 });
      var lb = APP.leaderboard(lbMetric);
      var shareMsg = "您好！邀請您花 3 分鐘做一份免費的「健康生活評估」，了解最適合您的調理方向 👉 " + link;
      return '<div class="page-head"><div><h2>團隊與經銷商</h2><p>多層級團隊：總部 Admin → 經理 → 經銷商 → 代理。推薦連結帶來的名單會自動歸屬給該顧問。</p></div><div class="actions">' + (APP.can("manageTeam") ? '<button class="btn btn-gold btn-sm" data-addm>' + icon("plus") + (APP.cloud() ? "邀請成員" : "新增成員") + "</button>" : "") + "</div></div>" +
        '<div class="grid g-2" style="margin-bottom:18px;align-items:stretch"><div class="card card-b stack" style="background:linear-gradient(135deg,#3A2A1E,#5B4330);color:#F6E9D2;border:0"><div class="row"><span class="avatar" style="background:var(--gold-grad);color:#fff">' + esc(APP.initials(me.name)) + '</span><div><b style="font-size:1.1rem">' + esc(APP.cleanName(me.name)) + "</b> " + APP.roleTag(me.role) + '<div class="xs" style="opacity:.8">' + esc(mine.tier.name) + "・個人佣金 " + (mine.tier.rate || 0) + "%" + (mine.tier.override ? "・下線津貼 " + mine.tier.override + "%" : "") + '</div></div></div><div class="xs" style="opacity:.85">我的專屬推薦連結（客戶完成首頁自我檢測後，名單會自動進入您的客戶列表）</div><div class="reflink" style="background:rgba(255,255,255,.08);border-color:rgba(232,201,138,.5)"><code style="color:#F4D88E">' + esc(link) + '</code><button class="icon-btn" data-cplink title="複製">' + icon("copy") + '</button></div><div class="row"><a class="btn btn-wa btn-sm" target="_blank" rel="noopener" href="' + U.wa("", shareMsg) + '">' + icon("whatsapp") + '<span>分享推薦連結</span></a><a class="btn btn-ghost btn-sm" style="color:#F6E9D2;border-color:rgba(246,233,210,.35)" href="' + esc(link) + '" target="_blank" rel="noopener">' + icon("link") + "預覽首頁</a></div></div>" +
        '<div class="grid g-2">' + mini("users", "團隊成員", members.length) + mini("star", "推薦連結名單", tot.l) + mini("users", "團隊客戶", tot.c) + mini("trophy", "團隊成交", tot.d + " 單") + "</div></div>" +
        '<div class="card" style="margin-bottom:18px"><div class="card-h"><h3>' + icon("team") + '成員與業績</h3></div><div class="table-wrap"><table class="tbl responsive"><thead><tr><th>成員</th><th>角色／級別</th><th>推薦碼</th><th class="num">客戶</th><th class="num">網站名單</th><th class="num">報價</th><th class="num">成交</th><th class="num">預估佣金</th><th></th></tr></thead><tbody>' +
        st.map(function (s) { var u = s.user, p = APP.user(u.parentId); return '<tr><td><div class="cname"><span class="avatar sm">' + esc(APP.initials(u.name)) + "</span><div>" + esc(u.name) + (u.id === me.id ? ' <span class="tag gold">我</span>' : "") + (APP.cloud() && !u.active ? ' <span class="tag amber">待審核／停用</span>' : "") + '<div class="xs muted" style="font-weight:400">上線：' + (p ? esc(APP.cleanName(p.name)) : "—") + "</div></div></div></td><td>" + APP.roleTag(u.role) + '<div class="xs muted">' + esc(s.tier.name) + " " + (s.tier.rate || 0) + '%</div></td><td class="hide-m"><code>' + esc(u.code) + '</code></td><td class="num hide-m">' + s.clients + '</td><td class="num hide-m">' + s.leads + '</td><td class="num hide-m">' + s.quotes + '</td><td class="num">' + s.deals + '</td><td class="num hide-m small">' + s.commissionLabel + '</td><td class="num"><button class="icon-btn" data-stat="' + u.id + '" title="查看">' + icon("search") + "</button>" + (APP.can("manageTeam") && (me.role === "admin" || u.id !== me.id) ? '<button class="icon-btn" data-editm="' + u.id + '" title="編輯">' + icon("edit") + "</button>" : "") + "</td></tr>"; }).join("") + "</tbody></table></div></div>" +
        '<div class="grid g-main" style="align-items:start"><div class="stack">' +
        '<div class="card"><div class="card-h"><h3>' + icon("shield") + '級別與佣金制度</h3><div class="actions">' + (APP.can("settings") ? '<a class="btn btn-ghost btn-sm" href="#/settings/tiers">調整比例</a>' : "") + '</div></div><div class="table-wrap"><table class="tbl"><thead><tr><th>級別</th><th class="num">個人成交佣金</th><th class="num">直屬下線津貼</th><th>晉升條件</th></tr></thead><tbody>' +
        db.settings.tiers.map(function (t) { return "<tr><td><b>" + esc(t.name) + '</b></td><td class="num">' + (t.rate || 0) + '%</td><td class="num">' + (t.override || 0) + "%</td><td class=\"small\">" + esc(t.target || "") + "</td></tr>"; }).join("") + '</tbody></table></div><div class="card-b xs muted">⚠️ 以上比例為系統預設示範數值，請總部確認正式制度後於「設定 → 佣金級別」修改。成交金額在價格待定時無法計算佣金。</div></div></div>' +
        '<div class="stack"><div class="card"><div class="card-h"><h3>' + icon("trophy") + '排行榜</h3></div><div class="card-b"><div class="chipbar" style="margin-bottom:12px">' + [["deals", "成交數"], ["clients", "客戶數"], ["leads", "網站名單"], ["quotes", "報價數"]].map(function (m) { return '<button data-lbm="' + m[0] + '" class="' + (lbMetric === m[0] ? "active" : "") + '">' + m[1] + "</button>"; }).join("") + '</div><div class="lb">' +
        lb.slice(0, 8).map(function (r, i) { var v = r[lbMetric]; return '<div class="lb-row' + (i < 3 ? " r" + (i + 1) : "") + '"><span class="rk">' + (i + 1) + '</span><span class="avatar sm">' + esc(APP.initials(r.user.name)) + "</span><div><b>" + esc(APP.cleanName(r.user.name)) + '</b><div class="xs muted">' + APP.ROLE[r.user.role] + '</div></div><div class="v">' + v + "<small>" + (lbMetric === "deals" ? r.amountLabel : { clients: "位客戶", leads: "筆名單", quotes: "張報價" }[lbMetric]) + "</small></div></div>"; }).join("") + "</div></div></div>" +
        '<div class="card"><div class="card-h"><h3>' + icon("team") + '組織架構</h3></div><div class="card-b">' + tree(me.role === "admin" ? null : me.id) + "</div></div>" +
        '<div class="card"><div class="card-h"><h3>' + icon("training") + '新人培訓角</h3></div><div class="card-b small stack"><div>1️⃣ 熟讀「培訓中心」的產品知識卡與合規用語。</div><div>2️⃣ 使用「健康評估」為客戶建立第一份評估。</div><div>3️⃣ 分享您的推薦連結，名單會自動進入您的 CRM。</div><div>4️⃣ 每天清空「跟進任務」看板的今日任務。</div><a class="btn btn-ghost btn-sm" href="#/training">前往培訓中心</a></div></div>' +
        (APP.cloud() ? cloudTeamCards(me) + '<div class="note-box green xs">🔒 雲端模式：帳號由 Supabase Auth 驗證；經理只能看到自己與下線的客戶，經銷商／代理只能看到指派給自己的客戶（資料庫 Row Level Security）。</div>'
          : '<div class="note-box int xs">🔒 本系統的角色切換與 PIN 登入為前端示範，所有資料存在瀏覽器 localStorage，並非真正的安全權限控管。正式上線請搭配後端帳號系統（見 README：Supabase 雲端模式）。</div>') + "</div></div>";
    },
    bind: function (el) {
      var me = APP.me();
      $("[data-cplink]", el).onclick = function () { APP.copy(refLink(me.code), "推薦連結已複製"); };
      $$("[data-lbm]", el).forEach(function (b) { b.onclick = function () { lbMetric = b.getAttribute("data-lbm"); APP.refresh(); }; });
      var add = $("[data-addm]", el); if (add) add.onclick = function () { if (APP.cloud()) inviteModal(); else memberModal(); };
      $$("[data-editm]", el).forEach(function (b) { b.onclick = function () { memberModal(APP.user(b.getAttribute("data-editm"))); }; });
      $$("[data-stat]", el).forEach(function (b) { b.onclick = function () { statModal(APP.user(b.getAttribute("data-stat"))); }; });
      $$("[data-approve]", el).forEach(function (b) { b.onclick = function () { memberModal(APP.user(b.getAttribute("data-approve"))); }; });
      $$("[data-delinv]", el).forEach(function (b) { b.onclick = function () { SB.Cloud.deleteInvite(b.getAttribute("data-delinv")).then(function () { APP.toast("已取消邀請"); APP.refresh(); }).catch(function (e) { APP.toast(e.message, "alert"); }); }; });
    }
  };
  function cloudTeamCards(me) {
    var db = APP.db(), out = "";
    var pend = me.role === "admin" ? db.users.filter(function (u) { return !u.active; }) : [];
    if (pend.length) out += '<div class="card"><div class="card-h"><h3>' + icon("alert") + "待審核成員（" + pend.length + '）</h3></div><div class="card-b tight">' + pend.map(function (u) { var up = APP.user(u.parentId); return '<div class="li"><span class="avatar sm">' + esc(APP.initials(u.name)) + '</span><div><div class="ttl">' + esc(u.name || u.email) + '</div><div class="meta">' + esc(u.email || "") + (up ? "・上線 " + esc(APP.cleanName(up.name)) : "") + '</div></div><div class="end"><button class="btn btn-gold btn-sm" data-approve="' + u.id + '">設定並啟用</button></div></div>'; }).join("") + "</div></div>";
    var inv = db.invitations || [];
    if (APP.can("manageTeam")) out += '<div class="card"><div class="card-h"><h3>' + icon("link") + "已發出的邀請（" + inv.length + ')</h3></div><div class="card-b tight">' + (inv.map(function (x) { var up = APP.user(x.upline_id); return '<div class="li"><span class="act-ic">' + icon("users") + '</span><div><div class="ttl">' + esc(x.name || x.email) + " " + APP.roleTag(x.role) + '</div><div class="meta">' + esc(x.email) + (up ? "・上線 " + esc(APP.cleanName(up.name)) : "") + (x.referral_code ? "・推薦碼 " + esc(x.referral_code) : "") + '</div></div><div class="end"><button class="icon-btn danger" data-delinv="' + x.id + '" title="取消邀請">' + icon("trash") + "</button></div></div>"; }).join("") || '<div class="empty small">尚無待接受的邀請</div>') + '<div class="xs muted" style="padding:8px 4px 0">對方用此電郵到系統「建立帳號」並完成電郵驗證後，會自動啟用並套用角色。</div></div></div>';
    return out;
  }
  function inviteModal() {
    var me = APP.me(), db = APP.db();
    var roles = me.role === "admin" ? ["manager", "reseller", "agent", "admin"] : ["reseller", "agent"];
    var parents = db.users.filter(function (x) { return x.active && APP.visibleUserIds().indexOf(x.id) > -1; });
    APP.modal({
      title: "邀請團隊成員",
      body: '<div class="fgrid"><div class="f full"><label>電郵 <span class="req">*</span></label><input class="input" name="email" type="email" placeholder="對方建立帳號時使用的電郵"></div><div class="f"><label>姓名</label><input class="input" name="name"></div>' +
        '<div class="f"><label>角色</label><select class="select" name="role">' + roles.map(function (r) { return '<option value="' + r + '"' + (r === "reseller" ? " selected" : "") + ">" + APP.ROLE[r] + "</option>"; }).join("") + '</select></div>' +
        '<div class="f"><label>上線</label><select class="select" name="upline_id">' + parents.map(function (x) { return '<option value="' + x.id + '"' + (x.id === me.id ? " selected" : "") + ">" + esc(x.name) + "｜" + APP.ROLE[x.role] + "</option>"; }).join("") + '</select></div>' +
        '<div class="f"><label>佣金級別</label><select class="select" name="tier_id"><option value="">（依角色）</option>' + db.settings.tiers.map(function (t) { return '<option value="' + t.id + '">' + esc(t.name) + "</option>"; }).join("") + '</select></div>' +
        '<div class="f"><label>推薦碼（英數，選填）</label><input class="input" name="referral_code" style="text-transform:uppercase"></div></div><p class="xs muted">送出後請通知對方：到 app.html →「建立帳號」，使用上面的電郵建立密碼並完成信箱驗證，帳號即自動啟用。</p>',
      ok: "建立邀請",
      onOk: function (m) {
        var f = APP.formData(m);
        if (!/^\S+@\S+\.\S+$/.test(f.email)) { APP.toast("請輸入正確的電郵", "alert"); return false; }
        f.referral_code = (f.referral_code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
        SB.Cloud.invite(f).then(function () { APP.toast("邀請已建立：" + f.email); APP.refresh(); }).catch(function (e) { APP.toast("建立失敗：" + e.message, "alert"); });
      }
    });
  }
  function mini(ic, lbl, val) { return '<div class="card kpi"><span class="ic">' + icon(ic) + '</span><span class="lbl">' + lbl + '</span><span class="val">' + val + "</span></div>"; }
  function tree(rootId) {
    var users = APP.db().users;
    function node(u) { var kids = users.filter(function (x) { return x.parentId === u.id; }); return "<li>" + APP.roleTag(u.role) + " <b>" + esc(APP.cleanName(u.name)) + '</b> <span class="xs muted">' + esc(u.code) + "</span>" + (kids.length ? '<ul class="tree">' + kids.map(node).join("") + "</ul>" : "") + "</li>"; }
    var roots = rootId ? [APP.user(rootId)] : users.filter(function (u) { return !u.parentId || !APP.user(u.parentId); });
    return '<ul class="tree root">' + roots.map(node).join("") + "</ul>";
  }
  function statModal(u) {
    var s = APP.userStats(u), db = APP.db();
    var cs = db.clients.filter(function (c) { return c.resellerId === u.id; });
    APP.modal({
      title: esc(u.name) + " 的業績", footer: '<button class="btn btn-ghost" data-mclose>關閉</button>' + (!APP.cloud() && APP.me().role === "admin" && u.id !== APP.me().id ? '<button class="btn btn-dark" data-switch>' + icon("users") + "以此身分檢視（示範）</button>" : "") + (u.phone ? '<a class="btn btn-wa" target="_blank" rel="noopener" href="' + U.wa(u.phone, "Hi " + APP.cleanName(u.name) + "，") + '">' + icon("whatsapp") + "WhatsApp</a>" : ""),
      body: '<div class="grid g-3" style="margin-bottom:14px">' + mini("users", "客戶", s.clients) + mini("star", "網站名單", s.leads) + mini("quote", "報價單", s.quotes) + mini("trophy", "成交", s.deals) + mini("tasks", "未完成任務", s.tasksOpen) + mini("users", "本月新客", s.newThisMonth) + "</div>" +
        '<div class="small stack"><div><b>級別：</b>' + esc(s.tier.name) + "（個人 " + (s.tier.rate || 0) + "%／下線津貼 " + (s.tier.override || 0) + "%）</div><div><b>成交金額：</b>" + s.amountLabel + "</div><div><b>下線成交：</b>" + s.downDeals + " 單</div><div><b>預估佣金：</b>" + s.commissionLabel + '</div><div><b>推薦連結：</b><div class="reflink"><code>' + esc(refLink(u.code)) + "</code></div></div><div><b>客戶：</b>" + (cs.map(function (c) { return '<a href="#/clients/' + c.id + '" data-mclose>' + esc(c.name) + "</a>"; }).join("、") || "—") + "</div></div>",
      onOpen: function (m, close) { var sw = $("[data-switch]", m); if (sw) sw.onclick = function () { APP.db().session = { userId: u.id, at: U.now() }; APP.save(); close(); APP.start(); APP.toast("已切換為 " + APP.cleanName(u.name) + "（示範）", "users"); }; }
    });
  }
  function memberModal(u) {
    var me = APP.me(), isNew = !u, db = APP.db();
    u = u || { name: "", phone: "", role: me.role === "admin" ? "reseller" : "agent", tier: "", code: "", pin: "", parentId: me.id };
    var roles = me.role === "admin" ? ["manager", "reseller", "agent", "admin"] : ["reseller", "agent"];
    var parents = db.users.filter(function (x) { return APP.visibleUserIds().indexOf(x.id) > -1 && x.id !== u.id; });
    APP.modal({
      title: isNew ? "新增團隊成員" : "編輯成員",
      body: '<div class="fgrid"><div class="f"><label>姓名 <span class="req">*</span></label><input class="input" name="name" value="' + esc(u.name) + '"></div><div class="f"><label>電話／WhatsApp</label><input class="input" name="phone" value="' + esc(u.phone || "") + '"></div>' +
        '<div class="f"><label>角色</label><select class="select" name="role">' + roles.map(function (r) { return '<option value="' + r + '"' + (u.role === r ? " selected" : "") + ">" + APP.ROLE[r] + "</option>"; }).join("") + '</select></div><div class="f"><label>佣金級別</label><select class="select" name="tier">' + db.settings.tiers.map(function (t) { return '<option value="' + t.id + '"' + ((u.tier || u.role) === t.id ? " selected" : "") + ">" + esc(t.name) + "（" + (t.rate || 0) + "%）</option>"; }).join("") + "</select></div>" +
        '<div class="f"><label>上線</label><select class="select" name="parentId">' + parents.map(function (x) { return '<option value="' + x.id + '"' + (u.parentId === x.id ? " selected" : "") + ">" + esc(x.name) + "｜" + APP.ROLE[x.role] + "</option>"; }).join("") + '</select></div><div class="f"><label>推薦碼（英數，留空自動產生）</label><input class="input" name="code" value="' + esc(u.code || "") + '" style="text-transform:uppercase"></div>' +
        (APP.cloud() ? '<div class="f"><label>電郵</label><input class="input" value="' + esc(u.email || "") + '" disabled></div><div class="f"><span class="lbl">帳號狀態</span><label class="ck"><input type="checkbox" name="active" value="1"' + (u.active ? " checked" : "") + '><span>啟用（可登入並看到資料）</span></label></div></div>'
          : '<div class="f"><label>登入 PIN（4–6 位數字，示範用）</label><input class="input" name="pin" inputmode="numeric" maxlength="6" value="' + esc(u.pin || "") + '"></div></div><p class="xs muted">PIN 僅用於前端示範切換身分，非安全機制。</p>'),
      footer: (!isNew && me.role === "admin" && u.id !== me.id ? '<button class="btn btn-ghost" data-mdel style="color:var(--red);margin-right:auto">' + icon("trash") + "移除</button>" : "") + '<button class="btn btn-ghost" data-mclose>取消</button><button class="btn btn-gold" data-mok>儲存</button>',
      onOpen: function (m, close) {
        var d = $("[data-mdel]", m);
        if (d) d.onclick = function () {
          var nu = db.users.filter(function (x) { return x.id !== u.id; });
          db.users.forEach(function (x) { if (x.parentId === u.id) x.parentId = u.parentId; });
          ["clients", "tasks", "quotes"].forEach(function (k) { db[k].forEach(function (x) { if (x.resellerId === u.id) x.resellerId = u.parentId || me.id; }); });
          db.users = nu; APP.log("移除成員 " + u.name + "，其客戶已轉給上線", "team"); APP.save(); close(); APP.refresh();
        };
      },
      onOk: function (m) {
        var f = APP.formData(m);
        if (!f.name) { APP.toast("請輸入姓名", "alert"); return false; }
        f.code = (f.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
        if (!f.code) f.code = (f.name.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "SB") + Math.floor(100 + Math.random() * 900);
        if (db.users.some(function (x) { return x.code === f.code && x.id !== u.id; })) { APP.toast("推薦碼已被使用", "alert"); return false; }
        if (f.pin && !/^\d{4,6}$/.test(f.pin)) { APP.toast("PIN 需為 4–6 位數字", "alert"); return false; }
        f.phone = U.normPhone(f.phone);
        if (APP.cloud()) { var cu = APP.user(u.id); f.active = (f.active || []).length > 0; delete f.pin; Object.assign(cu, f); APP.save(); APP.toast("已更新（同步到雲端）"); APP.refresh(); return; }
        if (isNew) { db.users.push(Object.assign({ id: U.uid("u"), joinedAt: U.now() }, f, { pin: f.pin || "0000" })); APP.log(APP.cleanName(me.name) + " 新增成員 " + f.name + "（" + APP.ROLE[f.role] + "）", "team"); }
        else { var real = APP.user(u.id); Object.assign(real, f); if (!f.pin) real.pin = u.pin; }
        APP.save(); APP.toast(isNew ? "已新增成員（預設 PIN " + (f.pin || "0000") + "）" : "已更新"); APP.refresh();
      }
    });
  }

  /* ====================== 培訓中心 ====================== */
  var trTab = "products";
  var SCRIPTS = [
    { t: "開場白（首次聯繫）", s: "您好～我是星寶 Star Bao 的健康顧問 {顧問}。我們不是單純賣產品，而是根據您的生活習慣，提供有科學依據的調理方案。方便花 3 分鐘做個免費健康生活評估嗎？" },
    { t: "客戶問：這是藥嗎？", s: "不是哦，星寶的產品都是「營養補充食品」，不是藥物，也不能取代醫生的治療。它的角色是幫助日常營養補充與保養。如果您正在服藥，建議先問過醫生再搭配使用 🙏" },
    { t: "客戶問：吃了多久會好？", s: "每個人的體質和生活習慣不同，實際感受因人而異。一般我們建議規律使用，並搭配均衡飲食、充足睡眠和適量運動，我也會定期關心您的使用感受，一起調整。" },
    { t: "客戶有腎臟／慢性病", s: "謝謝您告訴我這個重要資訊。因為您有腎臟（或慢性病）狀況，建議先帶著產品成分表諮詢您的主治醫師，確認適合後再開始使用。我可以把完整成分資料傳給您參考。" },
    { t: "價格異議", s: "明白您的考量～其實我們更在意的是找到「真正適合您」的方案，而不是買很多。可以先從最核心的一款開始，我再根據您的感受建議下一步。我把方案和報價整理給您參考好嗎？" },
    { t: "邀請成為經銷商", s: "您對健康這麼有心得，有沒有興趣一起分享給身邊的人？星寶有完整的培訓、系統工具和推薦連結，名單會自動歸屬給您。方便的話我跟您介紹一下合作方式 😊" }
  ];
  APP.views.training = {
    title: "培訓中心", group: "團隊",
    render: function () {
      var tabs = [["products", "產品知識卡"], ["compliance", "合規用語"], ["scripts", "銷售話術"], ["flow", "諮詢流程"], ["internal", "團隊專屬"]];
      var body = "";
      if (trTab === "products") {
        body = '<div class="grid g-3">' + SB.products().map(function (p) {
          return '<div class="kcard"><div class="kh"><img src="' + esc(p.thumb || p.image) + '" alt="' + esc(p.name) + '" loading="lazy"><div><b class="h-serif">' + esc(p.name) + '</b><div class="xs muted">' + esc(p.category) + "｜" + esc(p.format || "") + '</div></div></div><div class="kb"><div>' + esc(p.tagline || "") + "</div><div><b>主打：</b>" + esc((p.highlights || []).slice(0, 2).join("；")) + "</div><div><b>專利：</b>" + (p.patents && p.patents.length ? esc(p.patents.join("、")) : '<span class="tag amber">資料待補</span>') + "</div><div><b>重點功效：</b>" + esc((p.benefits || []).slice(0, 3).join("、")) + "</div>" + (p.cautions ? '<div class="xs" style="color:var(--red)">⚠️ ' + esc(p.cautions) + "</div>" : "") + '<a class="btn btn-ghost btn-sm" href="#/catalog/' + p.id + '">完整資料</a></div></div>';
        }).join("") + "</div>";
      } else if (trTab === "compliance") {
        var cmp = APP.internal && APP.internal.training && APP.internal.training.compliance;
        var li = function (arr) { return (arr || []).map(function (x) { return "<li>" + esc(x) + "</li>"; }).join(""); };
        body = (cmp ? '<div class="do-dont"><div class="col2 ok"><h4>✅ 可以這樣說</h4><ul>' + li(cmp.allowed) + '</ul></div><div class="col2 no"><h4>⛔ 不可以這樣說</h4><ul>' + li(cmp.forbidden) + "</ul></div></div>" : APP.teamOnlyBox("完整的「可以說／不可以說」用語清單")) +
          '<div class="note-box amber" style="margin-top:16px">遇到以下狀況請「暫停推薦產品」並建議盡快就醫：胸痛、呼吸困難、血尿／黑便、不明原因快速消瘦、單側肢體無力、意識混亂、持續高燒、自我傷害念頭等。系統的健康評估遇到這些勾選會自動改為提示「請盡快就醫」。</div>' +
          '<div class="note-box int" style="margin-top:12px"><b>系統內建免責聲明：</b><br>' + esc(D.disclaimers.assessment) + "<br>" + esc(D.disclaimers.supplement) + "</div>";
      } else if (trTab === "scripts") {
        var vars = APP.tplVars(null);
        body = '<div class="grid g-2">' + SCRIPTS.map(function (s, i) { return '<div class="script"><h4>' + esc(s.t) + "</h4><pre>" + esc(U.fill(s.s, vars)) + '</pre><button class="icon-btn" data-cps="' + i + '" title="複製">' + icon("copy") + "</button></div>"; }).join("") + "</div>";
      } else if (trTab === "flow") {
        body = '<div class="grid g-4">' + [["1. 建立關係", "WhatsApp 問候、了解客戶最在意的狀況；在 CRM 建檔（可拖放對話截圖）。"], ["2. 健康生活評估", "用「健康評估」問卷 + 客戶自述，系統依規則評分並排列解決方案。"], ["3. 提供方案", "依評估結果說明「清理・營養・平衡」的調理邏輯，一鍵產生報價單。"], ["4. 持續跟進", "建立跟進任務：一週回訪、回購提醒；以範本訊息 WhatsApp／短訊聯繫。"]].map(function (x) { return '<div class="card card-b"><h4 class="h-serif" style="margin:0 0 6px">' + x[0] + '</h4><p class="small muted" style="margin:0">' + x[1] + "</p></div>"; }).join("") + "</div>" +
          '<div class="card" style="margin-top:16px"><div class="card-h"><h3>' + icon("catalog") + '解決方案對照</h3></div><div class="table-wrap"><table class="tbl"><thead><tr><th>解決方案</th><th>主要產品</th><th>輔助產品</th></tr></thead><tbody>' +
          D.solutions.map(function (s) { var pr = SB.products().filter(function (p) { return p.solutions.primary.indexOf(s.id) > -1; }), se = SB.products().filter(function (p) { return (p.solutions.secondary || []).indexOf(s.id) > -1; }); return "<tr><td><b>" + esc(s.name) + '</b><div class="xs muted">' + esc(s.desc) + '</div></td><td class="small">' + pr.map(function (p) { return esc(p.name); }).join("、") + '</td><td class="small muted">' + se.map(function (p) { return esc(p.name); }).join("、") + "</td></tr>"; }).join("") + "</tbody></table></div></div>";
      } else {
        var IC = APP.internal, T = IC && IC.training && IC.training.team;
        if (!IC || !T) body = APP.teamOnlyBox("團隊專屬資料（認證與檢驗來源、專家資料、各產品團隊備註、教育圖表）");
        else body = '<div class="note-box red" style="margin-bottom:16px">🔒 <b>' + esc(T.notice) + "</b></div>" +
          '<div class="grid g-2" style="align-items:start"><div class="stack"><div class="card"><div class="card-h"><h3>' + icon("shield") + '認證與檢驗（來源資料所載）</h3></div><div class="card-b"><ul class="ul-dot">' + ((IC.science && IC.science.certifications) || []).map(function (c) { return "<li>" + esc(c) + "</li>"; }).join("") + '</ul></div></div><div class="card"><div class="card-h"><h3>' + icon("users") + '專家資料</h3></div><div class="card-b small">' + ((IC.science && IC.science.expertsInternal) || []).map(function (x) { return '<p style="margin:0 0 8px">' + esc(x) + "</p>"; }).join("") + '<p class="muted xs" style="margin:0">' + esc(T.expertsFootnote) + "</p></div></div>" +
          '<div class="card"><div class="card-h"><h3>' + icon("edit") + '各產品團隊備註</h3></div><div class="card-b small stack">' + SB.products().filter(function (p) { return p.internalNotes; }).map(function (p) { return "<div><b>" + esc(p.name) + "：</b>" + esc(p.internalNotes) + "</div>"; }).join("") + "</div></div></div>" +
          '<div class="card"><div class="card-h"><h3>' + icon("image") + esc(T.chart.title) + '</h3></div><div class="card-b"><img data-internal-img="' + esc(IC.images && IC.images.chart || "") + '" alt="' + esc(T.chart.alt) + '" style="width:100%;border-radius:12px;min-height:120px;background:var(--cream,#f5ecdd)"><p class="xs muted">' + esc(T.chart.caption) + "</p></div></div></div>";
      }
      return '<div class="page-head"><div><h2>培訓中心</h2><p>產品知識、合規用語、銷售話術與團隊專屬資料，新人上手必讀。</p></div></div><div class="tabs">' + tabs.map(function (t) { return '<button data-tr="' + t[0] + '" class="' + (trTab === t[0] ? "active" : "") + '">' + t[1] + "</button>"; }).join("") + "</div>" + body;
    },
    bind: function (el) {
      $$("[data-tr]", el).forEach(function (b) { b.onclick = function () { trTab = b.getAttribute("data-tr"); APP.refresh(); }; });
      APP.loadInternalImages(el);
      $$("[data-cps]", el).forEach(function (b) { b.onclick = function () { APP.copy(U.fill(SCRIPTS[+b.getAttribute("data-cps")].s, APP.tplVars(null)), "話術已複製"); }; });
    }
  };

  /* ====================== 設定 ====================== */
  APP.views.settings = {
    title: "設定", group: "系統",
    render: function (args) {
      var tab = args[0] || "company", db = APP.db(), s = db.settings, admin = APP.can("settings"), dis = admin ? "" : " disabled";
      var tabs = [["company", "公司資訊"], ["prices", "價格表"], ["quote", "報價設定"], ["tiers", "佣金級別"], ["templates", "訊息範本"], ["data", "資料備份"], ["me", "我的帳號"]];
      var body = "";
      if (tab === "company") {
        var c = s.company;
        body = '<div class="card card-b"><div class="fgrid">' + [["name", "品牌名稱"], ["legal", "公司法定名稱"], ["regNo", "公司登記號碼（SSM）"], ["phone", "顯示電話"], ["whatsapp", "WhatsApp 號碼（國際格式，如 60109279131）"], ["email", "電郵"], ["website", "網站"], ["address", "地址"]].map(function (f) { return '<div class="f"><label>' + f[1] + '</label><input class="input" name="' + f[0] + '" value="' + esc(c[f[0]] || "") + '"' + dis + "></div>"; }).join("") +
          '<div class="f full"><label>顧問簽名（智能問答回覆結尾）</label><input class="input" name="signature" value="' + esc(s.signature || "") + '"' + dis + "></div></div>" + (admin ? '<div class="row" style="margin-top:16px"><button class="btn btn-gold" data-save="company">' + icon("check") + "儲存</button></div>" : "") + '<p class="xs muted">首頁（index.html）上的 WhatsApp 號碼與品牌資料來自 data/products.js，若要修改首頁請同步編輯該檔案並重新執行建置。</p></div>';
      } else if (tab === "prices") {
        body = '<div class="card"><div class="card-h"><h3>' + icon("quote") + "產品價格表（" + esc(s.currency) + '）</h3><div class="actions"><label class="small">幣別 <input class="input" name="currency" value="' + esc(s.currency) + '" style="width:80px;display:inline-block"' + dis + '></label></div></div><div class="table-wrap"><table class="tbl"><thead><tr><th>產品</th><th>類別</th><th style="width:180px">單價（留空＝價格待定）</th></tr></thead><tbody>' +
          SB.products().map(function (p) { var v = s.prices[p.id]; return "<tr><td><b>" + esc(p.name) + '</b><div class="xs muted">' + esc(p.format || "") + '</div></td><td class="small">' + esc(p.category) + '</td><td><input class="input" type="number" min="0" step="0.01" data-price="' + p.id + '" value="' + (v == null ? "" : esc(v)) + '" placeholder="價格待定"' + dis + "></td></tr>"; }).join("") + "</tbody></table></div>" + (admin ? '<div class="card-b"><button class="btn btn-gold" data-save="prices">' + icon("check") + "儲存價格</button></div>" : '<div class="card-b xs muted">僅總部 Admin 可修改價格。</div>') + "</div>";
      } else if (tab === "quote") {
        body = '<div class="card card-b"><div class="fgrid"><div class="f"><label>報價單號前綴</label><input class="input" name="quotePrefix" value="' + esc(s.quotePrefix) + '"' + dis + '></div><div class="f"><label>預設有效天數</label><input class="input" type="number" name="quoteValidDays" value="' + esc(s.quoteValidDays) + '"' + dis + '></div><div class="f full"><label>報價條款（列印於報價單底部）</label><textarea class="textarea" name="quoteTerms" rows="6"' + dis + ">" + esc(s.quoteTerms) + "</textarea></div></div>" + (admin ? '<div class="row" style="margin-top:16px"><button class="btn btn-gold" data-save="quote">' + icon("check") + "儲存</button></div>" : "") + "</div>";
      } else if (tab === "tiers") {
        body = '<div class="card"><div class="table-wrap"><table class="tbl"><thead><tr><th>級別名稱</th><th style="width:130px">個人佣金 %</th><th style="width:130px">下線津貼 %</th><th>晉升條件／說明</th></tr></thead><tbody>' +
          s.tiers.map(function (t, i) { return '<tr><td><input class="input" data-tier="' + i + '" data-k="name" value="' + esc(t.name) + '"' + dis + '></td><td><input class="input" type="number" min="0" max="100" step="0.5" data-tier="' + i + '" data-k="rate" value="' + esc(t.rate) + '"' + dis + '></td><td><input class="input" type="number" min="0" max="100" step="0.5" data-tier="' + i + '" data-k="override" value="' + esc(t.override) + '"' + dis + '></td><td><input class="input" data-tier="' + i + '" data-k="target" value="' + esc(t.target || "") + '"' + dis + "></td></tr>"; }).join("") + '</tbody></table></div><div class="card-b">' + (admin ? '<button class="btn btn-gold" data-save="tiers">' + icon("check") + "儲存</button>" : "") + '<p class="xs muted">預設比例為示範數值，請以總部正式制度為準。</p></div></div>';
      } else if (tab === "templates") {
        body = '<div class="stack">' + s.templates.map(function (t, i) { return '<div class="card card-b"><div class="fgrid"><div class="f"><label>範本名稱</label><input class="input" data-tpl="' + i + '" data-k="name" value="' + esc(t.name) + '"' + dis + '></div><div class="f full"><label>內容</label><textarea class="textarea" rows="3" data-tpl="' + i + '" data-k="text"' + dis + ">" + esc(t.text) + "</textarea></div></div>" + (admin ? '<button class="btn btn-ghost btn-sm" data-rmtpl="' + i + '" style="color:var(--red);margin-top:8px">' + icon("trash") + "刪除</button>" : "") + "</div>"; }).join("") +
          '<p class="xs muted">可用變數：{客戶} {顧問} {產品} {方案} {報價單號}</p>' + (admin ? '<div class="row"><button class="btn btn-ghost" data-addtpl>' + icon("plus") + '新增範本</button><button class="btn btn-gold" data-save="templates">' + icon("check") + "儲存全部範本</button></div>" : "") + "</div>";
      } else if (tab === "data" && APP.cloud()) {
        var local = SB.Cloud.readLocalDemo();
        body = '<div class="grid g-2" style="align-items:start"><div class="card card-b stack"><h3 class="h-serif" style="margin:0">雲端資料（Supabase）</h3><p class="small muted" style="margin:0">資料已儲存在 Supabase 雲端資料庫，所有裝置與經銷商即時同步。仍可隨時匯出一份備份。</p><div class="row"><button class="btn btn-gold" data-backup>' + icon("download") + '匯出完整備份（JSON）</button><button class="btn btn-ghost" data-expc>' + icon("download") + '匯出客戶 CSV</button><button class="btn btn-ghost" data-reload>' + icon("arrow") + "重新載入雲端資料</button></div></div>" +
          (admin ? '<div class="card card-b stack" style="border-color:var(--gold-2)"><h3 class="h-serif" style="margin:0">一次性遷移：本機資料 → Supabase</h3><p class="small muted" style="margin:0">把之前在示範模式（此瀏覽器 localStorage）或備份檔中的客戶、評估、報價單、任務、附件推送到雲端。成員依「推薦碼」對應雲端帳號，找不到的歸給您。已存在相同 ID 的資料會略過，可安全重複執行。</p>' +
            '<div class="f"><span class="lbl">資料來源</span><div class="checks"><label class="ck"><input type="radio" name="msrc" value="local" checked><span>此瀏覽器的本機資料' + (local && local.clients ? "（" + local.clients.length + " 位客戶）" : "（無）") + '</span></label><label class="ck"><input type="radio" name="msrc" value="file"><span>上傳備份 JSON 檔</span></label></div><input type="file" id="migFile" accept=".json,application/json" hidden></div>' +
            '<div class="checks"><label class="ck"><input type="checkbox" id="migDemo"><span>包含「示範」資料</span></label><label class="ck"><input type="checkbox" id="migSettings" checked><span>同時套用公司資訊、範本、價格、佣金設定</span></label></div>' +
            '<div class="row"><button class="btn btn-dark" data-migrate>' + icon("upload") + '推送到 Supabase</button></div><div id="migOut" class="small"></div></div>' : '<div class="note-box amber">僅總部 Admin 可執行資料遷移。</div>') + "</div>";
      } else if (tab === "data") {
        var size = 0; try { size = (localStorage.getItem("starbao.db.v1") || "").length; } catch (e) {}
        body = '<div class="grid g-2" style="align-items:start"><div class="card card-b stack"><h3 class="h-serif" style="margin:0">備份與還原</h3><p class="small muted" style="margin:0">所有資料儲存在此瀏覽器的 localStorage。請定期匯出備份，換電腦或清除瀏覽器資料前務必備份。</p><div class="row"><button class="btn btn-gold" data-backup>' + icon("download") + '匯出完整備份（JSON）</button><button class="btn btn-ghost" data-expc>' + icon("download") + "匯出客戶 CSV</button></div>" + (admin ? '<div class="row"><button class="btn btn-ghost" data-restore>' + icon("upload") + '從備份還原</button><input type="file" id="restoreFile" accept=".json,application/json" hidden></div>' : "") +
          '<div class="xs muted">目前使用量約 ' + (size * 2 / 1024 / 1024).toFixed(2) + " MB（瀏覽器上限通常約 5 MB；附件圖片會自動壓縮）</div></div>" +
          (admin ? '<div class="card card-b stack" style="border-color:#F0C9C1"><h3 class="h-serif" style="margin:0;color:var(--red)">重設資料</h3><p class="small muted" style="margin:0">示範完成後，可清除所有示範資料開始正式使用（會保留總部管理員帳號，PIN 8888，請登入後立即修改）。</p><div class="row"><button class="btn btn-ghost" data-reset="demo">重新載入示範資料</button><button class="btn btn-dark" data-reset="clean" style="background:var(--red)">' + icon("trash") + "清空全部資料</button></div></div>" : '<div class="note-box amber">僅總部 Admin 可還原或重設資料。</div>') + "</div>";
      } else {
        var me = APP.me();
        body = '<div class="card card-b" style="max-width:560px"><div class="fgrid"><div class="f"><label>姓名</label><input class="input" name="name" value="' + esc(me.name) + '"></div><div class="f"><label>電話</label><input class="input" name="phone" value="' + esc(me.phone || "") + '"></div>' + (APP.cloud() ? '<div class="f"><label>電郵（登入帳號）</label><input class="input" value="' + esc(me.email || "") + '" disabled></div><div class="f"><label>新密碼（至少 6 字元，留空不變）</label><input class="input" name="password" type="password" autocomplete="new-password"></div>' : '<div class="f"><label>新 PIN（4–6 位數字，留空不變）</label><input class="input" name="pin" inputmode="numeric" maxlength="6"></div>') + '<div class="f"><label>推薦碼</label><input class="input" value="' + esc(me.code) + '" disabled></div></div><div class="row" style="margin-top:16px"><button class="btn btn-gold" data-save="me">' + icon("check") + '儲存</button></div><p class="xs muted">' + (APP.cloud() ? "帳號由 Supabase Auth 管理；角色、上線與推薦碼由總部設定。" : "PIN 為前端示範機制，非真正安全驗證。") + "</p></div>";
      }
      return '<div class="page-head"><div><h2>設定</h2><p>' + (admin ? "管理公司資訊、價格、佣金與訊息範本，並備份資料。" : "部分設定僅總部 Admin 可修改，您目前為唯讀檢視。") + '</p></div></div><div class="tabs">' + tabs.map(function (t) { return '<button data-st="' + t[0] + '" class="' + (tab === t[0] ? "active" : "") + '">' + t[1] + "</button>"; }).join("") + "</div>" + body;
    },
    bind: function (el, args) {
      var tab = args[0] || "company", db = APP.db(), s = db.settings;
      $$("[data-st]", el).forEach(function (b) { b.onclick = function () { APP.go("#/settings/" + b.getAttribute("data-st")); }; });
      var sv = $("[data-save]", el);
      if (sv) sv.onclick = function () {
        var f = APP.formData(el);
        if (tab === "company") { ["name", "legal", "regNo", "phone", "email", "website", "address"].forEach(function (k) { s.company[k] = f[k]; }); s.company.whatsapp = U.normPhone(f.whatsapp); s.signature = f.signature; }
        if (tab === "prices") { s.currency = f.currency || "RM"; $$("[data-price]", el).forEach(function (i) { var v = i.value.trim(); if (v === "") delete s.prices[i.getAttribute("data-price")]; else s.prices[i.getAttribute("data-price")] = Number(v); }); }
        if (tab === "quote") { s.quotePrefix = (f.quotePrefix || "SB").replace(/\s/g, ""); s.quoteValidDays = parseInt(f.quoteValidDays, 10) || 14; s.quoteTerms = f.quoteTerms; }
        if (tab === "tiers") $$("[data-tier]", el).forEach(function (i) { var t = s.tiers[+i.getAttribute("data-tier")], k = i.getAttribute("data-k"); t[k] = k === "rate" || k === "override" ? Number(i.value) || 0 : i.value; });
        if (tab === "templates") $$("[data-tpl]", el).forEach(function (i) { s.templates[+i.getAttribute("data-tpl")][i.getAttribute("data-k")] = i.value; });
        if (tab === "me" && APP.cloud() && f.password) { if (f.password.length < 6) { APP.toast("密碼至少 6 字元", "alert"); return; } SB.Cloud.changePassword(f.password).then(function () { APP.toast("密碼已更新"); }).catch(function (e) { APP.toast(e.message, "alert"); }); }
        if (tab === "me") { var me = APP.me(); if (f.pin && !/^\d{4,6}$/.test(f.pin)) { APP.toast("PIN 需為 4–6 位數字", "alert"); return; } me.name = f.name || me.name; me.phone = U.normPhone(f.phone); if (f.pin) me.pin = f.pin; }
        APP.log("更新設定：" + { company: "公司資訊", prices: "價格表", quote: "報價設定", tiers: "佣金級別", templates: "訊息範本", me: "個人帳號" }[tab], "settings");
        if (APP.save()) { APP.toast("已儲存"); APP.start(); }
      };
      var at = $("[data-addtpl]", el); if (at) at.onclick = function () { s.templates.push({ id: U.uid("tp"), name: "新範本", text: "您好 {客戶}，" }); APP.save(); APP.refresh(); };
      $$("[data-rmtpl]", el).forEach(function (b) { b.onclick = function () { s.templates.splice(+b.getAttribute("data-rmtpl"), 1); APP.save(); APP.refresh(); }; });
      var rl = $("[data-reload]", el); if (rl) rl.onclick = function () { SB.Cloud.reload(); };
      var mg = $("[data-migrate]", el);
      if (mg) {
        var runMig = function (src) {
          var out = $("#migOut", el); out.innerHTML = '<div class="note-box amber">遷移中，請勿關閉頁面⋯（附件較多時需要數分鐘）</div>'; mg.disabled = true;
          SB.Cloud.migrate(src, { includeDemo: $("#migDemo", el).checked, settings: $("#migSettings", el).checked }).then(function (r) {
            mg.disabled = false;
            out.innerHTML = '<div class="note-box green">✓ 遷移完成：客戶 ' + r.clients + "、附件 " + r.attachments + "、評估 " + r.assessments + "、報價單 " + r.quotes + "、任務 " + r.tasks + "、問答 " + r.questions + "。略過：已存在 " + r.skippedExisting + "、示範 " + r.skippedDemo + "。" + (r.unmatched.length ? "<br>⚠️ 以下本機成員找不到相同推薦碼的雲端帳號，其客戶已暫時歸給您：" + esc(r.unmatched.join("、")) + "。邀請他們時可設定相同推薦碼，再到客戶資料重新指派。" : "") + "</div>";
            APP.toast("遷移完成");
          }).catch(function (e) { mg.disabled = false; out.innerHTML = '<div class="note-box red">遷移失敗：' + esc(e.message) + "</div>"; });
        };
        mg.onclick = function () {
          var src = (el.querySelector("input[name=msrc]:checked") || {}).value;
          if (src === "file") { $("#migFile", el).click(); return; }
          runMig(SB.Cloud.readLocalDemo());
        };
        $("#migFile", el).onchange = function (e) { var file = e.target.files[0]; if (!file) return; var fr = new FileReader(); fr.onload = function () { try { runMig(JSON.parse(fr.result)); } catch (err) { APP.toast("檔案格式錯誤：" + err.message, "alert"); } }; fr.readAsText(file); };
      }
      var bk = $("[data-backup]", el); if (bk) bk.onclick = function () { var copy = JSON.parse(JSON.stringify(db)); copy.session = null; U.download("starbao-backup-" + U.today() + ".json", JSON.stringify(copy, null, 1), "application/json"); APP.toast("已匯出備份", "download"); };
      var ec = $("[data-expc]", el); if (ec) ec.onclick = function () {
        var rows = [["姓名", "電話", "狀態", "來源", "負責人", "推薦碼", "備註"]];
        APP.clients().forEach(function (c) { var u = APP.user(c.resellerId); rows.push([c.name, c.phone, c.status, c.source, u ? u.name : "", c.refCode || "", c.notes]); });
        U.download("starbao-clients-" + U.today() + ".csv", U.csv(rows), "text/csv;charset=utf-8");
      };
      var rs = $("[data-restore]", el); if (rs) { rs.onclick = function () { $("#restoreFile", el).click(); }; $("#restoreFile", el).onchange = function (e) {
        var file = e.target.files[0]; if (!file) return; var fr = new FileReader();
        fr.onload = function () { try { var d = JSON.parse(fr.result); if (!d.users || !d.settings) throw new Error("不是有效的星寶備份檔"); var sess = db.session; d.session = sess; localStorage.setItem("starbao.db.v1", JSON.stringify(d)); SB.Store.reload(); if (!APP.me()) { APP.db().session = null; APP.save(); } APP.toast("已還原備份"); APP.start(); } catch (err) { APP.toast("還原失敗：" + err.message, "alert"); } };
        fr.readAsText(file);
      }; }
      $$("[data-reset]", el).forEach(function (b) { b.onclick = function () {
        var demo = b.getAttribute("data-reset") === "demo";
        APP.confirm(demo ? "重新載入示範資料會覆蓋目前所有資料，確定嗎？（建議先匯出備份）" : "清空全部資料（客戶、報價、任務、團隊），僅保留總部管理員帳號。此動作無法復原，確定嗎？", function () {
          var me = APP.me(); SB.Store.reset(demo); var d = APP.db(); d.session = { userId: d.users.some(function (u) { return u.id === me.id; }) ? me.id : "u-admin", at: U.now() }; APP.save(); APP.toast(demo ? "已重新載入示範資料" : "已清空資料"); APP.start();
        }, demo ? "重新載入" : "清空");
      }; });
    }
  };
})();
