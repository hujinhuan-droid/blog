// 前端路由 + 读者端视图 + 导航 + 站点统计
let CURRENT_USER = null;

// 顶部主导航（可被站点设置中的自定义菜单覆盖；默认项带 i18n key）
const DEFAULT_MENUS = [
  { key: "m_posts", hash: "#/" },
  { key: "m_timeline", hash: "#/timeline" },
  { key: "m_feed", hash: "#/feed" },
  { key: "m_tags", hash: "#/tags" },
  { key: "m_friends", hash: "#/friends" },
  { key: "m_about", hash: "#/about" },
];
let MENUS = DEFAULT_MENUS;

// 站点设置（由 /api/settings 填充，供各页面读取）
let SITE_SETTINGS = {};
let SITE_ABOUT = "";
let PER_PAGE = 10;            // 首页每页文章数（设置可调）
let COMMENTS_ENABLED = true;  // 评论开关（设置可调）

function darken(hex, f) {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = Math.round(((n >> 16) & 255) * f);
  const g = Math.round(((n >> 8) & 255) * f);
  const b = Math.round((n & 255) * f);
  return `rgb(${r}, ${g}, ${b})`;
}

// ---------- 多语言（简体 / 繁體 / English） ----------
// 仅翻译 UI 文案；文章正文、站点名等用户内容是作者原始语言，不自动翻译。
const I18N = {
  zh: {
    m_posts: "文章", m_timeline: "时间轴", m_feed: "动态", m_tags: "标签", m_friends: "朋友们", m_about: "关于",
    nav_admin: "管理后台", nav_login: "登录", nav_logout: "退出",
    search_ph: "搜索文章…",
    hero_eyebrow: "欢迎来到",
    stat_posts: "篇文章", stat_tags: "个标签", stat_days: "天运行",
    cat_all: "全部",
    featured_tag: "✨ 精选", read_more: "阅读全文 →",
    prev: "← 上一页", next: "下一页 →", pager_of: "第 {0} / {1} 页",
    loading: "加载中…",
    empty_posts: "还没有文章，去管理后台写第一篇吧。",
    empty_cat: "该分类下还没有文章。",
    not_found: "文章不存在或无权访问。",
    private: "私密",
    related: "相关文章", related_empty: "暂无相关推荐。", related_fail: "相关推荐加载失败",
    comment_title: "评论", comment_form_title: "发表评论",
    c_author_ph: "昵称（必填）", c_email_ph: "邮箱（选填，不会公开）", c_content_ph: "说点什么…（必填）",
    c_submit: "提交评论", c_success: "评论已发布", c_success_hp: "提交成功",
    c_fill: "请填写昵称和评论内容", c_fail: "提交失败", c_empty: "还没有评论，来抢沙发吧。", c_load_fail: "评论加载失败",
    timeline_title: "时间轴", timeline_empty: "暂无文章",
    feed_title: "动态", feed_empty: "还没有动态，去管理后台发点什么吧。",
    search_title: "搜索", search_empty_q: "请输入关键词。", search_back: "← 返回", search_none: "没有找到相关文章。",
    tags_title: "标签", tags_empty: "还没有标签，去文章编辑器加标签或用「AI 分类」吧。", tags_fail: "标签加载失败", post_load_fail: "文章加载失败",
    tag_back: "← 全部标签", tag_empty: "该标签下还没有文章。",
    friends_title: "朋友们", about_title: "关于",
    tts_read: "🔊 朗读", tts_stop: "⏹ 停止",
    like: "赞", favorite: "收藏", views: "阅读 {0}",
    translate: "翻译", orig: "原文", trans: "译文",
    ask_title: "站内问答", ask_ph: "问我关于博客的任何问题…", send: "发送",
    rss: "RSS", sitemap: "站点地图",
  },
  zht: {
    m_posts: "文章", m_timeline: "時間軸", m_feed: "動態", m_tags: "標籤", m_friends: "朋友們", m_about: "關於",
    nav_admin: "管理後台", nav_login: "登錄", nav_logout: "退出",
    search_ph: "搜尋文章…",
    hero_eyebrow: "歡迎來到",
    stat_posts: "篇文章", stat_tags: "個標籤", stat_days: "天運行",
    cat_all: "全部",
    featured_tag: "✨ 精選", read_more: "閱讀全文 →",
    prev: "← 上一頁", next: "下一頁 →", pager_of: "第 {0} / {1} 頁",
    loading: "載入中…",
    empty_posts: "還沒有文章，去管理後台寫第一篇吧。",
    empty_cat: "該分類下還沒有文章。",
    not_found: "文章不存在或無權訪問。",
    private: "私密",
    related: "相關文章", related_empty: "暫無相關推薦。", related_fail: "相關推薦載入失敗",
    comment_title: "評論", comment_form_title: "發表評論",
    c_author_ph: "暱稱（必填）", c_email_ph: "信箱（選填，不會公開）", c_content_ph: "說點什麼…（必填）",
    c_submit: "提交評論", c_success: "評論已發佈", c_success_hp: "提交成功",
    c_fill: "請填寫暱稱和評論內容", c_fail: "提交失敗", c_empty: "還沒有評論，來搶沙發吧。", c_load_fail: "評論載入失敗",
    timeline_title: "時間軸", timeline_empty: "暫無文章",
    feed_title: "動態", feed_empty: "還沒有動態，去管理後台發點什麼吧。",
    search_title: "搜尋", search_empty_q: "請輸入關鍵詞。", search_back: "← 返回", search_none: "沒有找到相關文章。",
    tags_title: "標籤", tags_empty: "還沒有標籤，去文章編輯器加標籤或用「AI 分類」吧。", tags_fail: "標籤載入失敗", post_load_fail: "文章載入失敗",
    tag_back: "← 全部標籤", tag_empty: "該標籤下還沒有文章。",
    friends_title: "朋友們", about_title: "關於",
    tts_read: "🔊 朗讀", tts_stop: "⏹ 停止",
    like: "讚", favorite: "收藏", views: "閱讀 {0}",
    translate: "翻譯", orig: "原文", trans: "譯文",
    ask_title: "站內問答", ask_ph: "問我關於部落格的任何問題…", send: "傳送",
    rss: "RSS", sitemap: "網站地圖",
  },
  en: {
    m_posts: "Posts", m_timeline: "Timeline", m_feed: "Feed", m_tags: "Tags", m_friends: "Friends", m_about: "About",
    nav_admin: "Admin", nav_login: "Login", nav_logout: "Logout",
    search_ph: "Search posts…",
    hero_eyebrow: "Welcome to",
    stat_posts: "posts", stat_tags: "tags", stat_days: "days running",
    cat_all: "All",
    featured_tag: "✨ Featured", read_more: "Read →",
    prev: "← Prev", next: "Next →", pager_of: "Page {0} / {1}",
    loading: "Loading…",
    empty_posts: "No posts yet — write the first one in the admin panel.",
    empty_cat: "No posts in this category.",
    not_found: "Post not found or no access.",
    private: "Private",
    related: "Related posts", related_empty: "No related posts.", related_fail: "Failed to load related posts",
    comment_title: "Comments", comment_form_title: "Leave a comment",
    c_author_ph: "Name (required)", c_email_ph: "Email (optional, private)", c_content_ph: "Say something… (required)",
    c_submit: "Post comment", c_success: "Comment published", c_success_hp: "Submitted",
    c_fill: "Please fill in name and comment", c_fail: "Submission failed", c_empty: "No comments yet. Be the first!", c_load_fail: "Failed to load comments",
    timeline_title: "Timeline", timeline_empty: "No posts",
    feed_title: "Feed", feed_empty: "No feed updates yet.",
    search_title: "Search", search_empty_q: "Please enter a keyword.", search_back: "← Back", search_none: "No matching posts found.",
    tags_title: "Tags", tags_empty: "No tags yet. Add tags in the editor or use 'AI category'.", tags_fail: "Failed to load tags", post_load_fail: "Failed to load posts",
    tag_back: "← All tags", tag_empty: "No posts with this tag.",
    friends_title: "Friends", about_title: "About",
    tts_read: "🔊 Read", tts_stop: "⏹ Stop",
    like: "👍 Like", favorite: "Save", views: "{0} views",
    translate: "Translate", orig: "Original", trans: "Translation",
    ask_title: "Ask the blog", ask_ph: "Ask me anything about this blog…", send: "Send",
    rss: "RSS", sitemap: "Sitemap",
  },
};
let LANG = "zh";
// 取翻译；缺失时回退简体，再回退 key 本身。支持 {0}/{1} 占位符。
function t(key, ...args) {
  let s = (I18N[LANG] && I18N[LANG][key]) || I18N.zh[key] || key;
  if (args.length) s = s.replace(/\{(\d+)\}/g, (_, i) => (args[i] != null ? args[i] : ""));
  return s;
}
// 应用语言：存偏好 + 设 <html lang> + 重渲染当前页
function setLang(lang) {
  if (!I18N[lang]) lang = "zh";
  LANG = lang;
  try { localStorage.setItem("blog-lang", lang); } catch {}
  document.documentElement.lang = lang === "en" ? "en" : lang === "zht" ? "zh-TW" : "zh-CN";
  route();
}
// TTS 朗读所用语音语言
function ttsLang() {
  return LANG === "en" ? "en-US" : "zh-CN";
}

