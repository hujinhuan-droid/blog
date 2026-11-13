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
    side_about: "关于本站", side_popular: "热门文章", side_tags: "标签",
    side_all_tags: "全部标签", post_back: "← 全部文章", all_posts: "全部文章",
    side_l_posts: "篇文章", side_l_tags: "个标签", side_l_days: "天运行", side_l_views: "次阅读",
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
    side_about: "關於本站", side_popular: "熱門文章", side_tags: "標籤",
    side_all_tags: "全部標籤", post_back: "← 全部文章", all_posts: "全部文章",
    side_l_posts: "篇文章", side_l_tags: "個標籤", side_l_days: "天運行", side_l_views: "次閱讀",
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
    side_about: "About", side_popular: "Popular", side_tags: "Tags",
    side_all_tags: "All tags", post_back: "← All posts", all_posts: "All posts",
    side_l_posts: " posts", side_l_tags: " tags", side_l_days: " days", side_l_views: " views",
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

// 动效强度：auto 跟随系统「减少动画」偏好，full 强制开启，off 全关
// 分两档落地：tilt（3D 倾斜/视差，轻微，只有 off 才关）与 animate（进场/平滑滚动，跟随系统）
// 结果写到 <html data-motion="full|soft|off">，CSS 与 JS 共用同一份判断
const MOTION = { level: "auto", tilt: true, animate: true };
function applyMotion(level) {
  const lv = level === "full" || level === "off" ? level : "auto";
  MOTION.level = lv;
  const sysReduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  MOTION.tilt = lv !== "off";                              // 轻微 3D 不引起眩晕，默认保留
  MOTION.animate = lv === "full" || (lv === "auto" && !sysReduce);
  document.documentElement.dataset.motion = lv === "off" ? "off" : MOTION.animate ? "full" : "soft";
}
applyMotion("auto");

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
  applyMotion(s.motion_level);
  injectExtraHead(s.extra_head);
  injectStatsCode(s.stats_code);
  // SEO
  applySeo(s);
  // 品牌与合规（Logo / 社交链接 / 备案号 / 隐私政策 / 友链）
  applyBranding(s);
}

