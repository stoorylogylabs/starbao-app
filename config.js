/*
 * 星寶 Star Bao｜部署設定 Deployment config
 * ------------------------------------------------------------
 * 留空 = 示範模式（資料存在瀏覽器 localStorage）
 * 填入 Supabase 專案網址與 publishable key = 雲端模式（多裝置、多經銷商同步）
 * Leave empty = demo mode (localStorage). Fill in = Supabase cloud mode.
 *
 * Supabase → Project Settings → API Keys：
 *   supabaseUrl     = Project URL，例如 https://abcdefghijkl.supabase.co
 *   supabaseAnonKey = Publishable key（sb_publishable_...；舊專案可用 legacy anon key）
 *                     可公開，資料由資料庫 RLS 保護 / safe to expose, data protected by RLS
 * ⚠️ 絕對不要填 service_role 或 sb_secret_ key！ Never put a service_role / secret key here!
 */
window.STARBAO_CONFIG = {
  supabaseUrl: "https://jtxnekcujjkbvlzkqtzn.supabase.co",          // Supabase 專案「Star Bao」
  supabaseAnonKey: "sb_publishable_u3cKuNVnL5q2uDpDLxwglQ_lHyW7PtC",  // publishable key（可公開）
  storageBucket: "client-files",
  // 公開首頁與顧問系統分開部署時填寫：推薦連結、首頁「顧問／經銷商登入」連結、系統的「返回品牌首頁」都會用到
  siteUrl: "https://stoorylogylabs.github.io/starbao-site/",
  appUrl: "https://stoorylogylabs.github.io/starbao-app/app.html",
  // 選填：首頁名單同時 POST 到此 Webhook（Google Apps Script / Make / Zapier）
  leadWebhook: ""
};