// 应用站点设置到页面（站点名 / 页脚 / 导航 / 主题色 / 深色模式 / 关于页 / SEO / 阅读偏好）
// 应用主题预设：给 <html> 设置 data-theme 属性，CSS 据此切换配色。
// 仅改强调色/圆角/阴影等变量，不碰 bg/surface/text，确保与深色模式互不打架。
function applyThemePreset(preset) {
  const root = document.documentElement;
  if (preset && preset !== "default") root.setAttribute("data-theme", preset);
  else root.removeAttribute("data-theme");
}

function applySettings(s) {
  if (!s || typeof s !== "object") return;
  SITE_SETTINGS = s;
  if (s.site_title) {
    const b = document.querySelector(".brand");
    if (b) b.textContent = s.site_title;
  }
  if (s.footer_text) {
    const c = document.querySelector(".copyright");
    if (c) c.textContent = s.footer_text;
  }
  if (s.nav) {
    try {
      const arr = JSON.parse(s.nav);
      if (Array.isArray(arr) && arr.length) {
        MENUS = arr
          .filter((x) => x && x.label && x.hash)
          .map((x) => ({ label: String(x.label), hash: String(x.hash) }));
        renderNav();
      }
    } catch {}
  }
  // 先应用主题预设（决定默认强调色），再用自定义主色覆盖（如有）
  applyThemePreset(s.theme_preset);
  if (s.theme_primary) {
    const c = String(s.theme_primary).trim();
    if (/^#?[0-9a-fA-F]{6}$/.test(c)) {
      const hex = c.startsWith("#") ? c : "#" + c;
      document.documentElement.style.setProperty("--primary", hex);
      document.documentElement.style.setProperty("--primary-dark", darken(hex, 0.8));
    }
  }
  if (s.theme_dark === "1") document.body.classList.add("dark");
  else document.body.classList.remove("dark");
  // 阅读偏好
  if (s.posts_per_page) {
    const n = parseInt(s.posts_per_page, 10);
    if (Number.isFinite(n) && n >= 1 && n <= 100) PER_PAGE = n;
  }
  COMMENTS_ENABLED = s.comments_enabled !== "0";
  SITE_ABOUT = s.about_content || "";
  // SEO
  applySeo(s);
}

function api(path, opts) {
  return fetch("/api" + path, Object.assign({ headers: { "content-type": "application/json" } }, opts));
}