// 品牌与合规：动态渲染头部 Logo 与页脚社交/备案/隐私/友链（使用 DOM API，避免 XSS）
function applyBranding(s) {
  if (!s || typeof s !== "object") return;
  const safeUrl = (u) => (/^(https?:\/\/|mailto:|\/|#)/i.test(u) ? u : "");
  const parseLinks = (raw) =>
    String(raw || "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const i = l.indexOf("|");
        if (i < 0) return null;
        const label = l.slice(0, i).trim();
        const url = l.slice(i + 1).trim();
        return label && safeUrl(url) ? { label, url } : null;
      })
      .filter(Boolean);

  // 1) 品牌 Logo（头部）
  const brand = document.querySelector(".brand");
  if (brand) {
    const title = s.site_title || "AI Agent Blog";
    const logo = String(s.site_logo || "").trim();
    brand.innerHTML = "";
    brand.classList.toggle("has-logo", !!logo);
    if (logo) {
      const img = document.createElement("img");
      img.className = "brand-logo";
      img.alt = "";
      img.src = logo;
      brand.appendChild(img);
    }
    const span = document.createElement("span");
    span.textContent = title;
    brand.appendChild(span);
  }

  // 2) 页脚品牌/合规信息
  const wrap = document.querySelector(".footer .wrap");
  if (!wrap) return;
  const old = wrap.querySelector(".site-branding");
  if (old) old.remove();
  const rows = [];
  const social = parseLinks(s.social_links);
  if (social.length) {
    const row = document.createElement("div");
    row.className = "branding-row social-links";
    social.forEach((x) => {
      const a = document.createElement("a");
      a.className = "social-link";
      a.href = x.url;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = x.label;
      row.appendChild(a);
    });
    rows.push(row);
  }
  const legal = document.createElement("div");
  legal.className = "branding-row legal-links";
  const sep = () => { if (legal.childNodes.length) legal.appendChild(document.createTextNode(" · ")); };
  const addLink = (text, url) => {
    sep();
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = text;
    legal.appendChild(a);
  };
  const privacy = String(s.privacy_url || "").trim();
  if (safeUrl(privacy)) addLink("隐私政策", privacy);
  const friends = parseLinks(s.friend_links);
  if (friends.length) {
    sep();
    const box = document.createElement("span");
    box.className = "friend-links";
    box.appendChild(document.createTextNode("友链："));
    friends.forEach((x, i) => {
      if (i) box.appendChild(document.createTextNode(" · "));
      const a = document.createElement("a");
      a.href = x.url;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = x.label;
      box.appendChild(a);
    });
    legal.appendChild(box);
  }
  const icp = String(s.beian_icp || "").trim();
  if (icp) addLink(icp, "https://beian.miit.gov.cn/");
  const gongan = String(s.beian_gongan || "").trim();
  if (gongan) addLink(gongan, "https://www.beian.gov.cn/");
  if (legal.childNodes.length) rows.push(legal);
  if (rows.length) {
    const branding = document.createElement("div");
    branding.className = "site-branding";
    rows.forEach((r) => branding.appendChild(r));
    wrap.appendChild(branding);
  }
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

// 估算阅读时间：优先用列表接口回传的正文字符数，其次用完整正文；都没有则不显示（避免用摘要低估）
function calcReadTime(p) {
  let n = Number(p && p.content_length) || 0;
  if (!n && p && p.content) n = String(p.content).replace(/\s+/g, "").length;
  if (!n) return "";
  return `约 ${Math.max(1, Math.round(n / 400))} 分钟`;
}

// 统一的文章卡片 HTML：首页 / 时间轴 / 搜索 / 标签页共用，保证视觉一致
// 采用「列表行」而非卡片盒子：元信息 → 标题 → 摘要 → 标签，靠一条细分割线分隔，
// 视觉更接近成熟技术博客，长中文标题也不会让两列卡片高度参差不齐。
function postCardHtml(p) {
  const cat = parseTags(p.tags)[0] || "";
  const read = calcReadTime(p);
  return `<article class="post-card">
    <div class="post-submeta">
      ${cat ? `<span class="post-cat">${escHtml(cat)}</span>` : ""}
      <span class="post-date">${fmtDate(p.created_at)}</span>
      ${read ? `<span class="post-sep">·</span><span class="post-read">${read}</span>` : ""}
      ${p.visibility === "private" ? `<span class="badge">${t("private")}</span>` : ""}
    </div>
    <h2><a href="#/post/${encodeURIComponent(p.slug)}">${escHtml(p.title)}</a></h2>
    ${p.excerpt ? `<p class="excerpt">${escHtml(p.excerpt)}</p>` : ""}
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

/* ────────────────────────────────────────────────────────────────────────────
   景深交互（depth.css 的行为层）
   - 指针倾斜：卡片按指针在卡内的相对位置做 ±MAX_TILT 的 rotateX/rotateY
   - 局部聚光：把指针坐标写进 --mx/--my，由 CSS 画径向高光
   - 3D 舞台：hero 卡片栈随指针整体摆动
   全部在 rAF 里合并写入，且只在精确指针 + 允许动效时绑定；触屏零开销。
   ──────────────────────────────────────────────────────────────────────────── */
const DEPTH_MAX_TILT = 5.5;
const depthMotionOK = () =>
  MOTION.tilt && window.matchMedia("(hover: hover) and (pointer: fine)").matches;

let depthBound = false;
function bindDepth() {
  // 顶栏滚动投影：只做一次
  if (!depthBound) {
    depthBound = true;
    const bar = document.querySelector(".topbar");
    if (bar) {
      const onScroll = () => bar.classList.toggle("is-stuck", window.scrollY > 6);
      window.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
    }
  }
  if (!depthMotionOK()) return;

  // 卡片倾斜 + 聚光
  document.querySelectorAll(".post-card, .side-card").forEach((card) => {
    if (card.dataset.depth) return;
    card.dataset.depth = "1";
    let raf = 0;
    let tx = 0, ty = 0, mx = 50, my = 50, hover = false;

    const apply = () => {
      raf = 0;
      if (hover) {
        card.style.setProperty("--rx", (-ty * DEPTH_MAX_TILT).toFixed(2) + "deg");
        card.style.setProperty("--ry", (tx * DEPTH_MAX_TILT).toFixed(2) + "deg");
      } else {
        card.style.setProperty("--rx", "0deg");
        card.style.setProperty("--ry", "0deg");
      }
      card.style.setProperty("--mx", mx.toFixed(1) + "%");
      card.style.setProperty("--my", my.toFixed(1) + "%");
    };
    const queue = () => { if (!raf) raf = requestAnimationFrame(apply); };

    card.addEventListener("pointerenter", () => { hover = true; });
    card.addEventListener("pointermove", (e) => {
      // 触屏的合成 pointermove 会带 pointerType=touch，跳过避免误倾斜
      if (e.pointerType && e.pointerType !== "mouse" && e.pointerType !== "pen") return;
      const r = card.getBoundingClientRect();
      if (!r.width || !r.height) return;
      tx = (e.clientX - r.left) / r.width - 0.5;   // -0.5 ~ 0.5
      ty = (e.clientY - r.top) / r.height - 0.5;
      mx = ((e.clientX - r.left) / r.width) * 100;
      my = ((e.clientY - r.top) / r.height) * 100;
      queue();
    });
    card.addEventListener("pointerleave", () => {
      hover = false;
      tx = 0; ty = 0;
      queue();
    });
  });

  // hero 3D 舞台：跟随指针摆动
  const stage = document.querySelector(".hero-stage");
  const stack = stage && stage.querySelector(".stage-stack");
  if (stack && !stack.dataset.depth) {
    stack.dataset.depth = "1";
    let raf = 0, px = 0, py = 0;
    const apply = () => {
      raf = 0;
      stack.style.setProperty("--px", px.toFixed(3));
      stack.style.setProperty("--py", py.toFixed(3));
    };
    window.addEventListener("pointermove", (e) => {
      if (e.pointerType === "touch") return;
      // 以视口中心为原点，归一化到 -1 ~ 1，再做一次阻尼
      px = Math.max(-1, Math.min(1, (e.clientX / window.innerWidth - 0.5) * 2)) * 0.8;
      py = Math.max(-1, Math.min(1, (e.clientY / window.innerHeight - 0.5) * 2)) * 0.8;
      if (!raf) raf = requestAnimationFrame(apply);
    }, { passive: true });
  }
}

// 列表交错进场：给卡片挂 .rise 并设置极小的延迟阶梯
function bindRise(root) {
  if (!root || !MOTION.animate) return;
  root.querySelectorAll(".post-card, .side-card").forEach((el, i) => {
    el.style.animationDelay = Math.min(i, 9) * 0.045 + "s";
    el.classList.add("rise");
  });
}

// 首页「精选」大卡：整宽、更大标题与摘要，形成主次层级
function featuredHtml(p) {
  const cat = parseTags(p.tags)[0] || "";
  const read = calcReadTime(p);
  return `<article class="post-card featured">
    <span class="featured-tag">${t("featured_tag")}</span>
    <h2><a href="#/post/${encodeURIComponent(p.slug)}">${escHtml(p.title)}</a>${
      p.visibility === "private" ? `<span class="badge">${t("private")}</span>` : ""
    }</h2>
    <p class="excerpt">${escHtml(p.excerpt || "")}</p>
    <div class="featured-foot">
      <div class="post-submeta">
        ${cat ? `<span class="post-cat">${escHtml(cat)}</span>` : ""}
        <span class="post-date">${fmtDate(p.created_at)}</span>
        ${read ? `<span class="post-sep">·</span><span class="post-read">${read}</span>` : ""}
      </div>
      <a class="featured-cta" href="#/post/${encodeURIComponent(p.slug)}">${t("read_more")}</a>
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

// canonical 链接：SPA 路由切换时更新，避免哈希页与预渲染页（/post/slug）权重分散
function setCanonical(url) {
  if (!url) return;
  let l = document.head.querySelector(`link[rel="canonical"]`);
  if (!l) {
    l = document.createElement("link");
    l.setAttribute("rel", "canonical");
    document.head.appendChild(l);
  }
  l.setAttribute("href", url);
}

// 应用 SEO 设置：标题（seo_title 优先于 site_title）、描述、关键词、OG 标签
// 站内资源补成绝对 URL（OG 图必须是绝对地址，微信/QQ 抓取才认）
function absAsset(u) {
  const v = String(u || "").trim();
  if (!v) return "";
  return /^https?:\/\//i.test(v) ? v : location.origin + (v.startsWith("/") ? v : "/" + v);
}

// 自定义 head：站长粘贴的 meta / 验证标签 / 预连接；先清旧节点再注入，避免后台保存后重复
function injectExtraHead(html) {
  document.querySelectorAll("[data-extra-head]").forEach((n) => n.remove());
  if (!html || !String(html).trim()) return;
  const tpl = document.createElement("template");
  tpl.innerHTML = String(html);
  const frag = document.createDocumentFragment();
  const runScripts = [];
  [...tpl.content.children].forEach((el) => {
    el.setAttribute("data-extra-head", "1");
    if (el.tagName === "SCRIPT") runScripts.push(el);
    frag.appendChild(el);
  });
  document.head.appendChild(frag);
  // 用 innerHTML 插入的 <script> 不会执行，这里重建一次
  runScripts.forEach((old) => {
    const s = document.createElement("script");
    [...old.attributes].forEach((a) => s.setAttribute(a.name, a.value));
    s.text = old.textContent || "";
    old.replaceWith(s);
  });
}

// 统计代码（百度统计 / GA / Umami 等）：注入到 body 末尾并确保脚本真正执行
function injectStatsCode(html) {
  document.querySelectorAll("[data-stats-node]").forEach((n) => n.remove());
  if (!html || !String(html).trim()) return;
  const wrap = document.createElement("div");
  wrap.setAttribute("data-stats-node", "1");
  wrap.hidden = true;
  wrap.innerHTML = String(html);
  wrap.querySelectorAll("script").forEach((old) => {
    const s = document.createElement("script");
    [...old.attributes].forEach((a) => s.setAttribute(a.name, a.value));
    s.text = old.textContent || "";
    old.replaceWith(s);
  });
  document.body.appendChild(wrap);
}

function setJsonLd(id, obj) {
  let s = document.getElementById(id);
  if (!s) {
    s = document.createElement("script");
    s.type = "application/ld+json";
    s.id = id;
    document.head.appendChild(s);
  }
  s.textContent = JSON.stringify(obj);
}

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
  // 站点级 OG / Twitter 基础信息（文章页会再被 applyPostSeo 覆盖）
  setMeta("og:type", "website");
  setMeta("og:url", location.origin + "/");
  setCanonical(location.origin + "/");
  setMeta("twitter:card", "summary_large_image");
  setMeta("og:image", absAsset(s.og_image) || location.origin + "/og-default.png");
  // 离开文章页时移除面包屑结构化数据，避免首页残留旧的 BreadcrumbList
  const oldBc = document.getElementById("ld-breadcrumb");
  if (oldBc) oldBc.remove();
}

// 文章页级 OG：覆盖站点级信息，确保分享单篇文章时卡片正确
function applyPostSeo(p) {
  const siteTitle = SITE_SETTINGS.site_title || "AI Agent 博客";
  document.title = `${p.title} - ${siteTitle}`;
  setMeta("og:type", "article");
  setMeta("og:title", p.title);
  setMeta("og:description", (p.excerpt || "").slice(0, 200));
  const postUrl = location.origin + "/post/" + encodeURIComponent(p.slug);
  setMeta("og:url", postUrl);
  setCanonical(postUrl);
  // 优先文章封面，其次站点默认分享图
  setMeta("og:image", absAsset(p.cover) || absAsset(SITE_SETTINGS.og_image) || location.origin + "/og-default.png");
  setMeta("twitter:card", "summary_large_image");
  // 面包屑结构化数据（BreadcrumbList）：首页 › 首个标签 › 文章，配合服务端预渲染一致
  const bc = [{ name: "首页", url: location.origin + "/" }];
  const ft = (parseTags(p.tags)[0]) || "";
  if (ft) bc.push({ name: ft, url: location.origin + "/tag/" + encodeURIComponent(ft) });
  bc.push({ name: p.title, url: postUrl });
  setJsonLd("ld-breadcrumb", {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: bc.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: c.url })),
  });
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
    // 在「文章」(#/) 之后插入「AI 漫剧」文字入口：像顶部导航一样，点一下进入独立页面
    if (m.hash === "#/" || m.key === "m_posts") {
      const aimanju = el(`<a class="menu-link" href="ai-manju.html">AI模板</a>`);
      aimanju.onclick = () => document.querySelector(".topbar")?.classList.remove("open");
      menu.appendChild(aimanju);
    }
  }
  // 当前路由高亮：「文章」涵盖首页与文章详情
  const curHash = location.hash || "#/";
  menu.querySelectorAll(".menu-link").forEach((a) => {
    const href = a.getAttribute("href") || "";
    if (!href.startsWith("#")) return;
    const active = href === "#/"
      ? (curHash === "#/" || curHash === "" || curHash.startsWith("#/post/"))
      : curHash.startsWith(href);
    a.classList.toggle("active", active);
  });
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
  let p = [];
  try {
    const r = await api("/posts?summary=1");
    p = await r.json();
    count = Array.isArray(p) ? p.length : 0;
  } catch {}
  const started = Date.parse("2026-08-13");
  const days = Math.max(1, Math.floor((Date.now() - started) / 86400000) + 1);
  let tagCount = 0;
  try {
    const t = await (await api("/tags")).json();
    tagCount = Array.isArray(t) ? t.length : 0;
  } catch {}
  const totalViews = p.reduce((s, x) => s + (x.views || 0), 0);
  box.innerHTML =
    `<span>文章 ${count}</span>` +
    `<span>标签 ${tagCount}</span>` +
    `<span>运行 ${days} 天</span>` +
    `<span>阅读 ${totalViews.toLocaleString()}</span>`;
}

