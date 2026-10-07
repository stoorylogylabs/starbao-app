/*!
 * Star Bao 核心模組：資料儲存（localStorage）、健康生活評估引擎、智能問答比對、共用工具
 * 首頁（index.html）與系統（app.html）共用，同一網域下共享同一份 localStorage。
 */
(function (root) {
  "use strict";
  var D = root.STARBAO;
  var KEY = "starbao.db.v1";
  var REF_KEY = "starbao.ref";

  /* ============ 工具 ============ */
  var U = {
    uid: function (p) { return (p || "id") + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); },
    now: function () { return new Date().toISOString(); },
    today: function (offset) {
      var d = new Date(); d.setDate(d.getDate() + (offset || 0));
      return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    },
    esc: function (s) {
      return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
      });
    },
    fmtDate: function (iso, withTime) {
      if (!iso) return "—";
      var d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
      if (isNaN(d)) return iso;
      var s = d.getFullYear() + "/" + String(d.getMonth() + 1).padStart(2, "0") + "/" + String(d.getDate()).padStart(2, "0");
      if (withTime) s += " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
      return s;
    },
    ago: function (iso) {
      var diff = (Date.now() - new Date(iso).getTime()) / 1000;
      if (diff < 60) return "剛剛";
      if (diff < 3600) return Math.floor(diff / 60) + " 分鐘前";
      if (diff < 86400) return Math.floor(diff / 3600) + " 小時前";
      if (diff < 86400 * 7) return Math.floor(diff / 86400) + " 天前";
      return U.fmtDate(iso);
    },
    /** 馬來西亞手機號碼 → 國際格式（010-9279131 → 60109279131） */
    normPhone: function (p) {
      var s = String(p || "").replace(/[^\d+]/g, "");
      if (!s) return "";
      if (s.charAt(0) === "+") s = s.slice(1);
      if (s.indexOf("00") === 0) s = s.slice(2);
      if (s.charAt(0) === "0") s = "60" + s.slice(1);
      else if (s.indexOf("60") !== 0 && s.length <= 10) s = "60" + s;
      return s;
    },
    wa: function (phone, text) {
      var n = U.normPhone(phone);
      return "https://wa.me/" + (n || "") + (text ? "?text=" + encodeURIComponent(text) : "");
    },
    sms: function (phone, text) {
      var n = U.normPhone(phone);
      return "sms:" + (n ? "+" + n : "") + (text ? "?&body=" + encodeURIComponent(text) : "");
    },
    money: function (v, cur) {
      if (v == null || v === "" || isNaN(v)) return "價格待定";
      return (cur || "RM") + " " + Number(v).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },
    fill: function (tpl, vars) {
      return String(tpl || "").replace(/\{(.+?)\}/g, function (m, k) { return vars && vars[k] != null && vars[k] !== "" ? vars[k] : m; });
    },
    download: function (filename, content, type) {
      var blob = content instanceof Blob ? content : new Blob([content], { type: type || "text/plain;charset=utf-8" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = filename;
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    },
    copy: function (text) {
      if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
      var t = document.createElement("textarea"); t.value = text; t.style.position = "fixed"; t.style.opacity = "0";
      document.body.appendChild(t); t.select();
      try { document.execCommand("copy"); } catch (e) {}
      t.remove(); return Promise.resolve();
    },
    csv: function (rows) {
      return "\ufeff" + rows.map(function (r) {
        return r.map(function (c) { c = c == null ? "" : String(c); return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(",");
      }).join("\n");
    },
    parseCSV: function (text) {
      var rows = [], row = [], cur = "", q = false;
      text = text.replace(/^\ufeff/, "");
      for (var i = 0; i < text.length; i++) {
        var ch = text[i];
        if (q) {
          if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
          else if (ch === '"') q = false;
          else cur += ch;
        } else if (ch === '"') q = true;
        else if (ch === ",") { row.push(cur); cur = ""; }
        else if (ch === "\n" || ch === "\r") {
          if (ch === "\r" && text[i + 1] === "\n") i++;
          row.push(cur); rows.push(row); row = []; cur = "";
        } else cur += ch;
      }
      if (cur || row.length) { row.push(cur); rows.push(row); }
      return rows.filter(function (r) { return r.some(function (c) { return c.trim(); }); });
    }
  };

  /* ============ 圖示（線條 SVG） ============ */
  var P = {
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    catalog: '<path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/><path d="M8 7h6M8 11h6"/>',
    pulse: '<path d="M3 12h4l2-6 4 12 2-6h6"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M8.5 11h.01M12 11h.01M15.5 11h.01"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17.5" cy="9" r="2.5"/><path d="M16 14.5a5 5 0 0 1 6 5"/>',
    quote: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/><path d="M9 12h7M9 16h5"/>',
    tasks: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/><path d="m8.5 14.5 2 2 4-4"/>',
    team: '<path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z"/>',
    training: '<path d="M2 8l10-5 10 5-10 5z"/><path d="M6 10v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/><path d="M22 8v6"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    whatsapp: '<path d="M20.5 3.5A11 11 0 0 0 3.2 16.9L2 22l5.3-1.4A11 11 0 0 0 20.5 3.5zM12 20.2a9 9 0 0 1-4.6-1.3l-.3-.2-3.1.8.8-3-.2-.3A9.1 9.1 0 1 1 12 20.2zm5-6.8c-.3-.1-1.6-.8-1.9-.9-.3-.1-.4-.1-.6.1l-.9 1.1c-.2.2-.3.2-.6.1a7.4 7.4 0 0 1-3.7-3.2c-.3-.5.3-.5.8-1.6.1-.2 0-.3 0-.5l-.9-2c-.2-.5-.5-.5-.6-.5h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.4.8 3.2.7.5-.1 1.6-.7 1.9-1.3.2-.6.2-1.2.2-1.3-.1-.1-.3-.2-.6-.3z" fill="currentColor" stroke="none"/>',
    sms: '<rect x="3" y="5" width="18" height="13" rx="2"/><path d="m3 7 9 6 9-6"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
    print: '<path d="M6 9V2h12v7"/><rect x="2" y="9" width="20" height="9" rx="2"/><path d="M6 14h12v8H6z"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5M12 3v12"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
    alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    back: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
    star: '<path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z"/>',
    patent: '<circle cx="12" cy="9" r="6"/><path d="M8.5 13.5 7 22l5-3 5 3-1.5-8.5"/>',
    leaf: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10z"/><path d="M2 21c0-3 1.9-5.4 5.1-6"/>',
    // 解決方案圖示
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    gauge: '<path d="M12 14l4-4"/><path d="M3.3 19a10 10 0 1 1 17.4 0z"/>',
    gut: '<path d="M8 3v3a3 3 0 0 0 3 3h3a3 3 0 0 1 0 6h-4a3 3 0 0 0 0 6h6"/><path d="M16 3v2"/>',
    drop: '<path d="M12 2.7 6.3 8.4a8 8 0 1 0 11.4 0z"/><path d="M9 14a3 3 0 0 0 3 3"/>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21.2l8.8-8.8a5.5 5.5 0 0 0 0-7.8z"/><path d="M3 12h4l2-3 3 6 2-3h7"/>',
    sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/>',
    wave: '<path d="M2 12c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M2 17c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M12 2.5 9 6.5a3.5 3.5 0 1 0 6 0z"/>',
    yin: '<circle cx="12" cy="12" r="9"/><path d="M12 3a4.5 4.5 0 0 1 0 9 4.5 4.5 0 0 0 0 9"/><circle cx="12" cy="7.5" r=".8"/><circle cx="12" cy="16.5" r=".8"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    flower: '<circle cx="12" cy="12" r="2.5"/><path d="M12 9.5C12 6 13.5 3 12 3s0 3 0 6.5zM14.5 12c3.5 0 6.5 1.5 6.5 0s-3 0-6.5 0zM12 14.5c0 3.5-1.5 6.5 0 6.5s0-3 0-6.5zM9.5 12C6 12 3 13.5 3 12s3 0 6.5 0z"/>'
  };
  function icon(name, cls) {
    return '<svg class="ico ' + (cls || "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[name] || P.star) + "</svg>";
  }

  /* ============ 健康生活評估規則 ============ */
  var RULES = {
    groups: [
      { id: "sleep", title: "睡眠", items: [
        { id: "s_hard", label: "不好入睡、輾轉反側", w: { sleep: 3 }, kw: ["失眠", "睡不著", "難入睡", "不好睡", "睡不好", "入睡困難", "輾轉"] },
        { id: "s_light", label: "淺眠、半夜易醒", w: { sleep: 3 }, kw: ["淺眠", "易醒", "半夜醒", "睡不深", "早醒"] },
        { id: "s_tired", label: "睡醒仍然疲倦", w: { sleep: 2, energy: 1 }, kw: ["睡醒累", "睡不飽", "起床累", "睡很久還累"] },
        { id: "s_late", label: "經常熬夜／作息不規律", w: { sleep: 1, antioxidant: 1, circulation: 1 }, kw: ["熬夜", "夜班", "輪班", "晚睡", "作息不規律"] }
      ]},
      { id: "stress", title: "壓力・情緒", items: [
        { id: "m_stress", label: "壓力大、精神緊繃", w: { sleep: 2, energy: 1 }, kw: ["壓力", "緊繃", "焦慮", "煩躁"] },
        { id: "m_mood", label: "情緒起伏、容易煩躁", w: { sleep: 1, gender: 1 }, kw: ["情緒", "心情差", "脾氣"] }
      ]},
      { id: "energy", title: "精神・體力", items: [
        { id: "e_tired", label: "容易疲倦、提不起勁", w: { energy: 3, antioxidant: 1 }, kw: ["累", "疲倦", "疲勞", "沒精神", "沒力", "無力", "提不起勁", "精神差"] },
        { id: "e_focus", label: "精神不集中", w: { energy: 2, sleep: 1 }, kw: ["不集中", "專注", "記性差", "恍神"] },
        { id: "e_cold", label: "手腳冰冷、怕冷", w: { energy: 3, circulation: 1 }, kw: ["手腳冰冷", "手腳冷", "怕冷", "體寒", "寒性"] },
        { id: "e_pale", label: "氣色差、臉色暗沉", w: { energy: 2, gender: 1, skin: 1 }, kw: ["氣色", "臉色差", "蒼白"] }
      ]},
      { id: "gut", title: "腸胃・消化", items: [
        { id: "g_const", label: "排便不順、不夠順暢", w: { gut: 3 }, kw: ["便秘", "排便不順", "大便", "不順暢", "幾天才上", "排便"] },
        { id: "g_bloat", label: "脹氣、消化慢", w: { gut: 2 }, kw: ["脹氣", "肚子脹", "消化不良", "消化慢", "胃脹"] },
        { id: "g_out", label: "經常外食、應酬", w: { gut: 1, metabolic: 1, antioxidant: 1 }, kw: ["外食", "應酬", "吃大餐", "聚餐"] }
      ]},
      { id: "weight", title: "體重・體態", items: [
        { id: "w_gain", label: "體重增加、腰圍變粗", w: { metabolic: 3 }, kw: ["胖", "減肥", "瘦身", "體重", "腰圍", "小腹", "肚子大", "體態"] },
        { id: "w_crave", label: "容易嘴饞、食量大", w: { metabolic: 2, sugar: 1 }, kw: ["嘴饞", "食量大", "一直想吃", "宵夜", "零食"] },
        { id: "w_slow", label: "感覺代謝變慢", w: { metabolic: 2 }, kw: ["代謝", "代謝慢", "易胖"] }
      ]},
      { id: "sugar", title: "糖代謝習慣", items: [
        { id: "b_sweet", label: "愛吃甜食、每天喝含糖飲料", w: { sugar: 3, metabolic: 1 }, kw: ["甜食", "含糖", "奶茶", "愛吃甜", "甜點", "汽水"] },
        { id: "b_carb", label: "精緻澱粉吃得多（白飯、麵包、麵）", w: { sugar: 2, metabolic: 1 }, kw: ["澱粉", "白飯", "麵包", "麵食"] },
        { id: "b_sleepy", label: "飯後容易昏沉想睡", w: { sugar: 2, gut: 1, energy: 1 }, kw: ["飯後想睡", "飯後昏沉", "餐後疲倦", "飯後很睏"] },
        { id: "b_family", label: "家人有糖代謝相關困擾", w: { sugar: 2 }, kw: ["血糖", "糖尿", "家族"] }
      ]},
      { id: "water", title: "水分・浮腫", items: [
        { id: "x_face", label: "早上臉腫、眼皮浮腫", w: { water: 3 }, kw: ["臉腫", "浮腫", "眼腫", "水腫"] },
        { id: "x_leg", label: "下午小腿腫脹、腿沉重", w: { water: 3, circulation: 1 }, kw: ["腳腫", "腿腫", "小腿", "腿沉", "腳踝腫"] },
        { id: "x_salt", label: "口味重、愛吃鹹", w: { water: 2, circulation: 1 }, kw: ["重口味", "鹹", "高鈉", "泡麵"] }
      ]},
      { id: "circ", title: "循環", items: [
        { id: "c_sit", label: "久坐或久站、少運動", w: { circulation: 2, water: 1, metabolic: 1 }, kw: ["久坐", "久站", "少運動", "不運動", "辦公室"] },
        { id: "c_oil", label: "飲食偏油膩", w: { circulation: 2, metabolic: 1 }, kw: ["油膩", "炸物", "肥肉", "膽固醇", "血脂"] },
        { id: "c_stiff", label: "肩頸僵硬、循環不好", w: { circulation: 2, energy: 1 }, kw: ["肩頸", "僵硬", "循環", "血液循環", "麻"] }
      ]},
      { id: "skin", title: "肌膚・外觀", items: [
        { id: "k_dull", label: "暗沉、膚色不均", w: { skin: 2, antioxidant: 1 }, kw: ["暗沉", "膚色", "斑", "黑眼圈"] },
        { id: "k_dry", label: "乾燥、細紋、鬆弛", w: { skin: 2, antioxidant: 2 }, kw: ["皺紋", "細紋", "乾燥", "鬆弛", "老化", "抗老", "逆齡"] },
        { id: "k_ox", label: "常曝曬／抽菸／空污環境", w: { antioxidant: 2 }, kw: ["抽菸", "曝曬", "日曬", "空污", "自由基", "抗氧化"] }
      ]},
      { id: "gender", title: "兩性體質", items: [
        { id: "f_period", label: "女性：生理期不適", w: { gender: 3 }, kw: ["經痛", "生理期", "月經", "經期", "大姨媽"] },
        { id: "f_meno", label: "女性：更年期前後不適", w: { gender: 2, sleep: 1 }, kw: ["更年期", "潮熱", "潮紅"] },
        { id: "m_vital", label: "男性：活力、狀態下降", w: { gender: 3, energy: 1 }, kw: ["男性活力", "體力下降"] }
      ]}
    ],
    lifestyle: [
      { id: "sleepHours", label: "平均每晚睡眠", options: [
        { v: "lt5", label: "少於 5 小時", w: { sleep: 3, energy: 1 } }, { v: "5to6", label: "5–6 小時", w: { sleep: 2 } },
        { v: "7to8", label: "7–8 小時", w: {} }, { v: "gt8", label: "多於 8 小時仍累", w: { energy: 1 } }] },
      { id: "exercise", label: "每週運動", options: [
        { v: "none", label: "幾乎不運動", w: { metabolic: 1, circulation: 2 } }, { v: "1to2", label: "1–2 次", w: { circulation: 1 } },
        { v: "3plus", label: "3 次以上", w: {} }] },
      { id: "water", label: "每天喝水量", options: [
        { v: "lt1", label: "少於 1 公升", w: { gut: 1, water: 1 } }, { v: "1to2", label: "1–2 公升", w: {} }, { v: "gt2", label: "2 公升以上", w: {} }] },
      { id: "eatout", label: "外食頻率", options: [
        { v: "most", label: "幾乎每餐外食", w: { gut: 1, metabolic: 1, antioxidant: 1, sugar: 1 } }, { v: "daily", label: "一天一餐", w: { gut: 1 } },
        { v: "rare", label: "很少外食", w: {} }] },
      { id: "sugary", label: "含糖飲料", options: [
        { v: "daily", label: "幾乎每天", w: { sugar: 3, metabolic: 1 } }, { v: "weekly", label: "每週幾次", w: { sugar: 1 } }, { v: "rare", label: "很少喝", w: {} }] },
      { id: "stress", label: "壓力指數", options: [
        { v: "1", label: "1 很輕鬆", w: {} }, { v: "2", label: "2", w: {} }, { v: "3", label: "3", w: { sleep: 1 } },
        { v: "4", label: "4", w: { sleep: 2, energy: 1 } }, { v: "5", label: "5 非常大", w: { sleep: 3, energy: 1 } }] }
    ],
    redFlags: [
      { id: "rf_chest", label: "胸痛、胸口壓迫感", kw: ["胸痛", "胸口痛", "胸悶痛", "心絞痛", "胸口壓迫"] },
      { id: "rf_urine", label: "小便有血（血尿）", kw: ["血尿", "尿血", "小便有血", "尿有血"] },
      { id: "rf_weight", label: "不明原因體重快速下降", kw: ["暴瘦", "體重驟降", "突然瘦", "莫名變瘦", "不明原因瘦", "體重一直掉"] },
      { id: "rf_breath", label: "呼吸困難、喘不過氣", kw: ["呼吸困難", "喘不過氣", "呼吸急促"] },
      { id: "rf_stroke", label: "突發劇烈頭痛、單側無力或口齒不清", kw: ["中風", "半邊無力", "單側無力", "口齒不清", "劇烈頭痛", "嘴歪"] },
      { id: "rf_blood", label: "黑便、便血或吐血", kw: ["便血", "黑便", "吐血", "血便", "大便有血"] },
      { id: "rf_faint", label: "昏厥、意識不清", kw: ["昏倒", "暈倒", "昏厥", "意識不清"] },
      { id: "rf_fever", label: "持續高燒不退", kw: ["高燒", "發燒不退", "燒不退"] },
      { id: "rf_swell", label: "單腳突然紅腫疼痛，或水腫合併呼吸急促", kw: ["單腳腫", "突然腫痛"] },
      { id: "rf_preg", label: "懷孕期間出血或劇烈腹痛", kw: ["懷孕出血", "孕期出血"] },
      { id: "rf_self", label: "有傷害自己的念頭", kw: ["自殺", "輕生", "不想活", "傷害自己"] }
    ],
    cautions: [
      { id: "ct_preg", label: "懷孕、備孕或哺乳中", kw: ["懷孕", "孕婦", "備孕", "哺乳", "餵奶"] },
      { id: "ct_med", label: "正在長期服用藥物", kw: ["吃藥", "服藥", "藥物", "西藥"] },
      { id: "ct_kidney", label: "有腎臟相關疾病（如慢性腎病、洗腎）", kw: ["腎", "洗腎", "透析", "腎病", "腎功能"] },
      { id: "ct_liver", label: "有肝臟相關疾病", kw: ["肝病", "肝炎", "肝功能", "脂肪肝", "肝指數"] },
      { id: "ct_chronic", label: "已確診糖尿病、高血壓或心臟病", kw: ["糖尿病", "高血壓", "心臟病", "三高"] },
      { id: "ct_minor", label: "未滿 18 歲", kw: [] }
    ],
    tips: {
      sleep: ["固定上床與起床時間，假日也盡量一致", "睡前 1 小時放下手機與螢幕", "下午 3 點後避免咖啡、濃茶"],
      metabolic: ["每餐先吃蔬菜與蛋白質，再吃澱粉", "每週累積 150 分鐘中等強度運動", "晚餐七分飽，避免宵夜"],
      gut: ["每天 5 份蔬果，補充膳食纖維", "每日飲水約 30ml × 體重(kg)", "養成固定排便時間"],
      sugar: ["含糖飲料改為無糖茶或白開水", "白飯、白麵包換成糙米、全穀", "飯後散步 10–15 分鐘", "定期做健康檢查，留意血糖數值"],
      circulation: ["每坐 1 小時起身活動 3–5 分鐘", "少油、少鹽、少加工食品", "每天快走或伸展 20 分鐘"],
      antioxidant: ["多吃深色、多彩蔬果", "外出做好防曬，避免吸菸與二手菸", "保持充足睡眠，減少熬夜"],
      water: ["減少高鈉食物（泡麵、加工肉品、醃漬物）", "睡前可抬腿 10–15 分鐘", "適量飲水，不要因怕腫而不喝水"],
      gender: ["經期注意保暖、避免冰冷飲食", "規律作息、適度運動", "如生理期長期不規律，請諮詢婦產科醫師"],
      energy: ["吃好早餐，補充優質蛋白質", "每天曬太陽 15 分鐘", "以溫和運動（快走、瑜伽）提升體力"],
      skin: ["早晚保濕、白天確實防曬", "充足睡眠是最好的保養", "多喝水、多吃蔬果"]
    }
  };

  function solById(id) { return (D.solutions || []).filter(function (s) { return s.id === id; })[0]; }
  function prodById(id) { return (D.products || []).filter(function (p) { return p.id === id; })[0]; }

  function allSymptoms() {
    var out = [];
    RULES.groups.forEach(function (g) { g.items.forEach(function (it) { out.push(Object.assign({ group: g.title }, it)); }); });
    return out;
  }

  function scanText(text) {
    var t = String(text || "").replace(/\s+/g, "");
    var res = { symptoms: [], redFlags: [], cautions: [], hits: [] };
    if (!t) return res;
    allSymptoms().forEach(function (s) {
      s.kw.forEach(function (k) { if (t.indexOf(k) > -1 && res.symptoms.indexOf(s.id) < 0) { res.symptoms.push(s.id); res.hits.push(k); } });
    });
    RULES.redFlags.forEach(function (r) { r.kw.forEach(function (k) { if (t.indexOf(k) > -1 && res.redFlags.indexOf(r.id) < 0) { res.redFlags.push(r.id); res.hits.push(k); } }); });
    RULES.cautions.forEach(function (c) { c.kw.forEach(function (k) { if (t.indexOf(k) > -1 && res.cautions.indexOf(c.id) < 0) { res.cautions.push(c.id); res.hits.push(k); } }); });
    return res;
  }

  /**
   * 健康生活評估
   * @param {object} input { symptoms:[id], lifestyle:{id:v}, redFlags:[id], cautions:[id], text:"", gender:"F|M" }
   */
  function assess(input) {
    input = input || {};
    var scan = scanText(input.text);
    var symptoms = uniq((input.symptoms || []).concat(scan.symptoms));
    var redFlags = uniq((input.redFlags || []).concat(scan.redFlags));
    var cautions = uniq((input.cautions || []).concat(scan.cautions));
    var scores = {}, why = {};
    (D.solutions || []).forEach(function (s) { scores[s.id] = 0; why[s.id] = []; });
    var symMap = {}; allSymptoms().forEach(function (s) { symMap[s.id] = s; });
    symptoms.forEach(function (id) {
      var s = symMap[id]; if (!s) return;
      Object.keys(s.w).forEach(function (k) { scores[k] += s.w[k]; if (s.w[k] >= 1) why[k].push(s.label); });
    });
    var ls = input.lifestyle || {};
    RULES.lifestyle.forEach(function (q) {
      var v = ls[q.id]; if (!v) return;
      var opt = q.options.filter(function (o) { return o.v === v; })[0]; if (!opt) return;
      Object.keys(opt.w).forEach(function (k) { scores[k] += opt.w[k]; if (opt.w[k] >= 1) why[k].push(q.label + "：" + opt.label); });
    });
    // gender-specific: male shouldn't get female-only reasons, fine either way
    var ranked = Object.keys(scores).map(function (k) {
      return { id: k, name: (solById(k) || {}).name, raw: scores[k], pct: Math.min(100, Math.round(scores[k] / 9 * 100)), reasons: uniq(why[k]) };
    }).sort(function (a, b) { return b.raw - a.raw; });
    var focus = ranked.filter(function (r) { return r.raw >= 3; });
    if (!focus.length) focus = ranked.filter(function (r) { return r.raw > 0; }).slice(0, 2);

    var products = [];
    if (!redFlags.length) {
      products = (D.products || []).filter(function (p) { return p.line === "supplement"; }).map(function (p) {
        var sc = 0, rs = [];
        (p.solutions.primary || []).forEach(function (s) { sc += scores[s] * 1; if (scores[s] >= 2) rs.push("對應您關注的【" + solById(s).name + "】"); });
        (p.solutions.secondary || []).forEach(function (s) { sc += scores[s] * 0.35; if (scores[s] >= 3) rs.push("同時照顧【" + solById(s).name + "】"); });
        return { id: p.id, name: p.name, score: Math.round(sc * 10) / 10, reasons: rs };
      }).filter(function (x) { return x.score >= 2.5 && x.reasons.length; }).sort(function (a, b) { return b.score - a.score; });
      // 同系列（SVB）只保留前兩名，避免推薦清單重複
      var svb = 0; products = products.filter(function (x) { if (x.id.indexOf("svb-") === 0) { svb++; return svb <= 2; } return true; });
      // 先確保每個優先方向（前 3 名）至少有一款主打產品，再依分數補足
      var picked = [];
      focus.slice(0, 3).forEach(function (f) {
        var best = products.filter(function (x) { return picked.indexOf(x) < 0 && (prodById(x.id).solutions.primary || []).indexOf(f.id) > -1; })[0];
        if (best) picked.push(best);
      });
      products.forEach(function (x) { if (picked.length < 4 && picked.indexOf(x) < 0) picked.push(x); });
      products = picked.slice(0, 4);
      var skinSc = scores.skin || 0;
      if (skinSc >= 3) {
        ["skin-moist-serum", "skin-antiaging-serum"].forEach(function (id) {
          var p = prodById(id); if (p) products.push({ id: id, name: p.name, score: skinSc, reasons: ["外在保養：搭配【肌膚保養】"] });
        });
      }
    }
    var tips = [];
    focus.slice(0, 3).forEach(function (f) { (RULES.tips[f.id] || []).forEach(function (t) { tips.push(t); }); });
    return {
      at: U.now(),
      symptoms: symptoms, redFlags: redFlags, cautions: cautions, lifestyle: ls, text: input.text || "",
      scores: scores, ranked: ranked, focus: focus.map(function (f) { return f.id; }),
      products: products, tips: tips.slice(0, 8),
      redFlagLabels: redFlags.map(function (id) { return (RULES.redFlags.filter(function (r) { return r.id === id; })[0] || {}).label; }),
      cautionLabels: cautions.map(function (id) { return (RULES.cautions.filter(function (r) { return r.id === id; })[0] || {}).label; })
    };
  }

  function uniq(a) { return a.filter(function (x, i) { return x && a.indexOf(x) === i; }); }

  /* ============ 智能問答 ============ */
  var TOPICS = [
    { id: "price", kw: ["價格", "多少錢", "價錢", "幾錢", "優惠", "折扣", "配套", "price"] },
    { id: "usage", kw: ["怎麼吃", "怎麼喝", "怎麼用", "用法", "吃法", "幾包", "幾粒", "什麼時候吃", "空腹"] },
    { id: "drug", kw: ["吃藥", "服藥", "藥物", "一起吃", "西藥", "降血壓藥", "降糖藥"] },
    { id: "kidney", kw: ["腎", "洗腎", "透析", "尿蛋白", "腎功能"] },
    { id: "diabetes", kw: ["糖尿病", "降血糖", "血糖高", "胰島素"] },
    { id: "pregnant", kw: ["懷孕", "孕婦", "哺乳", "備孕", "餵奶"] },
    { id: "join", kw: ["代理", "經銷", "加盟", "加入團隊", "創業", "兼職", "賺錢"] },
    { id: "diet_halal", kw: ["清真", "halal", "素食", "吃素"] },
    { id: "effect", kw: ["多久見效", "有效嗎", "多久有感", "保證"] }
  ];

  function answer(question, opts) {
    opts = opts || {};
    var q = String(question || "");
    var t = q.replace(/\s+/g, "").toLowerCase();
    var res = assess({ text: q });
    var topics = TOPICS.filter(function (tp) { return tp.kw.some(function (k) { return t.indexOf(k.toLowerCase()) > -1; }); }).map(function (x) { return x.id; });
    // 直接提到產品
    var named = (D.products || []).filter(function (p) {
      return [p.name].concat(p.nameAlt || [], p.searchAlt || [], p.packagingName ? [p.packagingName] : []).some(function (n) {
        var k = String(n).replace(/\s+/g, "").toLowerCase();
        return k.length >= 2 && t.indexOf(k) > -1 && !(k === "svb" && false);
      });
    }).map(function (p) { return p.id; });
    var ingredientHits = [];
    (D.products || []).forEach(function (p) {
      (p.ingredients || []).forEach(function (ing) {
        var nm = ing.name.replace(/（.*?）|\(.*?\)/g, "").replace(/專利|萃取物?|\s/g, "");
        if (nm.length >= 2 && t.indexOf(nm.toLowerCase()) > -1) { ingredientHits.push(nm); if (named.indexOf(p.id) < 0) named.push(p.id); }
      });
    });
    var recs = [];
    named.forEach(function (id) { var p = prodById(id); if (p) recs.push({ id: id, name: p.name, reasons: ["您直接詢問到此產品／成分"] }); });
    res.products.forEach(function (r) { if (!recs.some(function (x) { return x.id === r.id; })) recs.push(r); });
    if (res.redFlags.length) recs = [];
    recs = recs.slice(0, 3);
    return {
      question: q, topics: topics, scan: res, products: recs, ingredientHits: uniq(ingredientHits),
      reply: buildReply(q, res, recs, topics, opts)
    };
  }

  function buildReply(q, res, recs, topics, opts) {
    var name = opts.clientName ? opts.clientName : "";
    var sign = opts.signature || "星寶 Star Bao 健康顧問";
    var L = [];
    L.push("您好" + (name ? " " + name : "") + "！謝謝您的詢問 🙏");
    if (res.redFlags.length) {
      L.push("");
      L.push("您提到的「" + res.redFlagLabels.join("、") + "」，這類狀況需要醫療專業人員評估，請盡快就醫 🏥，先不要以營養補充食品代替就醫。");
      if (res.redFlags.indexOf("rf_self") > -1) L.push("如果您現在感到非常難受，請立即撥打 999，或聯絡 Befrienders 情緒支援熱線 03-7627 2929，您不是一個人。");
      L.push("等醫師評估後，如需日常營養調理建議，我很樂意再為您說明。");
      L.push(""); L.push("— " + sign);
      return L.join("\n");
    }
    if (topics.indexOf("join") > -1) {
      L.push(""); L.push("很高興您對加入星寶團隊有興趣！我們提供完整的產品培訓、合規話術與專屬推薦連結，歡迎約個時間，我為您介紹經銷商／代理方案與佣金制度 😊");
    }
    if (recs.length) {
      var focusNames = res.focus.slice(0, 2).map(function (id) { return (solById(id) || {}).name; }).filter(Boolean);
      L.push("");
      if (focusNames.length) L.push("根據您提到的狀況，建議可以從【" + focusNames.join("】與【") + "】方向開始調理：");
      else L.push("為您整理相關的產品資訊：");
      recs.forEach(function (r) {
        var p = prodById(r.id); if (!p) return;
        L.push("");
        L.push("✅ " + p.name + "｜" + p.tagline);
        L.push("　" + p.benefits.slice(0, 3).join("、"));
      });
    } else if (topics.indexOf("join") < 0 && topics.indexOf("price") < 0) {
      L.push(""); L.push("想更準確地為您建議，方便告訴我：您最近的睡眠、精神、腸胃、體重或飲食習慣，哪一方面最困擾您呢？我也可以為您做一份 3 分鐘的免費健康生活評估。");
    }
    if (topics.indexOf("price") > -1) { L.push(""); L.push("價格與優惠配套我整理成報價單給您，請稍等，或告訴我您想了解的產品與數量 😊"); }
    if (topics.indexOf("usage") > -1 && recs[0]) { var pu = prodById(recs[0].id); L.push(""); L.push("📌 食用方式：" + pu.usage); }
    if (topics.indexOf("effect") > -1) { L.push(""); L.push("每個人體質不同，實際感受因人而異。建議規律使用並搭配均衡飲食與作息，我們也會定期關心您的狀況。"); }
    if (topics.indexOf("diet_halal") > -1) { L.push(""); L.push("關於清真／素食資訊，我向公司確認後再回覆您，以免給您不正確的資料。"); } // blocklist-ok：內部問答回覆，未宣稱任何認證
    var cautionLines = [];
    if (topics.indexOf("drug") > -1 || res.cautions.indexOf("ct_med") > -1) cautionLines.push("如您正在服用藥物，是否適合同時食用，請先詢問您的醫師或藥劑師，請勿自行停藥。");
    if (topics.indexOf("kidney") > -1 || res.cautions.indexOf("ct_kidney") > -1) cautionLines.push("腎臟相關狀況請以腎臟科醫師的評估為準；營養補充食品不能取代治療，食用前請先諮詢醫師。");
    if (topics.indexOf("diabetes") > -1 || res.cautions.indexOf("ct_chronic") > -1) cautionLines.push("我們的產品是營養補充食品，不能治療或控制疾病。已確診或正在用藥者，請持續遵照醫囑，並在食用前先諮詢醫師。");
    if (topics.indexOf("pregnant") > -1 || res.cautions.indexOf("ct_preg") > -1) cautionLines.push("懷孕、備孕或哺乳期間，請先諮詢醫師後再食用任何營養補充食品。");
    if (res.cautions.indexOf("ct_liver") > -1) cautionLines.push("肝臟相關狀況請先諮詢醫師後再食用。");
    if (cautionLines.length) { L.push(""); cautionLines.forEach(function (c) { L.push("⚠️ " + c); }); }
    L.push("");
    L.push("※ " + D.disclaimers.supplement);
    L.push("有任何問題隨時回覆我哦～");
    L.push("— " + sign);
    return L.join("\n");
  }

  /* ============ 資料儲存 ============ */
  function defaultSettings() {
    return {
      company: { name: "星寶 Star Bao", legal: "", phone: "010-927 9131", whatsapp: "60109279131", email: "", address: "馬來西亞", website: "", regNo: "" },
      currency: "RM",
      prices: {},               // { productId: number }  未填 = 價格待定
      quotePrefix: "SB",
      quoteValidDays: 14,
      quoteTerms: "1. 本報價單之價格以總部最新公告為準，目前部分價格待定。\n2. 本產品為營養補充食品，非藥物，實際感受因人而異。\n3. 如有懷孕、服藥或慢性疾病（包括腎臟、肝臟疾病），請先諮詢醫師後食用。",
      signature: "星寶 Star Bao 健康顧問",
      tiers: [
        { id: "agent", name: "代理 Agent", role: "agent", rate: 10, override: 0, target: "入門級（示範）" },
        { id: "reseller", name: "經銷商 Reseller", role: "reseller", rate: 20, override: 3, target: "累積成交 10 單（示範）" },
        { id: "manager", name: "經理 Manager", role: "manager", rate: 25, override: 5, target: "團隊 5 人以上（示範）" },
        { id: "admin", name: "總部 HQ", role: "admin", rate: 0, override: 0, target: "—" }
      ],
      templates: [
        { id: "t1", name: "首次問候", text: "您好 {客戶}，我是星寶 Star Bao 的 {顧問} 😊 謝謝您對我們的關注！想多了解您目前最在意的身體狀況（睡眠／代謝／腸胃⋯），我可以為您做一份免費的 3 分鐘健康生活評估。" },
        { id: "t2", name: "評估結果跟進", text: "{客戶} 您好，您的健康生活評估結果整理好了：建議優先關注【{方案}】。我為您準備了合適的調理建議，方便的時候跟您說明一下嗎？\n※ 評估結果僅供參考，不構成醫療建議。" },
        { id: "t3", name: "報價單跟進", text: "{客戶} 您好，之前發給您的報價單 {報價單號} 不知道您看過了嗎？有任何問題都可以問我哦～" },
        { id: "t4", name: "使用一週回訪", text: "{客戶} 您好～開始使用 {產品} 一週了，最近睡眠／精神／排便狀況有沒有不一樣？記得搭配均衡飲食、多喝水哦！有任何感受都可以跟我分享 🙏" },
        { id: "t5", name: "回購提醒", text: "{客戶} 您好，您的 {產品} 應該快用完了，需要幫您先預留一份嗎？規律使用，感受會更穩定哦。" },
        { id: "t6", name: "節日問候", text: "{客戶} 節日快樂！🎉 感謝您一直以來的支持，祝您和家人身體健康、平安喜樂。— {顧問}" }
      ]
    };
  }

  function seed() {
    var t = U.today, now = Date.now();
    function ago(d, h) { return new Date(now - (d * 86400 + (h || 0) * 3600) * 1000).toISOString(); }
    var users = [
      { id: "u-admin", name: "總部管理員", role: "admin", tier: "admin", code: "HQ", phone: "60109279131", pin: "8888", parentId: null, joinedAt: ago(200), demo: true },
      { id: "u-mgr1", name: "林雅婷（示範）", role: "manager", tier: "manager", code: "YT01", phone: "60123456701", pin: "1111", parentId: "u-admin", joinedAt: ago(150), demo: true },
      { id: "u-res1", name: "陳美玲（示範）", role: "reseller", tier: "reseller", code: "MEI88", phone: "60123456702", pin: "2222", parentId: "u-mgr1", joinedAt: ago(120), demo: true },
      { id: "u-res2", name: "黃志明（示範）", role: "reseller", tier: "reseller", code: "ZM66", phone: "60123456703", pin: "2223", parentId: "u-mgr1", joinedAt: ago(90), demo: true },
      { id: "u-agt1", name: "李小華（示範）", role: "agent", tier: "agent", code: "HUA01", phone: "60123456704", pin: "3333", parentId: "u-res1", joinedAt: ago(60), demo: true },
      { id: "u-agt2", name: "吳佩珊（示範）", role: "agent", tier: "agent", code: "PS02", phone: "60123456705", pin: "3334", parentId: "u-res2", joinedAt: ago(30), demo: true }
    ];
    var clients = [
      { id: "c-demo1", name: "張小姐（示範資料）", phone: "60121110001", gender: "F", age: 38, location: "吉隆坡 Cheras", concerns: ["sleep", "energy"], status: "洽談中", source: "WhatsApp", resellerId: "u-res1", notes: "上班族，長期淺眠，下午容易疲倦。對御芯眠有興趣。", createdAt: ago(12), updatedAt: ago(1), attachments: [], timeline: [], demo: true },
      { id: "c-demo2", name: "Mr. Tan（示範資料）", phone: "60121110002", gender: "M", age: 52, location: "檳城 Georgetown", concerns: ["sugar", "metabolic"], status: "已成交", source: "朋友介紹", resellerId: "u-res2", notes: "愛喝奶茶，飯後易昏沉；已有家庭醫生追蹤，提醒食用前先詢問醫師。", createdAt: ago(25), updatedAt: ago(3), attachments: [], timeline: [], demo: true },
      { id: "c-demo3", name: "Amy Wong（示範資料）", phone: "60121110003", gender: "F", age: 29, location: "新山 JB", concerns: ["water", "metabolic"], status: "新名單", source: "Facebook", resellerId: "u-agt1", notes: "下午腿腫，久坐辦公室。", createdAt: ago(2), updatedAt: ago(2), attachments: [], timeline: [], demo: true },
      { id: "c-demo4", name: "李太太（示範資料）", phone: "60121110004", gender: "F", age: 47, location: "怡保 Ipoh", concerns: ["gender", "antioxidant", "skin"], status: "洽談中", source: "實體活動", resellerId: "u-mgr1", notes: "更年期前後睡不好、膚況暗沉。", createdAt: ago(8), updatedAt: ago(4), attachments: [], timeline: [], demo: true },
      { id: "c-demo5", name: "陳先生（示範資料）", phone: "60121110005", gender: "M", age: 41, location: "巴生 Klang", concerns: ["gut", "circulation"], status: "暫緩", source: "網站名單", resellerId: "u-agt2", notes: "應酬多，排便不順。", createdAt: ago(18), updatedAt: ago(9), attachments: [], timeline: [], demo: true }
    ];
    var A1 = assess({ symptoms: ["s_light", "s_tired", "m_stress", "e_tired"], lifestyle: { sleepHours: "5to6", stress: "4" } });
    A1.id = "a-demo1"; A1.clientId = "c-demo1"; A1.resellerId = "u-res1"; A1.at = ago(10);
    var A2 = assess({ symptoms: ["b_sweet", "b_sleepy", "w_gain"], lifestyle: { sugary: "daily", exercise: "none" }, cautions: ["ct_chronic"] });
    A2.id = "a-demo2"; A2.clientId = "c-demo2"; A2.resellerId = "u-res2"; A2.at = ago(20);
    var quotes = [
      { id: "q-demo1", no: "SB-" + new Date().getFullYear() + "-0001", clientId: "c-demo2", resellerId: "u-res2", items: [{ productId: "xingchang-tea", qty: 2 }, { productId: "svb-berry", qty: 1 }], discountType: "pct", discountValue: 0, status: "已成交", notes: "示範報價單", createdAt: ago(15), demo: true },
      { id: "q-demo2", no: "SB-" + new Date().getFullYear() + "-0002", clientId: "c-demo1", resellerId: "u-res1", items: [{ productId: "yuxin-mian", qty: 2 }], discountType: "pct", discountValue: 5, status: "已發送", notes: "示範報價單", createdAt: ago(5), demo: true },
      { id: "q-demo3", no: "SB-" + new Date().getFullYear() + "-0003", clientId: "c-demo4", resellerId: "u-mgr1", items: [{ productId: "xingzhi-dci", qty: 1 }, { productId: "skin-antiaging-serum", qty: 1 }], discountType: "pct", discountValue: 0, status: "草稿", notes: "示範報價單", createdAt: ago(3), demo: true }
    ];
    var tasks = [
      { id: "t-demo1", title: "回訪御芯眠報價（示範）", clientId: "c-demo1", resellerId: "u-res1", status: "todo", due: t(0), priority: "high", channel: "whatsapp", templateId: "t3", note: "", createdAt: ago(5), demo: true },
      { id: "t-demo2", title: "Amy 首次問候 + 邀請評估（示範）", clientId: "c-demo3", resellerId: "u-agt1", status: "todo", due: t(-1), priority: "high", channel: "whatsapp", templateId: "t1", note: "", createdAt: ago(2), demo: true },
      { id: "t-demo3", title: "Mr. Tan 使用一週回訪（示範）", clientId: "c-demo2", resellerId: "u-res2", status: "doing", due: t(1), priority: "normal", channel: "whatsapp", templateId: "t4", note: "", createdAt: ago(7), demo: true },
      { id: "t-demo4", title: "李太太 說明報價內容（示範）", clientId: "c-demo4", resellerId: "u-mgr1", status: "doing", due: t(3), priority: "normal", channel: "sms", templateId: "t3", note: "", createdAt: ago(3), demo: true },
      { id: "t-demo5", title: "陳先生 節日問候（示範）", clientId: "c-demo5", resellerId: "u-agt2", status: "todo", due: t(7), priority: "low", channel: "sms", templateId: "t6", note: "", createdAt: ago(1), demo: true },
      { id: "t-demo6", title: "Mr. Tan 首次問候（示範）", clientId: "c-demo2", resellerId: "u-res2", status: "done", due: t(-14), priority: "normal", channel: "whatsapp", templateId: "t1", note: "", createdAt: ago(24), doneAt: ago(14), demo: true }
    ];
    // timelines
    function tl(c, type, text, at, ref) { c.timeline.push({ id: U.uid("tl"), type: type, text: text, at: at, refId: ref || null }); }
    tl(clients[0], "question", "「最近都睡不好，半夜三點會醒，白天很累，有什麼可以調理？」", ago(12));
    tl(clients[0], "assessment", "完成健康生活評估：優先關注 睡眠舒壓、元氣・精神", ago(10), "a-demo1");
    tl(clients[0], "quote", "建立報價單 " + quotes[1].no, ago(5), "q-demo2");
    tl(clients[1], "assessment", "完成健康生活評估：優先關注 糖代謝平衡、代謝・體態（已提醒先諮詢醫師）", ago(20), "a-demo2");
    tl(clients[1], "quote", "報價單 " + quotes[0].no + " 已成交", ago(15), "q-demo1");
    tl(clients[2], "lead", "Facebook 廣告名單，尚未聯絡", ago(2));
    tl(clients[3], "note", "實體活動認識，對肌膚保養與體質調理有興趣", ago(8));
    tl(clients[4], "whatsapp", "已發送首次問候，客戶表示下個月再聯絡", ago(9));
    var activity = [
      { id: U.uid("ac"), at: ago(0, 2), icon: "users", text: "Amy Wong（示範資料）由 Facebook 名單加入" },
      { id: U.uid("ac"), at: ago(3), icon: "quote", text: "林雅婷 建立報價單 " + quotes[2].no },
      { id: U.uid("ac"), at: ago(5), icon: "quote", text: "陳美玲 發送報價單 " + quotes[1].no },
      { id: U.uid("ac"), at: ago(10), icon: "pulse", text: "張小姐 完成健康生活評估" },
      { id: U.uid("ac"), at: ago(15), icon: "trophy", text: "黃志明 成交報價單 " + quotes[0].no }
    ];
    return { users: users, clients: clients, assessments: [A1, A2], quotes: quotes, tasks: tasks, questions: [], activity: activity };
  }

  var Store = {
    KEY: KEY,
    _db: null,
    load: function () {
      if (this._db) return this._db;
      var raw = null;
      try { raw = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { raw = null; }
      if (!raw || !raw.meta) raw = this.fresh(true);
      raw.settings = Object.assign(defaultSettings(), raw.settings || {});
      ["users", "clients", "assessments", "quotes", "tasks", "questions", "activity"].forEach(function (k) { raw[k] = raw[k] || []; });
      raw.productOverrides = raw.productOverrides || {};
      this._db = raw;
      return raw;
    },
    fresh: function (withDemo) {
      var s = withDemo ? seed() : { users: [seed().users[0]], clients: [], assessments: [], quotes: [], tasks: [], questions: [], activity: [] };
      var db = Object.assign({ meta: { createdAt: U.now(), version: 1 }, settings: defaultSettings(), productOverrides: {}, session: null }, s);
      try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {}
      return db;
    },
    save: function () {
      try { localStorage.setItem(KEY, JSON.stringify(this._db)); return true; }
      catch (e) { alert("儲存空間不足（localStorage 已滿）。請刪除部分附件圖片，或先匯出備份。"); return false; }
    },
    reset: function (withDemo) { localStorage.removeItem(KEY); this._db = null; this._db = this.fresh(withDemo); return this.load(); },
    reload: function () { this._db = null; return this.load(); },
    log: function (text, icon) {
      var db = this.load();
      db.activity.unshift({ id: U.uid("ac"), at: U.now(), icon: icon || "star", text: text });
      db.activity = db.activity.slice(0, 200);
    },
    userByCode: function (code) {
      if (!code) return null;
      code = String(code).toUpperCase();
      return this.load().users.filter(function (u) { return String(u.code).toUpperCase() === code; })[0] || null;
    },
    /** 首頁自我檢測名單寫入 CRM */
    addLead: function (lead) {
      var db = this.load();
      var owner = this.userByCode(lead.ref) || db.users.filter(function (u) { return u.role === "admin"; })[0];
      var phone = U.normPhone(lead.phone);
      var client = phone ? db.clients.filter(function (c) { return U.normPhone(c.phone) === phone; })[0] : null;
      var isNew = !client;
      if (!client) {
        client = { id: U.uid("c"), name: lead.name || "網站訪客", phone: phone, gender: lead.gender || "", age: lead.age || "", location: lead.location || "",
          concerns: [], status: "新名單", source: "網站自我檢測", refCode: lead.ref || "", resellerId: owner ? owner.id : null,
          notes: "", createdAt: U.now(), updatedAt: U.now(), attachments: [], timeline: [] };
        db.clients.unshift(client);
      }
      var a = lead.assessment;
      if (a) {
        a.id = U.uid("a"); a.clientId = client.id; a.resellerId = client.resellerId; a.source = "landing";
        db.assessments.unshift(a);
        client.concerns = uniq((client.concerns || []).concat(a.focus || []));
        client.timeline.unshift({ id: U.uid("tl"), type: "assessment", at: U.now(), refId: a.id,
          text: "首頁自我檢測：" + (a.redFlags.length ? "⚠️ 出現就醫警訊（" + a.redFlagLabels.join("、") + "）" : "優先關注 " + a.focus.map(function (f) { return (solById(f) || {}).name; }).join("、")) });
      }
      client.timeline.unshift({ id: U.uid("tl"), type: "lead", at: U.now(), text: (isNew ? "新名單" : "既有客戶再次") + "來自首頁自我檢測" + (lead.ref ? "（推薦碼 " + lead.ref + "）" : "") });
      client.updatedAt = U.now();
      db.tasks.unshift({ id: U.uid("t"), title: "跟進網站名單：" + client.name, clientId: client.id, resellerId: client.resellerId, status: "todo",
        due: U.today(0), priority: "high", channel: "whatsapp", templateId: "t2", note: "來自首頁自我檢測", createdAt: U.now() });
      this.log("網站新名單：" + client.name + (lead.ref ? "（推薦碼 " + lead.ref + "）" : ""), "users");
      this.save();
      return client;
    },
    defaultSettings: defaultSettings
  };

  /* ============ 推薦碼 ============ */
  var Ref = {
    capture: function () {
      try {
        var m = location.search.match(/[?&]ref=([^&#]+)/i);
        if (m) { var code = decodeURIComponent(m[1]).toUpperCase().slice(0, 20); localStorage.setItem(REF_KEY, JSON.stringify({ code: code, at: U.now() })); return code; }
        var saved = JSON.parse(localStorage.getItem(REF_KEY) || "null");
        if (saved && Date.now() - new Date(saved.at).getTime() < 30 * 86400000) return saved.code; // 30 天歸屬期
      } catch (e) {}
      return "";
    }
  };

  /** 產品（套用系統內管理員修改） */
  function products() {
    var ov = {};
    try { ov = Store.load().productOverrides || {}; } catch (e) {}
    return (D.products || []).map(function (p) { return ov[p.id] ? Object.assign({}, p, ov[p.id]) : p; });
  }

  /** 部署設定：config.js（優先）或 data/products.js 的 brand 欄位 */
  function config() {
    var c = root.STARBAO_CONFIG || {}, b = (D && D.brand) || {};
    var url = String(c.supabaseUrl || b.supabaseUrl || "").trim().replace(/\/+$/, "");
    var key = String(c.supabaseAnonKey || b.supabaseAnonKey || "").trim();
    // 安全閥：誤填 secret / service_role key 時拒絕使用（該金鑰會繞過所有權限）
    var bad = /^sb_secret_/i.test(key);
    if (!bad && /^eyJ/.test(key)) { try { bad = JSON.parse(atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).role === "service_role"; } catch (e) {} }
    if (bad) { if (!config.warned && root.console) console.error("config.js: secret / service_role key detected — refusing to use it. Use the publishable (anon) key."); config.warned = true; key = ""; }
    return { supabaseUrl: url, supabaseAnonKey: key, cloud: !!(url && key), storageBucket: c.storageBucket || b.storageBucket || "client-files", leadWebhook: c.leadWebhook || b.leadWebhook || "",
      siteUrl: String(c.siteUrl || "").trim(), appUrl: String(c.appUrl || "").trim() };
  }

  root.SB = { config: config, U: U, icon: icon, RULES: RULES, assess: assess, answer: answer, scanText: scanText, Store: Store, Ref: Ref,
    sol: solById, prod: function (id) { return products().filter(function (p) { return p.id === id; })[0]; }, products: products, data: D };
})(window);