function toast(msg) {
  let t = document.querySelector(".toast");
  if (!t) {
    t = document.createElement("div");
    t.className = "toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2200);
}

function fmtDate(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstChild;
}

function escHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// 渲染 AI 备注区块：文章有 ai_notes 时才显示。
// mini=true 用于首页卡片的紧凑版（限制高度 + 渐隐）
function aiNotesHtml(notes, mini) {
  if (!notes || !notes.trim()) return "";
  return `
    <section class="ai-notes${mini ? " ai-notes-mini" : ""}">
      <div class="ai-notes-head"><i data-lucide="bot"></i> AI 备注</div>
      <div class="ai-notes-body">${renderMarkdown(notes)}</div>
    </section>`;
}

// 将 posts.tags（JSON 数组字符串或逗号分隔）解析为标签数组
function parseTags(t) {
  if (!t) return [];
  try {
    const a = JSON.parse(t);
    if (Array.isArray(a)) return a.map((x) => String(x).trim()).filter(Boolean);
  } catch {}
  return String(t)
    .split(/[,，]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

// 渲染文章标签区块（标签可点击进入 #/tags/<name> 筛选）
function tagsHtml(p) {
  const tags = parseTags(p && p.tags);
  if (!tags.length) return "";
  const chips = tags
    .map((t) => `<a class="tag" href="#/tags/${encodeURIComponent(t)}">${escHtml(t)}</a>`)
    .join("");
  return `<div class="tags">${chips}</div>`;
}

// 根据标题/标签自动挑选一个装饰性 emoji 图标（首页卡片用）
function pickIcon(p) {
  const tags = parseTags(p.tags).join(" ");
  const t = ((p.title || "") + " " + tags).toLowerCase();
  const map = [
    [/(ai|人工智能|智能体|agent|llm|gpt|大模型|机器学习|深度学习|神经网络|提示词|prompt)/, "bot"],
    [/(代码|编程|程序|js|javascript|python|java|go|rust|c\+\+|前端|后端|bug|函数|算法|开发|脚本)/, "code"],
    [/(教程|指南|上手|入门|实战|手册|文档|搭建)/, "book-open"],
    [/(笔记|记录|总结|复盘|整理|清单)/, "notebook-pen"],
    [/(思考|想法|观点|随笔|感悟|建议|心得)/, "lightbulb"],
    [/(新闻|快讯|动态|资讯|公告|发布)/, "newspaper"],
    [/(安全|隐私|加密|漏洞|防护|密码)/, "shield"],
    [/(部署|服务器|运维|云|cloudflare|docker|k8s|域名|网络)/, "cloud"],
    [/(生活|日常|旅行|美食|健康|摄影|运动)/, "leaf"],
    [/(设计|ui|ux|排版|美化|视觉|配色|样式)/, "palette"],
  ];
  for (const [re, icon] of map) if (re.test(t)) return icon;
  return "file-text";
}

// 估算阅读时间（优先用正文，其次摘要；无内容则返回空）
function calcReadTime(p) {
  const text = p.content || p.excerpt || "";
  if (!text) return "";
  const n = Math.max(1, Math.round(text.replace(/\s+/g, "").length / 350));
  return `约 ${n} 分钟`;
}

// 统一的文章卡片 HTML：首页 / 时间轴 / 搜索 / 标签页共用，保证视觉一致
function postCardHtml(p) {
  const icon = pickIcon(p);
  const cat = parseTags(p.tags)[0] || "";
  const read = calcReadTime(p);
  return `<article class="post-card">
    <div class="post-card-head">
      <span class="post-icon" aria-hidden="true"><i data-lucide="${icon}"></i></span>
      <div class="post-head-body">
        <h2><a href="#/post/${encodeURIComponent(p.slug)}">${escHtml(p.title)}</a>${
          p.visibility === "private" ? `<span class="badge">${t("private")}</span>` : ""
        }</h2>
        <div class="post-submeta">
          ${cat ? `<span class="post-cat">${escHtml(cat)}</span>` : ""}
          <span class="post-date">${fmtDate(p.created_at)}</span>
          ${read ? `<span class="post-read">${read}</span>` : ""}
        </div>
      </div>
    </div>
    <div class="excerpt">${escHtml(p.excerpt || "")}</div>
    ${aiNotesHtml(p.ai_notes, true)}
    ${tagsHtml(p)}
  </article>`;
}

// 给一组文章卡片绑定点击行为：整卡可点进入文章，但点内嵌链接（如标签）不拦截
function bindPostCards(root) {
  root.querySelectorAll(".post-card").forEach((card) => {
    card.style.cursor = "pointer";
    card.addEventListener("click", (e) => {
      if (e.target.closest("a")) return;
      const a = card.querySelector("a");
      if (a) location.hash = a.getAttribute("href");
    });
  });
}

// 首页「精选」大卡：整宽、更大图标与标题，形成主次层级
function featuredHtml(p) {
  const icon = pickIcon(p);
  const cat = parseTags(p.tags)[0] || "";
  const read = calcReadTime(p);
  return `<article class="post-card featured">
    <div class="post-card-head">
      <span class="post-icon" aria-hidden="true"><i data-lucide="${icon}"></i></span>
      <div class="post-head-body">
        <span class="featured-tag">${t("featured_tag")}</span>
        <h2><a href="#/post/${encodeURIComponent(p.slug)}">${escHtml(p.title)}</a>${
          p.visibility === "private" ? `<span class="badge">${t("private")}</span>` : ""
        }</h2>
        <div class="post-submeta">
          ${cat ? `<span class="post-cat">${escHtml(cat)}</span>` : ""}
          <span class="post-date">${fmtDate(p.created_at)}</span>
          ${read ? `<span class="post-read">${read}</span>` : ""}
        </div>
      </div>
    </div>
    <div class="excerpt">${escHtml(p.excerpt || "")}</div>
    ${aiNotesHtml(p.ai_notes, true)}
    <div class="featured-foot">
      <a class="btn btn-sm btn-primary" href="#/post/${encodeURIComponent(p.slug)}">${t("read_more")}</a>
      ${tagsHtml(p)}
    </div>
  </article>`;
}

// 写入 / 更新 <head> 中的 meta 标签（SEO 用）
function setMeta(name, content) {
  if (!content) return;
  let m = document.head.querySelector(`meta[name="${name}"]`);
  if (!m) {
    m = document.createElement("meta");
    m.setAttribute("name", name);
    document.head.appendChild(m);
  }
  m.setAttribute("content", content);
}

// 应用 SEO 设置：标题（seo_title 优先于 site_title）、描述、关键词、OG 标签
function applySeo(s) {
  const title = s.seo_title || s.site_title || document.title;
  if (title) {
    document.title = title;
    setMeta("og:title", title);
  }
  if (s.seo_description) {
    setMeta("description", s.seo_description);
    setMeta("og:description", s.seo_description);
  }
  if (s.seo_keywords) setMeta("keywords", s.seo_keywords);
}

function renderNav() {
  const nav = document.getElementById("nav");
  nav.innerHTML = "";
  const menu = el(`<div class="menu"></div>`);
  for (const m of MENUS) {
    // 「管理后台」已由右上角单按钮提供，菜单里若也有 #/admin 则跳过，避免重复
    if (m.hash === "#/admin") continue;
    const link = el(`<a class="menu-link" href="${m.hash}">${m.label || t(m.key || "")}</a>`);
    // 手机端点菜单项后自动收起下拉
    link.onclick = () => document.querySelector(".topbar")?.classList.remove("open");
    menu.appendChild(link);
  }
  nav.appendChild(menu);

  // 站内搜索框
  const search = el(`<div class="nav-search"><input id="nav-search" type="search" placeholder="${t("search_ph")}" aria-label="搜索" /></div>`);
  const searchInput = search.querySelector("input");
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const q = searchInput.value.trim();
      if (q) location.hash = "#/search?q=" + encodeURIComponent(q);
    }
  });
  nav.appendChild(search);

  const right = el(`<div class="nav-right"></div>`);
  if (CURRENT_USER && CURRENT_USER.role === "admin") {
    // 管理员：单一「管理后台」按钮（退出可在后台内操作）
    right.appendChild(el(`<a class="btn btn-sm btn-primary" href="#/admin">${t("nav_admin")}</a>`));
  } else if (CURRENT_USER) {
    // 已登录但非管理员：仅提供退出
    const logout = el(`<button class="btn btn-sm">${t("nav_logout")}</button>`);
    logout.onclick = async () => {
      await api("/auth/logout", { method: "POST" });
      CURRENT_USER = null;
      renderNav();
      location.hash = "#/";
    };
    right.appendChild(logout);
  } else {
    right.appendChild(el(`<a class="btn btn-sm btn-primary" href="#/admin">${t("nav_login")}</a>`));
  }
  nav.appendChild(right);
}