// 首页文章缓存 + 当前页码 + 当前分类筛选（用于客户端分页/筛选，避免每次切换都重新拉取）
let homeAll = [];
let homePage = 1;
let homeSort = ""; // "" = 默认(全部/最新) | "views" = 最多观看 | "comments" = 最多互动

async function renderHome() {
  const app = document.getElementById("app");
  app.innerHTML = `<div class="empty">${t("loading")}</div>`;
  // 回到首页时重置为站点级 OG（避免停留在上一篇文章的 article 元信息）
  applySeo(SITE_SETTINGS);
  if (!homeAll.length) {
    const res = await api("/posts?summary=1");
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
    <div class="home">
      <div class="home-main">
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
          <!-- 3D 舞台：纯装饰的卡片栈，跟随指针轻微转动 -->
          <div class="hero-stage" aria-hidden="true">
            <div class="stage-floor"></div>
            <div class="stage-stack">
              <div class="stage-card sc-back"></div>
              <div class="stage-card sc-mid"></div>
              <div class="stage-card sc-front">
                <div class="sc-thumb"></div>
                <div class="sc-line w80"></div>
                <div class="sc-line w60"></div>
                <div class="sc-line w40"></div>
                <div class="sc-chiprow"><span class="sc-chip"></span><span class="sc-chip"></span><span class="sc-chip"></span></div>
              </div>
            </div>
          </div>
        </section>
        <div class="cat-filter" id="catFilter"></div>
        <div id="homeBody"></div>
      </div>
      <aside class="home-side" id="homeSide"></aside>
    </div>`;

  renderCatFilter();
  renderHomeSide();
  renderHomeBody();
  bindDepth();
  bindRise(document.getElementById("homeSide"));
}

// 首页右侧栏：关于本站 / 热门文章 / 标签
function renderHomeSide() {
  const box = document.getElementById("homeSide");
  if (!box) return;
  const title = SITE_SETTINGS.site_title || "AI Agent 博客";
  const sub = SITE_SETTINGS.seo_description || SITE_SETTINGS.site_subtitle || "记录 AI Agent 的探索、实践与思考";
  const logo = String(SITE_SETTINGS.site_logo || "").trim();
  const initial = (title || "A").trim().charAt(0).toUpperCase();
  const started = Date.parse("2026-08-13");
  const days = Math.max(1, Math.floor((Date.now() - started) / 86400000) + 1);
  const views = homeAll.reduce((s, x) => s + (Number(x.views) || 0), 0);

  const popular = homeAll
    .slice()
    .filter((p) => (Number(p.views) || 0) > 0)
    .sort((a, b) => (Number(b.views) || 0) - (Number(a.views) || 0))
    .slice(0, 5);

  const counts = new Map();
  homeAll.forEach((p) => parseTags(p.tags).forEach((x) => x && counts.set(x, (counts.get(x) || 0) + 1)));
  const tagList = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14);

  box.innerHTML = `
    <div class="side-card side-about">
      <div class="side-ava">${logo ? `<img src="${escHtml(logo)}" alt="" />` : escHtml(initial)}</div>
      <div>
        <div class="side-name">${escHtml(title)}</div>
        <p class="side-desc">${escHtml(sub)}</p>
      </div>
      <div class="side-stats">
        <span><b>${homeAll.length}</b>${t("side_l_posts")}</span>
        <span><b>${counts.size}</b>${t("side_l_tags")}</span>
        <span><b>${days}</b>${t("side_l_days")}</span>
        <span><b>${views.toLocaleString()}</b>${t("side_l_views")}</span>
      </div>
    </div>
    ${popular.length ? `<div class="side-card">
      <h3>${t("side_popular")}</h3>
      <ol class="side-ranks">
        ${popular.map((p) => `<li><a href="#/post/${encodeURIComponent(p.slug)}">${escHtml(p.title)}</a></li>`).join("")}
      </ol>
    </div>` : ""}
    ${tagList.length ? `<div class="side-card">
      <h3>${t("side_tags")}</h3>
      <div class="side-tags">
        ${tagList.map(([tag, n]) => `<a href="#/tags/${encodeURIComponent(tag)}">${escHtml(tag)}<i>${n}</i></a>`).join("")}
      </div>
      <a class="side-more" href="#/tags">${t("side_all_tags")} →</a>
    </div>` : ""}`;
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
  bindDepth();
  bindRise(body);

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
  applyPostSeo(p);
  const cat = parseTags(p.tags)[0] || "";
  const read = calcReadTime(p);
  const detail = el(`<div class="post-detail"></div>`);
  // 封面：有 cover 时渲染可视差的 3D 画框（无 cover 则整篇纯排版，不加装饰）
  const coverHtml = p.cover
    ? `<figure class="article-cover" data-cover>
        <img src="${escHtml(p.cover)}" alt="${escHtml(p.title)}" loading="eager" fetchpriority="high" decoding="async" />
        <span class="cover-sheen" aria-hidden="true"></span>
      </figure>`
    : "";
  detail.innerHTML = `
    <a class="post-back" href="#/">${t("post_back")}</a>
    <div class="article-stage">
      <header class="article-head">
        <div class="post-submeta">
          ${cat ? `<span class="post-cat">${escHtml(cat)}</span>` : ""}
          <span class="post-date">${fmtDate(p.created_at)}</span>
          ${read ? `<span class="post-sep">·</span><span class="post-read">${read}</span>` : ""}
          ${p.visibility === "private" ? `<span class="badge">${t("private")}</span>` : ""}
        </div>
        <h1>${escHtml(p.title)}</h1>
        <div class="post-actions">
          <button type="button" class="tts-btn" id="ttsBtn">${t("tts_read")}</button>
          <button type="button" class="react-btn" id="likeBtn"><i data-lucide="thumbs-up"></i> <span id="likeCount">0</span></button>
          <button type="button" class="react-btn" id="favBtn"><i data-lucide="star"></i> <span id="favCount">0</span></button>
          <button type="button" class="react-btn" id="shareBtn"><i data-lucide="share-2"></i> <span>复制链接</span></button>
          <span class="post-views" id="postViews"></span>
        </div>
      </header>
      <details class="toc-inline" id="tocInline" hidden></details>
      ${coverHtml}
      <div class="content" id="postContent">${renderMarkdown(p.content, { toc: false })}</div>
      ${aiNotesHtml(p.ai_notes)}
      ${tagsHtml(p)}
      ${articleEndCardHtml(p)}
      <nav class="post-neighbors" id="postNeighbors" aria-label="上一篇与下一篇"></nav>
    </div>
    <aside class="article-toc" id="articleToc" aria-label="文章目录与文章信息"></aside>`;
  app.innerHTML = "";
  app.appendChild(detail);
  // 正文常以「# 标题」开头，会与文章页 H1 重复：内容首行 H1 与标题一致时去掉，避免标题出现两次
  const bodyEl = detail.querySelector("#postContent");
  const firstH1 = bodyEl && bodyEl.querySelector("h1");
  if (firstH1 && firstH1.textContent.trim() === String(p.title || "").trim()) firstH1.remove();
  window.highlightCode(detail);
  buildArticleNav(detail, p);
  bindRailShare(detail, p);
  bindCoverDepth(detail);
  reportView(p.slug);
  loadReactions(p.slug);
  bindTranslate(detail, p);
  loadRelated(p.slug);
  attachComments(p.slug);
  startReadProgress();
  loadNeighbors(p.slug);
  showResumeBar(detail, p);
  startReadPosition(p.slug);
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

  // 复制规范分享链接（路径式 URL：/post/<slug>），便于微信 / QQ 等社交平台正确抓取 OG 与正文
  const shareBtn = document.getElementById("shareBtn");
  if (shareBtn) shareBtn.onclick = async () => {
    const url = location.origin + "/post/" + encodeURIComponent(p.slug);
    try {
      await navigator.clipboard.writeText(url);
      const sp = shareBtn.querySelector("span");
      if (sp) sp.textContent = "已复制";
      toast("链接已复制，可分享到微信 / QQ");
      setTimeout(() => { if (sp) sp.textContent = "复制链接"; }, 2000);
    } catch { toast(url); }
  };
}

// ---------- 文章页：目录（大屏吸顶侧栏 / 小屏折叠）+ 封面 3D 视差 ----------
// 所有监听都登记到 ARTICLE_NAV.off，路由切换时统一解绑，避免长文反复进出后监听堆积。
let ARTICLE_NAV = null;
function navState() {
  if (!ARTICLE_NAV) ARTICLE_NAV = { off: [] };
  return ARTICLE_NAV;
}
function navOn(target, type, fn, opts) {
  if (!target) return;
  target.addEventListener(type, fn, opts);
  navState().off.push(() => target.removeEventListener(type, fn, opts));
}
function stopArticleNav() {
  if (!ARTICLE_NAV) return;
  ARTICLE_NAV.off.forEach((fn) => fn());
  ARTICLE_NAV = null;
}

// ── 文章侧栏附加卡：作者名片 / 本文标签 / 分享按钮组 ─────────────────
function stripText(s) {
  return String(s || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
function safeAvatar(u) {
  const v = String(u || "").trim();
  return /^(https?:\/\/|\/)/i.test(v) ? v : "";
}
function shareUrlOf(p) {
  return location.origin + "/post/" + encodeURIComponent(p.slug);
}
function authorCardHtml() {
  const s = SITE_SETTINGS || {};
  // 站点未填设置时，回退到与首页 / SEO 一致的默认品牌文案，避免出现空名片
  const name = stripText(s.author_name) || stripText(s.site_title) || "AI Agent 博客";
  const raw = stripText(s.author_bio) || stripText(s.about_content) || stripText(s.seo_description) || "记录 AI Agent 的探索、实践与思考";
  const bio = raw.length > 64 ? raw.slice(0, 64) + "…" : raw;
  const avatar = safeAvatar(s.author_avatar || s.site_logo);
  return `<div class="rail-sec rail-author">
      <div class="rail-avatar">${avatar
        ? `<img src="${escHtml(avatar)}" alt="" loading="lazy" />`
        : `<span>${escHtml(name.slice(0, 1).toUpperCase())}</span>`}</div>
      <div class="rail-author-txt"><b>${escHtml(name)}</b>${bio ? `<span>${escHtml(bio)}</span>` : ""}</div>
    </div>
    <a class="rail-about" href="#/about">关于我 <span aria-hidden="true">↗</span></a>`;
}
function railTagsHtml(p) {
  const tags = parseTags(p && p.tags).slice(0, 8);
  if (!tags.length) return "";
  return `<div class="rail-sec rail-tags"><h4>本文标签</h4><div class="rail-chips">${tags
    .map((x) => `<a href="#/tags/${encodeURIComponent(x)}">${escHtml(x)}</a>`)
    .join("")}</div></div>`;
}
function railShareHtml(p) {
  const u = encodeURIComponent(shareUrlOf(p));
  const text = encodeURIComponent(String(p.title || "").slice(0, 80));
  return `<div class="rail-sec rail-share"><h4>分享本文</h4><div class="rail-share-grid">
      <button type="button" class="rail-share-btn" data-share="copy"><span data-copy-label>复制链接</span></button>
      <a class="rail-share-btn" target="_blank" rel="noopener noreferrer" href="https://service.weibo.com/share/share.php?title=${text}&url=${u}">微博</a>
      <a class="rail-share-btn" target="_blank" rel="noopener noreferrer" href="https://twitter.com/intent/tweet?text=${text}&url=${u}">X</a>
      <a class="rail-share-btn" target="_blank" rel="noopener noreferrer" href="https://t.me/share/url?url=${u}&text=${text}">Telegram</a>
    </div></div>`;
}
function railExtraHtml(p) {
  return `<div class="rail-extra">${authorCardHtml()}${railTagsHtml(p)}${railShareHtml(p)}</div>`;
}
// 小屏没有右侧栏，改为正文末尾的一张卡，保证作者与分享入口不丢失
function articleEndCardHtml(p) {
  return `<div class="article-endcard">${authorCardHtml()}${railShareHtml(p)}</div>`;
}
function bindRailShare(root, p) {
  const url = shareUrlOf(p);
  root.querySelectorAll("[data-share='copy']").forEach((btn) => {
    btn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(url);
        const label = btn.querySelector("[data-copy-label]");
        if (label) {
          label.textContent = "已复制";
          setTimeout(() => { label.textContent = "复制链接"; }, 1800);
        }
        toast("链接已复制，可分享到微信 / QQ");
      } catch { toast(url); }
    };
  });
}

function buildArticleNav(detail, p) {
  const content = detail.querySelector("#postContent");
  const aside = detail.querySelector("#articleToc");
  const inline = detail.querySelector("#tocInline");
  if (!content || !aside) return;

  const heads = Array.from(content.querySelectorAll("h2, h3")).filter((h) => h.textContent.trim().length > 1);
  // 少于 2 个章节的短文不显示目录，但保留作者名片 / 标签 / 分享
  if (heads.length < 2) {
    if (inline) inline.remove();
    aside.classList.add("no-toc");
    aside.innerHTML = railExtraHtml(p);
    return;
  }

  const items = heads.map((h, i) => {
    // markdown 渲染器已给标题生成 id（中文 slug），复用它，避免破坏外部锚点
    const id = h.id || "sec-" + i;
    h.id = id;
    return { id, text: h.textContent.trim().slice(0, 64), lvl: h.tagName === "H3" ? 3 : 2, el: h };
  });
  const listHtml = `<ol class="toc-list">${items
    .map((it) => `<li class="toc-i lv${it.lvl}"><a href="#${it.id}" data-toc="${it.id}">${escHtml(it.text)}</a></li>`)
    .join("")}</ol>`;

  aside.innerHTML = `
    <div class="toc-head">
      <span class="toc-label">目录</span>
      <span class="toc-ring" id="tocRing" style="--p:0" aria-hidden="true"><b>0</b></span>
    </div>
    ${listHtml}
    <div class="toc-foot"><span id="tocNow">共 ${items.length} 节</span></div>
    ${railExtraHtml(p)}`;

  // 小屏：正文上方折叠目录（与侧栏共用同一份锚点）
  if (inline) {
    inline.hidden = false;
    inline.innerHTML = `<summary><i data-lucide="list"></i> 目录 · 共 ${items.length} 节</summary>${listHtml}`;
  }

  const links = Array.from(detail.querySelectorAll("[data-toc]"));
  const ring = aside.querySelector("#tocRing");
  const ringTxt = ring && ring.querySelector("b");
  const now = aside.querySelector("#tocNow");
  const reduced = !MOTION.animate;

  // 平滑跳转：不能用原生 #hash，否则会触发 SPA 路由跳页
  links.forEach((a) =>
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const target = document.getElementById(a.dataset.toc);
      if (!target) return;
      target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
      const box = a.closest("details");
      if (box) box.open = false; // 小屏点完自动收起
    })
  );

  let raf = 0;
  const update = () => {
    raf = 0;
    const vh = window.innerHeight;
    // 1) 当前章节：最后一个已越过顶栏的标题
    let active = 0;
    for (let i = 0; i < items.length; i++) {
      if (items[i].el.getBoundingClientRect().top <= 150) active = i;
    }
    const activeId = items[active] ? items[active].id : "";
    links.forEach((a) => a.classList.toggle("on", a.dataset.toc === activeId));
    if (now && active > 0 && items[active]) now.textContent = items[active].text;
    // 2) 阅读进度环（与顶部进度条同一套算法，视觉上互补）
    const rect = content.getBoundingClientRect();
    const total = rect.height - vh * 0.5;
    const passed = -rect.top + vh * 0.25;
    const pct = total > 0 ? Math.min(100, Math.max(0, (passed / total) * 100)) : 0;
    if (ring) {
      ring.style.setProperty("--p", pct.toFixed(1));
      if (ringTxt) ringTxt.textContent = Math.round(pct) + "%";
    }
  };
  const queue = () => { if (!raf) raf = requestAnimationFrame(update); };
  navOn(window, "scroll", queue, { passive: true });
  navOn(window, "resize", queue);
  update();
}

// 封面视差：滚动时图片在框内反向轻微位移，指针悬停时整框小幅倾斜（叠在视差之上）
function bindCoverDepth(detail) {
  const fig = detail.querySelector("[data-cover]");
  if (!fig) return;
  const img = fig.querySelector("img");
  if (!img) return;
  if (!MOTION.tilt) return;
  const motionOK = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  let raf = 0, cy = 0, cx = 0, rx = 0, ry = 0;
  const apply = () => {
    raf = 0;
    img.style.setProperty("--cy", cy.toFixed(2) + "px");
    img.style.setProperty("--cx", cx.toFixed(2) + "px");
    fig.style.setProperty("--rx", rx.toFixed(2) + "deg");
    fig.style.setProperty("--ry", ry.toFixed(2) + "deg");
  };
  const queue = () => { if (!raf) raf = requestAnimationFrame(apply); };

  const onScroll = () => {
    const r = fig.getBoundingClientRect();
    const vh = window.innerHeight;
    if (r.bottom < -80 || r.top > vh + 80) return; // 不在视口内不计算
    const t = Math.max(-1, Math.min(1, (r.top + r.height / 2 - vh / 2) / vh));
    cy = -t * 18;
    queue();
  };
  navOn(window, "scroll", onScroll, { passive: true });
  navOn(window, "resize", onScroll);

  if (motionOK) {
    navOn(fig, "pointermove", (e) => {
      if (e.pointerType === "touch") return;
      const r = fig.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const nx = (e.clientX - r.left) / r.width - 0.5;
      const ny = (e.clientY - r.top) / r.height - 0.5;
      cx = -nx * 20;
      rx = -ny * 5;
      ry = nx * 5;
      queue();
    });
    navOn(fig, "pointerleave", () => { cx = 0; rx = 0; ry = 0; queue(); });
  }
  onScroll();
}

// ---------- 文章页顶部阅读进度条 ----------
let READ_PROGRESS = null;
function stopReadProgress() {
  if (!READ_PROGRESS) return;
  window.removeEventListener("scroll", READ_PROGRESS.onScroll);
  window.removeEventListener("resize", READ_PROGRESS.onScroll);
  if (READ_PROGRESS.el && READ_PROGRESS.el.parentNode) READ_PROGRESS.el.parentNode.removeChild(READ_PROGRESS.el);
  READ_PROGRESS = null;
}
function startReadProgress() {
  stopReadProgress();
  const bar = el(`<div class="read-progress" aria-hidden="true"><i></i></div>`);
  document.body.appendChild(bar);
  const fill = bar.firstElementChild;
  const onScroll = () => {
    const content = document.getElementById("postContent");
    if (!content) return;
    const rect = content.getBoundingClientRect();
    const vh = window.innerHeight;
    const total = rect.height - vh * 0.5;
    const passed = -rect.top + vh * 0.25;
    const pct = total > 0 ? Math.min(100, Math.max(0, (passed / total) * 100)) : 0;
    fill.style.width = pct + "%";
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  READ_PROGRESS = { el: bar, onScroll };
  onScroll();
}

// ── 文末「上一篇 / 下一篇」导航 ─────────────────────────────────────────
async function loadNeighbors(slug) {
  const box = document.getElementById("postNeighbors");
  if (!box) return;
  let d = null;
  try {
    const r = await api("/neighbors?slug=" + encodeURIComponent(slug));
    if (r.ok) d = await r.json();
  } catch {}
  if (!box.isConnected) return;
  const prev = d && d.prev;
  const next = d && d.next;
  if (!prev && !next) { box.remove(); return; }
  const card = (p, kind) => {
    if (!p) return `<div class="pn-empty"></div>`;
    const cover = safeAvatar(p.cover);
    const cat = parseTags(p.tags)[0] || "";
    const label = kind === "prev" ? "上一篇 · 更早发布" : "下一篇 · 更新发布";
    const arrow = kind === "prev" ? "←" : "→";
    return `<a class="pn-card pn-${kind}" href="#/post/${encodeURIComponent(p.slug)}">
      ${cover ? `<span class="pn-thumb"><img src="${escHtml(cover)}" alt="" loading="lazy" /></span>` : ""}
      <span class="pn-body">
        <span class="pn-label">${kind === "prev" ? `<b>${arrow}</b> ` : ""}${label}${kind === "next" ? ` <b>${arrow}</b>` : ""}</span>
        <strong>${escHtml(p.title)}</strong>
        <span class="pn-meta">${cat ? escHtml(cat) + " · " : ""}${escHtml(fmtDate(p.created_at))}</span>
      </span>
    </a>`;
  };
  box.innerHTML = card(prev, "prev") + card(next, "next");
}

// ── 阅读进度保存 / 续读 ─────────────────────────────────────────────────
// 只在本机 localStorage 保存百分比与滚动位置，不上传、不含正文；7 天自动过期，读完即清除。
const READ_POS_PREFIX = "blog-readpos:";
const READ_POS_MAX_AGE = 7 * 86400000;
let READ_POSITION = null;

function readPosKey(slug) { return READ_POS_PREFIX + slug; }
function getReadPos(slug) {
  try {
    const d = JSON.parse(localStorage.getItem(readPosKey(slug)) || "null");
    if (!d || typeof d.pct !== "number" || !d.ts || Date.now() - d.ts > READ_POS_MAX_AGE) return null;
    return d;
  } catch { return null; }
}
function setReadPos(slug, pct, y) {
  try {
    if (pct >= 98) { localStorage.removeItem(readPosKey(slug)); return; }
    localStorage.setItem(readPosKey(slug), JSON.stringify({ pct: Math.round(pct), y: Math.round(y), ts: Date.now() }));
  } catch {}
}
function pruneReadPos() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(READ_POS_PREFIX)) keys.push(k);
    }
    for (const k of keys) {
      try {
        const d = JSON.parse(localStorage.getItem(k) || "null");
        if (!d || !d.ts || Date.now() - d.ts > READ_POS_MAX_AGE) localStorage.removeItem(k);
      } catch { localStorage.removeItem(k); }
    }
  } catch {}
}
function stopReadPosition() {
  if (!READ_POSITION) return;
  window.removeEventListener("scroll", READ_POSITION.onScroll);
  window.removeEventListener("pagehide", READ_POSITION.onScroll);
  if (READ_POSITION.timer) clearTimeout(READ_POSITION.timer);
  if (READ_POSITION.pct > 0) setReadPos(READ_POSITION.slug, READ_POSITION.pct, window.scrollY);
  READ_POSITION = null;
}
function startReadPosition(slug) {
  stopReadPosition();
  pruneReadPos();
  const content = document.getElementById("postContent");
  if (!content) return;
  const state = { slug, pct: 0, timer: null, onScroll: null };
  const measure = () => {
    const rect = content.getBoundingClientRect();
    const vh = window.innerHeight;
    // 以「正文顶部进入视口」为 0%、「正文底部接近视口底」为 100%。
    // 旧公式用 rect.height - vh*0.5 作分母，短正文时会为负导致进度恒为 0，
    // 长正文又会在滚到评论区前就冲到 100% 而误判「已读完」。
    const start = window.scrollY + rect.top - vh * 0.25;
    const end = window.scrollY + rect.bottom - vh * 0.7;
    const span = Math.max(1, end - start);
    state.pct = Math.min(100, Math.max(0, ((window.scrollY - start) / span) * 100));
  };
  const onScroll = () => {
    measure();
    if (state.timer) return;
    state.timer = setTimeout(() => {
      state.timer = null;
      setReadPos(slug, state.pct, window.scrollY);
    }, 450);
  };
  state.onScroll = onScroll;
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("pagehide", onScroll);
  READ_POSITION = state;
  // 只测量、不落盘：重访时若已有续读记录，不能被初始 0% 覆盖掉
  measure();
}
function showResumeBar(detail, p) {
  const saved = getReadPos(p.slug);
  if (!saved || saved.pct < 8 || saved.pct > 95) return;
  try { if (sessionStorage.getItem("blog-read-dismiss:" + p.slug)) return; } catch {}
  const pct = Math.max(0, Math.min(100, Math.round(Number(saved.pct) || 0)));
  const bar = el(`<div class="resume-bar" role="note">
    <span class="resume-ico" aria-hidden="true">↻</span>
    <span class="resume-txt">上次读到 <b>${pct}%</b>，要接着看吗？</span>
    <button type="button" class="btn btn-sm btn-primary" id="resumeGo">继续阅读</button>
    <button type="button" class="btn btn-sm" id="resumeRestart">从头阅读</button>
    <button type="button" class="resume-x" id="resumeX" aria-label="忽略">×</button>
  </div>`);
  const back = detail.querySelector(".post-back");
  if (back) back.after(bar); else detail.insertBefore(bar, detail.firstChild);
  const dismiss = () => {
    try { sessionStorage.setItem("blog-read-dismiss:" + p.slug, "1"); } catch {}
    bar.remove();
  };
  const go = document.getElementById("resumeGo");
  if (go) go.onclick = () => {
    dismiss();
    window.scrollTo({ top: Math.max(0, Number(saved.y) || 0), behavior: MOTION.animate ? "smooth" : "auto" });
  };
  const restart = document.getElementById("resumeRestart");
  if (restart) restart.onclick = () => {
    try { localStorage.removeItem(readPosKey(p.slug)); } catch {}
    dismiss();
    window.scrollTo(0, 0);
  };
  const x = document.getElementById("resumeX");
  if (x) x.onclick = dismiss;
}

// 阅读量上报（每会话只报一次，避免刷新虚高）
function reportView(slug) {
  try {
    const k = "view:" + slug;
    if (sessionStorage.getItem(k)) return;
    sessionStorage.setItem(k, "1");
  } catch {}
  api("/view", { method: "POST", body: JSON.stringify({ slug, path: location.pathname + location.hash }) })
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
      show(renderMarkdown(d.text || original, { toc: false }));
      bar.querySelector("#tr-back").style.display = "";
      msg.textContent = t("trans");
    } catch { msg.textContent = "翻译失败"; }
  };
  bar.querySelector("#tr-en").onclick = () => tr("en");
  bar.querySelector("#tr-zht").onclick = () => tr("zht");
  bar.querySelector("#tr-back").onclick = () => { show(renderMarkdown(original, { toc: false })); bar.querySelector("#tr-back").style.display = "none"; bar.querySelector("#tr-msg").textContent = ""; };
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
  const posts = await (await api("/posts?summary=1")).json();
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

async function renderFeed() {
  const app = document.getElementById("app");
  app.innerHTML = `<h1 class="page-title">${t("feed_title")}</h1><div class="empty">${t("loading")}</div>`;
  let posts = [];
  try {
    posts = await (await api("/posts?summary=1")).json();
  } catch {}
  if (!posts.length) {
    app.innerHTML = `<h1 class="page-title">${t("feed_title")}</h1><div class="empty">${t("feed_empty")}</div>`;
    return;
  }
  const html = `<h1 class="page-title">${t("feed_title")}</h1><div class="post-list">` +
    posts.slice(0, 12).map(postCardHtml).join("") +
    `</div>`;
  app.innerHTML = html;
  bindPostCards(app);
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
    posts = await (await api("/posts?summary=1")).json();
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
    { name: "WorkBuddy", url: "https://www.workbuddy.cn", desc: "一站式 AI 工作平台" },
    { name: "Cloudflare", url: "https://www.cloudflare.com", desc: "本博客的全球化基础设施" },
  ];
  let html = `<h1 class="page-title">${t("friends_title")}</h1>`;
  html += `<p class="muted" style="margin:-6px 0 18px">这里收录一些我常用或欣赏的站点。如需交换友链，欢迎在文章下方留言。</p>`;
  html += `<div class="friend-list">`;
  for (const f of friends) {
    html += `<a class="friend" href="${f.url}" target="_blank" rel="noopener"><b>${f.name}</b><span class="muted">${f.desc}</span></a>`;
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

let LAST_ROUTE_KEY = null;
function route() {
  const routeKey = location.pathname + location.hash;
  const routeChanged = LAST_ROUTE_KEY !== null && LAST_ROUTE_KEY !== routeKey;
  LAST_ROUTE_KEY = routeKey;
  // 先落盘上一篇的阅读进度，再解绑 / 回顶，避免把 0 写成最终位置
  stopReadPosition();
  stopReadProgress();
  stopArticleNav();
  // SPA 切换页面时回到顶部（原先从首页中部点进文章会停在半空）
  if (routeChanged) window.scrollTo(0, 0);
  // 路径式入口（/login、/admin）重定向到哈希路由，避免用户直接输入地址时只看到首页
  const path = location.pathname;
  if (path === "/login" || path === "/admin") {
    location.replace("/#/admin");
    return;
  }
  // 路径式文章入口（/post/<slug>）：供搜索引擎与社交平台抓取；人类访问时也由本分支渲染
  const pm = path.match(/^\/post\/(.+)$/);
  if (pm && !location.hash) {
    renderPost(decodeURIComponent(pm[1]));
    return;
  }
  const hash = location.hash || "#/";
  if (!hash.startsWith("#/admin")) document.body.classList.remove("admin-mode");
  if (hash.startsWith("#/admin")) {
    // 管理后台脚本（压缩后约 116KB）仅后台需要，首次进入时按需加载，不再随读者首屏下载。
    window.loadScriptOnce("/js/admin.min.js")
      .then(() => {
        // 加载期间用户可能已切走，仅当仍在后台路由时才渲染
        if (location.hash.startsWith("#/admin") && typeof window.renderAdmin === "function") window.renderAdmin();
      })
      .catch(() => {
        const app = document.getElementById("app");
        if (app) app.innerHTML = `<div class="empty">后台加载失败，请刷新重试</div>`;
      });
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
  // 无本地偏好时，回落到站长在「设置 → 主题」里配置的默认模式，
  // 而不是一律 "system"（否则后台选了深色，首次访客看到的仍是跟随系统的浅色）
  const siteDefault = SITE_SETTINGS.theme_dark === "1" ? "dark" : "system";
  applyTheme(saved || siteDefault);
  mq.addEventListener("change", () => {
    let cur = "system";
    try { cur = localStorage.getItem("blog-theme") || "system"; } catch {}
    if (cur === "system") applyTheme("system");
  });
}

async function init() {
  // 读取已存语言偏好（在首次渲染前设好，避免首屏文案闪一下）
  try {
    const sl = localStorage.getItem("blog-lang");
    if (sl && I18N[sl]) {
      LANG = sl;
      document.documentElement.lang = sl === "en" ? "en" : sl === "zht" ? "zh-TW" : "zh-CN";
    }
  } catch {}

  // /auth/me 与 /settings 互不依赖：并行发出。
  // 线上冷启动时单个请求约 1~2.5s，串行会让首屏白屏时间翻倍。
  const meP = api("/auth/me").then((r) => r.json()).catch(() => null);
  const setP = api("/settings").then((r) => r.json()).catch(() => null);
  // 站点统计用的数据与首页相同，提前并行发起，避免又串一个请求在后面等
  renderSiteStats();

  const [meData, sd] = await Promise.all([meP, setP]);
  CURRENT_USER = (meData && meData.user) || null;
  renderNav();
  bindNavToggle();
  if (sd && typeof sd === "object") applySettings(sd);
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