// 底部站点统计（与顶栏共用 .wrap 容器，实现平行对齐）
async function renderSiteStats() {
  const box = document.getElementById("site-stats");
  if (!box) return;
  let count = 0;
  try {
    const r = await api("/posts");
    const p = await r.json();
    count = Array.isArray(p) ? p.length : 0;
  } catch {}
  const started = Date.parse("2026-08-13");
  const days = Math.max(1, Math.floor((Date.now() - started) / 86400000) + 1);
  let tagCount = 0;
  try {
    const t = await (await api("/tags")).json();
    tagCount = Array.isArray(t) ? t.length : 0;
  } catch {}
  box.innerHTML =
    `<span>文章 ${count}</span>` +
    `<span>标签 ${tagCount}</span>` +
    `<span>运行 ${days} 天</span>` +
    `<span>访客 —</span>`;
}

// 首页文章缓存 + 当前页码 + 当前分类筛选（用于客户端分页/筛选，避免每次切换都重新拉取）
let homeAll = [];
let homePage = 1;
let homeSort = ""; // "" = 默认(全部/最新) | "views" = 最多观看 | "comments" = 最多互动

async function renderHome() {
  const app = document.getElementById("app");
  app.innerHTML = `<div class="empty">${t("loading")}</div>`;
  if (!homeAll.length) {
    const res = await api("/posts");
    homeAll = await res.json();
  }
  if (!homeAll.length) {
    app.innerHTML = `<div class="empty">${t("empty_posts")}</div>`;
    return;
  }

  // 统计：文章数 / 标签数 / 运行天数
  const tagSet = new Set();
  homeAll.forEach((p) => parseTags(p.tags).forEach((t) => t && tagSet.add(t)));
  const tagCount = tagSet.size;
  const started = Date.parse("2026-08-13");
  const days = Math.max(1, Math.floor((Date.now() - started) / 86400000) + 1);
  const title = SITE_SETTINGS.site_title || "AI Agent 博客";
  const sub = SITE_SETTINGS.seo_description || SITE_SETTINGS.about_content || "记录 AI Agent 的探索、实践与思考";

  app.innerHTML = `
    <section class="hero">
      <div class="hero-inner">
        <p class="hero-eyebrow">${t("hero_eyebrow")}</p>
        <h1 class="hero-title">${escHtml(title)}</h1>
        <p class="hero-sub">${escHtml(sub)}</p>
        <div class="hero-stats">
          <span><b>${homeAll.length}</b> ${t("stat_posts")}</span>
          <span class="dot">·</span>
          <span><b>${tagCount}</b> ${t("stat_tags")}</span>
          <span class="dot">·</span>
          <span><b>${days}</b> ${t("stat_days")}</span>
        </div>
      </div>
    </section>
    <div class="cat-filter" id="catFilter"></div>
    <div id="homeBody"></div>`;

  renderCatFilter();
  renderHomeBody();
}

// 渲染首页排序筛选：全部 / 最多观看(按浏览) / 最多互动(按评论数)
function renderCatFilter() {
  const box = document.getElementById("catFilter");
  if (!box) return;
  const sorts = [
    { key: "", label: "全部" },
    { key: "views", label: "最多观看" },
    { key: "comments", label: "最多互动" },
  ];
  box.innerHTML = sorts
    .map((s) => `<button type="button" class="cat-chip${s.key === homeSort ? " active" : ""}" data-sort="${escHtml(s.key)}">${escHtml(s.label)}</button>`)
    .join("");
  box.querySelectorAll(".cat-chip").forEach((b) => {
    b.onclick = () => {
      homeSort = b.dataset.sort || "";
      homePage = 1;
      renderCatFilter();
      renderHomeBody();
      window.scrollTo(0, 0);
    };
  });
}

// 渲染首页主体：精选大卡（仅「全部」第 1 页）+ 两列网格 + 分页
function renderHomeBody() {
  const body = document.getElementById("homeBody");
  if (!body) return;
  // 复制一份再排序，默认顺序保持后端返回（最新在前）
  const src = homeAll.slice();
  if (homeSort === "views") {
    src.sort((a, b) => (Number(b.views) || 0) - (Number(a.views) || 0));
  } else if (homeSort === "comments") {
    src.sort((a, b) => (Number(b.comment_count) || 0) - (Number(a.comment_count) || 0));
  }
  const showFeatured = !homeSort && homePage === 1;
  const rest = showFeatured ? src.slice(1) : src;
  const pageCount = Math.max(1, Math.ceil(rest.length / PER_PAGE));
  if (homePage > pageCount) homePage = pageCount;
  const start = (homePage - 1) * PER_PAGE;
  const slice = rest.slice(start, start + PER_PAGE);

  let html = "";
  if (showFeatured && src[0]) html += featuredHtml(src[0]);
  if (slice.length) {
    html += `<div class="post-list">${slice.map(postCardHtml).join("")}</div>`;
  } else if (!showFeatured) {
    html += `<div class="empty">${t("empty_cat")}</div>`;
  }
  body.innerHTML = html;
  bindPostCards(body);

  if (pageCount > 1) {
    const pager = el(`<div class="pager"></div>`);
    pager.innerHTML = `
      <button class="btn btn-sm" id="pg-prev" ${homePage <= 1 ? "disabled" : ""}>${t("prev")}</button>
      <span class="muted">${t("pager_of", homePage, pageCount)}</span>
      <button class="btn btn-sm" id="pg-next" ${homePage >= pageCount ? "disabled" : ""}>${t("next")}</button>`;
    body.appendChild(pager);
    const prev = document.getElementById("pg-prev");
    const next = document.getElementById("pg-next");
    if (prev) prev.onclick = () => { homePage--; renderHomeBody(); window.scrollTo(0, 0); };
    if (next) next.onclick = () => { homePage++; renderHomeBody(); window.scrollTo(0, 0); };
  }
}

async function renderPost(slug) {
  const app = document.getElementById("app");
  app.innerHTML = `<div class="empty">${t("loading")}</div>`;
  const res = await api("/posts/" + encodeURIComponent(slug));
  if (res.status === 404) {
    app.innerHTML = `<div class="empty">${t("not_found")}</div>`;
    return;
  }
  const p = await res.json();
  if (p.cover) setMeta("og:image", p.cover);
  const detail = el(`<div class="post-detail"></div>`);
  detail.innerHTML = `
    <h1>${p.title}</h1>
    <div class="post-actions">
      <button type="button" class="tts-btn" id="ttsBtn">${t("tts_read")}</button>
      <span class="post-views" id="postViews"></span>
      <button type="button" class="react-btn" id="likeBtn"><i data-lucide="thumbs-up"></i> <span id="likeCount">0</span></button>
      <button type="button" class="react-btn" id="favBtn"><i data-lucide="star"></i> <span id="favCount">0</span></button>
    </div>
    <div class="meta">${fmtDate(p.created_at)}${
      p.visibility === "private" ? " · " + t("private") : ""
    }</div>
    <div class="content" id="postContent">${renderMarkdown(p.content)}</div>
    ${aiNotesHtml(p.ai_notes)}
    ${tagsHtml(p)}`;
  app.innerHTML = "";
  app.appendChild(detail);
  window.highlightCode(detail);
  reportView(p.slug);
  loadReactions(p.slug);
  bindTranslate(detail, p);
  loadRelated(p.slug);
  attachComments(p.slug);
  // 文章朗读（浏览器内置语音合成，零配额、纯前端）
  const ttsBtn = document.getElementById("ttsBtn");
  if (ttsBtn && "speechSynthesis" in window) {
    let speaking = false;
    ttsBtn.onclick = () => {
      const cEl = document.getElementById("postContent");
      const txt = (cEl?.innerText || "").trim();
      if (!txt) return;
      if (speaking) { window.speechSynthesis.cancel(); return; }
      const u = new SpeechSynthesisUtterance(txt);
      u.lang = ttsLang(); u.rate = 1; u.pitch = 1;
      u.onend = () => { speaking = false; ttsBtn.classList.remove("active"); ttsBtn.textContent = t("tts_read"); };
      u.onerror = u.onend;
      window.speechSynthesis.speak(u);
      speaking = true; ttsBtn.classList.add("active"); ttsBtn.textContent = t("tts_stop");
    };
  }
}

// 阅读量上报（每会话只报一次，避免刷新虚高）
function reportView(slug) {
  try {
    const k = "view:" + slug;
    if (sessionStorage.getItem(k)) return;
    sessionStorage.setItem(k, "1");
  } catch {}
  api("/view", { method: "POST", body: JSON.stringify({ slug }) })
    .then((r) => r.json())
    .then((d) => {
      const elv = document.getElementById("postViews");
      if (elv && d.views != null) elv.textContent = t("views", d.views);
    })
    .catch(() => {});
}

// 点赞 / 收藏：计数展示 + 切换（匿名用 localStorage 持久化 user_key）
function reactionUserKey() {
  try {
    let k = localStorage.getItem("blog-uid");
    if (!k) { k = "anon-" + crypto.randomUUID(); localStorage.setItem("blog-uid", k); }
    return k;
  } catch { return "anon"; }
}
async function loadReactions(slug) {
  const likeBtn = document.getElementById("likeBtn");
  const favBtn = document.getElementById("favBtn");
  if (!likeBtn || !favBtn) return;
  try {
    const d = await (await api("/reactions?slug=" + encodeURIComponent(slug))).json();
    const lc = document.getElementById("likeCount");
    const fc = document.getElementById("favCount");
    if (lc) lc.textContent = d.likes || 0;
    if (fc) fc.textContent = d.favorites || 0;
  } catch {}
  const uk = reactionUserKey();
  const paint = (kind, on) => {
    const b = kind === "like" ? likeBtn : favBtn;
    if (b) b.classList.toggle("active", on);
  };
  paint("like", (() => { try { return localStorage.getItem("react:like:" + slug) === "1"; } catch { return false; } })());
  paint("favorite", (() => { try { return localStorage.getItem("react:favorite:" + slug) === "1"; } catch { return false; } })());
  likeBtn.onclick = async () => {
    const r = await api("/reactions", { method: "POST", body: JSON.stringify({ slug, kind: "like", user_key: uk }) }).then((x) => x.json()).catch(() => null);
    if (r) {
      const lc = document.getElementById("likeCount");
      if (lc) lc.textContent = r.likes;
      const on = !!r.acted;
      likeBtn.classList.toggle("active", on);
      try { localStorage.setItem("react:like:" + slug, on ? "1" : "0"); } catch {}
    }
  };
  favBtn.onclick = async () => {
    const r = await api("/reactions", { method: "POST", body: JSON.stringify({ slug, kind: "favorite", user_key: uk }) }).then((x) => x.json()).catch(() => null);
    if (r) {
      const fc = document.getElementById("favCount");
      if (fc) fc.textContent = r.favorites;
      const on = !!r.acted;
      favBtn.classList.toggle("active", on);
      try { localStorage.setItem("react:favorite:" + slug, on ? "1" : "0"); } catch {}
    }
  };
}

// 正文翻译面板（管理员可用）：调 /api/ai/translate 翻译全文，可切回原文
function bindTranslate(detail, p) {
  if (!CURRENT_USER || CURRENT_USER.role !== "admin") return;
  const content = document.getElementById("postContent");
  if (!content) return;
  const bar = el(`<div class="translate-bar"></div>`);
  bar.innerHTML = `
    <button type="button" class="btn btn-sm" id="tr-en"><i data-lucide="languages"></i> EN</button>
    <button type="button" class="btn btn-sm" id="tr-zht"><i data-lucide="languages"></i> 繁</button>
    <button type="button" class="btn btn-sm" id="tr-back" style="display:none">${t("orig")}</button>
    <span id="tr-msg" class="muted"></span>`;
  const h1 = detail.querySelector("h1");
  if (h1) h1.insertAdjacentElement("afterend", bar);
  const original = p.content;
  const show = (html) => { content.innerHTML = html; window.highlightCode(content); };
  const tr = async (target) => {
    const msg = bar.querySelector("#tr-msg");
    msg.textContent = "翻译中…";
    try {
      const r = await api("/ai/translate", { method: "POST", body: JSON.stringify({ text: original, target }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { msg.textContent = d.error || "翻译失败"; return; }
      show(renderMarkdown(d.text || original));
      bar.querySelector("#tr-back").style.display = "";
      msg.textContent = t("trans");
    } catch { msg.textContent = "翻译失败"; }
  };
  bar.querySelector("#tr-en").onclick = () => tr("en");
  bar.querySelector("#tr-zht").onclick = () => tr("zht");
  bar.querySelector("#tr-back").onclick = () => { show(renderMarkdown(original)); bar.querySelector("#tr-back").style.display = "none"; bar.querySelector("#tr-msg").textContent = ""; };
}

// 文章底部「相关文章」：调用 /api/related（向量相似度 top3，无向量时按标签兜底）
function loadRelated(slug) {
  const app = document.getElementById("app");
  const box = el(`<section class="related"></section>`);
  box.innerHTML = `<h2 class="related-title">${t("related")}</h2><div class="related-list"><div class="empty">${t("loading")}</div></div>`;
  app.appendChild(box);
  const list = box.querySelector(".related-list");
  api("/related?slug=" + encodeURIComponent(slug))
    .then((r) => r.json())
    .then((d) => {
      const rs = d.results || [];
      if (!rs.length) {
        list.innerHTML = `<div class="empty">${t("related_empty")}</div>`;
        return;
      }
      list.innerHTML = rs
        .map((p) => `<a class="related-item" href="#/post/${encodeURIComponent(p.slug)}">${escHtml(p.title)}</a>`)
        .join("");
    })
    .catch(() => {
      list.innerHTML = `<div class="empty">${t("related_fail")}</div>`;
    });
}

// 文章底部评论区（受 comments_enabled 开关控制）
function attachComments(slug) {
  if (COMMENTS_ENABLED !== true) return;
  const app = document.getElementById("app");

  const box = el(`<section class="comments"></section>`);
  box.innerHTML = `
    <h2 class="comments-title">${t("comment_title")}</h2>
    <div id="comment-list" class="comment-list"><div class="empty">${t("loading")}</div></div>`;
  app.appendChild(box);
  loadComments(slug);

  const form = el(`<form class="comment-form" id="comment-form"></form>`);
  form.innerHTML = `
    <h3>${t("comment_form_title")}</h3>
    <input type="text" id="c-author" placeholder="${t("c_author_ph")}" maxlength="40" />
    <input type="email" id="c-email" placeholder="${t("c_email_ph")}" maxlength="80" />
    <textarea id="c-content" placeholder="${t("c_content_ph")}" maxlength="1000"></textarea>
    <input type="text" id="c-hp" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true" />
    <div style="display:flex;gap:10px;align-items:center">
      <button class="btn btn-primary" type="submit">${t("c_submit")}</button>
      <span id="c-msg" class="muted"></span>
    </div>`;
  app.appendChild(form);

  const hp = document.getElementById("c-hp");
  hp.style.position = "absolute";
  hp.style.left = "-9999px";
  hp.style.width = "1px";
  hp.style.height = "1px";

  form.onsubmit = async (e) => {
    e.preventDefault();
    const author = document.getElementById("c-author").value.trim();
    const content = document.getElementById("c-content").value.trim();
    const email = document.getElementById("c-email").value.trim();
    const msg = document.getElementById("c-msg");
    // 蜜罐命中：静默成功，不存储
    if (hp.value) { msg.textContent = t("c_success_hp"); form.reset(); return; }
    if (!author || !content) { msg.textContent = t("c_fill"); return; }
    const res = await api("/comments", {
      method: "POST",
      body: JSON.stringify({ post_slug: slug, author, email, content, hp: hp.value }),
    });
    const r = await res.json().catch(() => ({}));
    if (res.ok) {
      msg.textContent = t("c_success");
      form.reset();
      loadComments(slug);
    } else {
      msg.textContent = r.error || t("c_fail");
    }
  };
}

async function loadComments(slug) {
  const list = document.getElementById("comment-list");
  if (!list) return;
  try {
    const res = await api("/comments?post=" + encodeURIComponent(slug));
    const cs = await res.json();
    if (!Array.isArray(cs) || !cs.length) {
      list.innerHTML = `<div class="empty">${t("c_empty")}</div>`;
      return;
    }
    const byId = {};
    const roots = [];
    for (const c of cs) { c._children = []; byId[c.id] = c; }
    for (const c of cs) {
      if (c.parent_id && byId[c.parent_id]) byId[c.parent_id]._children.push(c);
      else roots.push(c);
    }
    const renderItem = (c, depth) => {
      const replies = (c._children || []).map((ch) => renderItem(ch, depth + 1)).join("");
      const replyBox = `<div class="reply-box" id="reply-${c.id}" style="display:none">
        <input type="text" class="reply-author" placeholder="${t("c_author_ph")}" maxlength="40" />
        <textarea class="reply-content" placeholder="${t("c_content_ph")}" maxlength="1000"></textarea>
        <button class="btn btn-sm btn-primary reply-submit">${t("c_submit")}</button>
      </div>`;
      return `<div class="comment-item${depth ? " comment-child" : ""}">
        <div class="comment-head"><span class="comment-author">${escHtml(c.author)}</span><span class="comment-date">${fmtDate(c.created_at)}</span>
          <button type="button" class="reply-toggle" data-id="${c.id}">回复</button></div>
        <div class="comment-body">${escHtml(c.content)}</div>
        ${replyBox}
        ${replies}
      </div>`;
    };
    list.innerHTML = roots.map((c) => renderItem(c, 0)).join("");
    list.querySelectorAll(".reply-toggle").forEach((btn) => {
      btn.onclick = () => {
        const box = list.querySelector("#reply-" + btn.dataset.id);
        if (box) box.style.display = box.style.display === "none" ? "block" : "none";
      };
    });
    list.querySelectorAll(".reply-submit").forEach((btn) => {
      btn.onclick = async () => {
        const box = btn.closest(".reply-box");
        const author = box.querySelector(".reply-author").value.trim();
        const content = box.querySelector(".reply-content").value.trim();
        const parentId = Number(btn.closest(".comment-item").querySelector(".reply-toggle").dataset.id);
        if (!author || !content) { toast(t("c_fill")); return; }
        const r = await api("/comments", { method: "POST", body: JSON.stringify({ post_slug: slug, author, content, parent_id: parentId, hp: "" }) });
        if (r.ok) { toast(t("c_success")); loadComments(slug); }
        else toast(t("c_fail"));
      };
    });
  } catch {
    list.innerHTML = `<div class="empty">${t("c_load_fail")}</div>`;
  }
}

async function renderTimeline() {
  const app = document.getElementById("app");
  app.innerHTML = `<div class="empty">${t("loading")}</div>`;
  const posts = await (await api("/posts")).json();
  if (!posts.length) {
    app.innerHTML = `<h1 class="page-title">${t("timeline_title")}</h1><div class="empty">${t("timeline_empty")}</div>`;
    return;
  }
  const groups = {};
  for (const p of posts) {
    const y = new Date(p.created_at).getFullYear();
    (groups[y] = groups[y] || []).push(p);
  }
  const years = Object.keys(groups).sort((a, b) => b - a);
  let html = `<h1 class="page-title">${t("timeline_title")}</h1>`;
  for (const y of years) {
    html += `<h2 class="year">${y}</h2><div class="post-list">`;
    for (const p of groups[y]) {
      html += postCardHtml(p);
    }
    html += `</div>`;
  }
  app.innerHTML = html;
  bindPostCards(app);
}

function renderFeed() {
  const app = document.getElementById("app");
  app.innerHTML = `<h1 class="page-title">${t("feed_title")}</h1><div class="empty">${t("feed_empty")}</div>`;
}

// 搜索结果页：调用 /api/search（语义 + 关键词兜底），展示匹配文章
async function renderSearch() {
  const app = document.getElementById("app");
  const m = (location.hash || "").match(/^#\/search\?q=(.+)$/);
  const q = m ? decodeURIComponent(m[1]) : "";
  app.innerHTML = `<h1 class="page-title">${t("search_title")}</h1><div class="empty">${t("loading")}</div>`;
  if (!q) {
    app.innerHTML = `<h1 class="page-title">${t("search_title")}</h1><div class="empty">${t("search_empty_q")}</div>`;
    return;
  }
  let results = [];
  try {
    const r = await api("/search?q=" + encodeURIComponent(q));
    const d = await r.json();
    results = d.results || [];
  } catch {}
  let html = `<h1 class="page-title">${t("search_title")}：“${escHtml(q)}” <a class="btn btn-sm" href="#/" style="margin-left:10px">${t("search_back")}</a></h1>`;
  if (!results.length) {
    html += `<div class="empty">${t("search_none")}</div>`;
    app.innerHTML = html;
    return;
  }
  html += `<div class="post-list">`;
  html += results.map(postCardHtml).join("");
  html += `</div>`;
  app.innerHTML = html;
  bindPostCards(app);
}

function renderTags() {
  const hash = location.hash || "#/";
  const m = hash.match(/^#\/tags\/(.+)$/);
  if (m) {
    renderTagPosts(decodeURIComponent(m[1]));
    return;
  }
  renderTagCloud();
}

// 标签云：列出全部标签及文章数，点击进入该标签下的文章列表
async function renderTagCloud() {
  const app = document.getElementById("app");
  app.innerHTML = `<h1 class="page-title">${t("tags_title")}</h1><div class="empty">${t("loading")}</div>`;
  try {
    const cloud = await (await api("/tags")).json();
    if (!Array.isArray(cloud) || !cloud.length) {
      app.innerHTML = `<h1 class="page-title">${t("tags_title")}</h1><div class="empty">${t("tags_empty")}</div>`;
      return;
    }
    let html = `<h1 class="page-title">${t("tags_title")}</h1><div class="tag-cloud">`;
    for (const t of cloud) {
      html += `<a class="tag-chip" href="#/tags/${encodeURIComponent(t.tag)}">${escHtml(t.tag)} <span class="tag-count">${t.count}</span></a>`;
    }
    html += `</div>`;
    app.innerHTML = html;
  } catch {
    app.innerHTML = `<h1 class="page-title">${t("tags_title")}</h1><div class="empty">${t("tags_fail")}</div>`;
  }
}

// 某标签下的文章列表
async function renderTagPosts(tag) {
  const app = document.getElementById("app");
  app.innerHTML = `<h1 class="page-title">${t("tags_title")}</h1><div class="empty">${t("loading")}</div>`;
  let posts = [];
  try {
    posts = await (await api("/posts")).json();
  } catch {
    app.innerHTML = `<h1 class="page-title">${t("tags_title")}：${escHtml(tag)}</h1><div class="empty">${t("post_load_fail")}</div>`;
    return;
  }
  const filtered = (Array.isArray(posts) ? posts : []).filter((p) => parseTags(p.tags).includes(tag));
  let html = `<h1 class="page-title">${t("tags_title")}：${escHtml(tag)} <a class="btn btn-sm" href="#/tags" style="margin-left:10px">${t("tag_back")}</a></h1>`;
  if (!filtered.length) {
    html += `<div class="empty">${t("tag_empty")}</div>`;
    app.innerHTML = html;
    return;
  }
  html += `<div class="post-list">`;
  html += filtered.map(postCardHtml).join("");
  html += `</div>`;
  app.innerHTML = html;
  bindPostCards(app);
}

function renderFriends() {
  const app = document.getElementById("app");
  const friends = [
    { name: "WorkBuddy", url: "https://www.workbuddy.cn" },
  ];
  let html = `<h1 class="page-title">${t("friends_title")}</h1><div class="friend-list">`;
  for (const f of friends) {
    html += `<a class="friend" href="${f.url}" target="_blank" rel="noopener">${f.name}</a>`;
  }
  html += `</div>`;
  app.innerHTML = html;
}

function renderAbout() {
  const app = document.getElementById("app");
  const about =
    SITE_ABOUT ||
    "这是一个部署在 Cloudflare 上的博客平台，使用 Pages + Workers + D1 + R2 构建，支持 Markdown 写作与图形化管理后台。\n\n由 **hujinhuan-droid** 维护。";
  app.innerHTML = `<div class="post-detail">
    <h1>${t("about_title")}</h1>
    <div class="content">${renderMarkdown(about)}</div>
  </div>`;
  window.highlightCode(app);
}

// 手机端汉堡菜单开关
function bindNavToggle() {
  const toggle = document.getElementById("navToggle");
  if (!toggle) return;
  toggle.onclick = () => document.querySelector(".topbar")?.classList.toggle("open");
}

function route() {
  // 路径式入口（/login、/admin）重定向到哈希路由，避免用户直接输入地址时只看到首页
  const path = location.pathname;
  if (path === "/login" || path === "/admin") {
    location.replace("/#/admin");
    return;
  }
  const hash = location.hash || "#/";
  if (!hash.startsWith("#/admin")) document.body.classList.remove("admin-mode");
  if (hash.startsWith("#/admin")) {
    renderAdmin();
    return;
  }
  if (hash.startsWith("#/post/")) {
    renderPost(decodeURIComponent(hash.slice("#/post/".length)));
    return;
  }
  if (hash.startsWith("#/timeline")) return renderTimeline();
  if (hash.startsWith("#/feed")) return renderFeed();
  if (hash.startsWith("#/search")) return renderSearch();
  if (hash.startsWith("#/tags")) return renderTags();
  if (hash.startsWith("#/friends")) return renderFriends();
  if (hash.startsWith("#/about")) return renderAbout();
  renderHome();
}

// ---------- 主题切换（浅色 / 深色 / 跟随系统） ----------
function initTheme() {
  // 语言切换：合并为单个按钮，点击向下弹出选项（仍留在顶栏右侧）
  const wrap = document.querySelector(".topbar .wrap");
  const box = document.createElement("div");
  box.className = "topbar-actions";
  box.innerHTML = `
    <div class="lang-dd">
      <button type="button" class="lang-btn" id="langBtn" aria-haspopup="true" aria-expanded="false">
        <span id="langCur">${LANG === "en" ? "EN" : LANG === "zht" ? "繁" : "简"}</span><span class="caret">▾</span>
      </button>
      <div class="lang-menu" id="langMenu" role="menu">
        <button type="button" class="lang-item" data-lang="zh">简体中文</button>
        <button type="button" class="lang-item" data-lang="zht">繁體中文</button>
        <button type="button" class="lang-item" data-lang="en">English</button>
      </div>
    </div>`;
  const navToggle = document.getElementById("navToggle");
  if (wrap && navToggle) wrap.insertBefore(box, navToggle);

  const langBtn = document.getElementById("langBtn");
  const langMenu = document.getElementById("langMenu");
  function paintLang() {
    const cur = document.getElementById("langCur");
    if (cur) cur.textContent = LANG === "en" ? "EN" : LANG === "zht" ? "繁" : "简";
    box.querySelectorAll(".lang-item").forEach((b) => b.classList.toggle("active", b.dataset.lang === LANG));
    if (langMenu) langMenu.classList.remove("open");
    if (langBtn) langBtn.setAttribute("aria-expanded", "false");
  }
  if (langBtn) langBtn.onclick = (e) => {
    e.stopPropagation();
    const open = langMenu.classList.toggle("open");
    langBtn.setAttribute("aria-expanded", open ? "true" : "false");
  };
  langMenu.querySelectorAll(".lang-item").forEach((b) => (b.onclick = (e) => {
    e.stopPropagation();
    setLang(b.dataset.lang);
    paintLang();
  }));
  document.addEventListener("click", (e) => {
    if (!box.contains(e.target)) {
      if (langMenu) langMenu.classList.remove("open");
      if (langBtn) langBtn.setAttribute("aria-expanded", "false");
    }
  });
  paintLang();

  // 主题模式：移到页面底部左下角固定浮层（避免与右下角问答浮窗冲突）
  const fab = document.createElement("div");
  fab.className = "site-theme-fab";
  fab.innerHTML = `
    <div class="theme-switch" role="group" aria-label="主题模式">
      <button type="button" class="theme-opt" data-mode="light" title="浅色模式"><i data-lucide="sun"></i></button>
      <button type="button" class="theme-opt" data-mode="dark" title="深色模式"><i data-lucide="moon"></i></button>
      <button type="button" class="theme-opt" data-mode="system" title="跟随系统"><i data-lucide="monitor"></i></button>
    </div>`;
  document.body.appendChild(fab);

  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  function applyTheme(mode) {
    let dark;
    if (mode === "dark") dark = true;
    else if (mode === "light") dark = false;
    else dark = mq.matches;
    document.body.classList.toggle("dark", dark);
    try { localStorage.setItem("blog-theme", mode); } catch {}
    fab.querySelectorAll(".theme-opt").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
  }
  fab.querySelectorAll(".theme-opt").forEach((b) => (b.onclick = () => applyTheme(b.dataset.mode)));
  let saved = null;
  try { saved = localStorage.getItem("blog-theme"); } catch {}
  applyTheme(saved || "system");
  mq.addEventListener("change", () => {
    let cur = "system";
    try { cur = localStorage.getItem("blog-theme") || "system"; } catch {}
    if (cur === "system") applyTheme("system");
  });
}

async function init() {
  try {
    const res = await api("/auth/me");
    const data = await res.json();
    CURRENT_USER = data.user || null;
  } catch {
    CURRENT_USER = null;
  }
  // 读取已存语言偏好（在 initTheme 之前设好，避免首屏闪烁）
  try {
    const sl = localStorage.getItem("blog-lang");
    if (sl && I18N[sl]) {
      LANG = sl;
      document.documentElement.lang = sl === "en" ? "en" : sl === "zht" ? "zh-TW" : "zh-CN";
    }
  } catch {}
  renderNav();
  bindNavToggle();
  renderSiteStats();
  // 拉取站点设置并应用到页面
  try {
    const sr = await api("/settings");
    const sd = await sr.json();
    if (sd && typeof sd === "object") applySettings(sd);
  } catch {}
  initTheme();
  window.addEventListener("hashchange", () => {
    try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch {}
    document.querySelector(".topbar")?.classList.remove("open");
    route();
  });
  route();
  buildAskBot();
  registerPWA();
  addFooterLinks();
}

init();

// 站内问答浮窗（全局，复用 /api/ai/ask）
function buildAskBot() {
  if (document.getElementById("ask-bot")) return;
  const fab = el(`<button type="button" id="ask-fab" class="ask-fab" title="${t("ask_title")}"><i data-lucide="message-circle"></i></button>`);
  const panel = el(`<div id="ask-bot" class="ask-bot" style="display:none">
    <div class="ask-head"><span>${t("ask_title")}</span><button type="button" id="ask-close">✕</button></div>
    <div class="ask-log" id="ask-log"></div>
    <div class="ask-input"><textarea id="ask-q" placeholder="${t("ask_ph")}" rows="2"></textarea><button type="button" id="ask-send" class="btn btn-primary btn-sm">${t("send")}</button></div>
  </div>`);
  document.body.appendChild(fab);
  document.body.appendChild(panel);
  fab.onclick = () => { panel.style.display = panel.style.display === "none" ? "flex" : "none"; };
  document.getElementById("ask-close").onclick = () => { panel.style.display = "none"; };
  const log = () => document.getElementById("ask-log");
  const send = async () => {
    const qEl = document.getElementById("ask-q");
    const q = qEl.value.trim();
    if (!q) return;
    log().innerHTML += `<div class="ask-me">${escHtml(q)}</div>`;
    qEl.value = "";
    log().innerHTML += `<div class="ask-ai" id="ask-typing">…</div>`;
    log().scrollTop = log().scrollHeight;
    try {
      const r = await api("/ai/ask", { method: "POST", body: JSON.stringify({ question: q }) });
      const d = await r.json().catch(() => ({}));
      const typing = document.getElementById("ask-typing");
      if (!r.ok) { if (typing) typing.outerHTML = `<div class="ask-ai">${escHtml(d.error || "问答失败")}</div>`; return; }
      const refs = (d.refs || []).map((rf) => `<a href="#/post/${encodeURIComponent(rf.slug)}">${escHtml(rf.title)}</a>`).join(" · ");
      if (typing) typing.outerHTML = `<div class="ask-ai">${renderMarkdown(d.answer || "")}${refs ? `<div class="ask-refs">${refs}</div>` : ""}</div>`;
    } catch { const typing = document.getElementById("ask-typing"); if (typing) typing.outerHTML = `<div class="ask-ai">问答失败</div>`; }
  };
  document.getElementById("ask-send").onclick = send;
  document.getElementById("ask-q").addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send(); });
}

// PWA：注册 Service Worker（离线可安装）
function registerPWA() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

// 页脚加 RSS / Sitemap 链接
function addFooterLinks() {
  const stats = document.getElementById("site-stats");
  if (!stats || stats.querySelector(".foot-links")) return;
  const links = el(`<span class="foot-links"><a href="/feed.xml" target="_blank" rel="noopener">${t("rss")}</a> · <a href="/sitemap.xml" target="_blank" rel="noopener">${t("sitemap")}</a></span>`);
  stats.appendChild(links);
}
