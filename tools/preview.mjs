// 本地视觉预览：静态资源走 public/，API 返回内存假数据（不连 D1，不产生任何副作用）
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve("public");
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json", ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

const settings = {
  site_title: "AI Agent 博客",
  seo_description: "记录 AI Agent 的探索、实践与思考",
  theme_dark: process.env.DARK === "1" ? "1" : "0",
  comments_enabled: "1",
  posts_per_page: "8",
  site_logo: "",
  social_links: JSON.stringify({ github: "https://github.com/hujinhuan-droid" }),
  friend_links: JSON.stringify([]),
  beian_icp: "",
};

const TITLES = [
  ["Gobuster — 目录与子域枚举（详细实战教程）", "从内容发现原理、三种模式（dir/dns/vhost）到实战：用字典枚举隐藏目录/文件、子域名、虚拟主机，含状态码解读、并发调优、与 Burp/Nmap 联动及避坑。", "Kali"],
  ["Hydra — 在线密码暴力破解（详细实战教程）", "从在线爆破原理、目标与服务指定到 SSH/FTP/HTTP 表单实战，含 -L/-P 字典、-f 首中即停、HTTP 表单参数解析与速率控制、撞库与合规要点。", "Kali,Hydra,在线爆破"],
  ["Aircrack-ng — 无线网络安全审计（详细实战教程）", "从网卡监听模式、抓握手包到 WPA/WPA2 字典破解，覆盖 airodump-ng 锁定信道、deauth 踢人触发重连、aircrack-ng 破解与 WEP 实战。", "Kali,Aircrack-ng,无线安全"],
  ["Hashcat — GPU 加速密码恢复（详细实战教程）", "从哈希模式编号、字典/规则/掩码/组合四大攻击到实战：MD5/NTLM/zip/WordPress 的破解命令与速度预期，含 -m -a 速查、状态解读与 GPU 环境配置。", "Kali,Hashcat,GPU,密码"],
  ["John the Ripper — 离线密码哈希破解", "从哈希识别、格式转换到字典/增量/规则三种模式，含 unshadow 合并 passwd+shadow、zip2john 提取、--show 复查与分布式破解思路。", "Kali,John,密码"],
  ["Nmap — 网络探测与端口扫描之王（详细实战教程）", "覆盖主机发现、端口扫描六种技术、服务与版本探测、NSE 脚本引擎实战，含 -sS/-sT/-sU 选择、时序模板调优与防火墙绕过技巧。", "Kali,Nmap,扫描"],
  ["Metasploit — 渗透测试框架实战（详细实战教程）", "从 msfconsole 结构、模块检索到 msfvenom 生成载荷、multi/handler 监听、meterpreter 后渗透，附完整利用链与权限维持示例。", "Kali,Metasploit"],
  ["Burp Suite — Web 渗透测试工作台（详细实战教程）", "从代理配置、证书导入到 Repeater/Intruder/Scanner 全流程，含抓包改包、爆破位置标记、被动扫描与插件生态。", "Kali,Burp,Web安全"],
  ["SQLMap — SQL 注入自动化检测与利用", "从注入点识别、六种技术（B/E/U/S/T/Q）到 --dbs/--tables/--dump 实战，含 tamper 绕过 WAF、--os-shell 提权与风险控制。", "Kali,SQLMap,注入"],
  ["Wireshark — 网络流量分析（详细实战教程）", "从抓包过滤表达式、显示过滤器语法到 TCP 三次握手还原、HTTP 明文凭据提取与 TLS 解密配置。", "Kali,Wireshark,流量分析"],
];

const posts = TITLES.map(([title, excerpt, tags], i) => ({
  id: 148 - i,
  slug: "post-" + i,
  title,
  excerpt,
  tags: "教程," + tags,
  content: "",
  content_length: 9000,
  views: 320 - i * 21,
  comment_count: i % 5,
  created_at: new Date(Date.parse("2026-11-03") - i * 86400000).toISOString(),
  updated_at: new Date(Date.parse("2026-11-03") - i * 86400000).toISOString(),
  status: "published",
  visibility: "public",
}));

const tagCount = new Map();
posts.forEach((p) => p.tags.split(",").forEach((x) => x && tagCount.set(x, (tagCount.get(x) || 0) + 1)));

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const send = (code, body, type) => {
    res.writeHead(code, { "content-type": type, "cache-control": "no-store" });
    res.end(body);
  };
  if (url.pathname === "/api/settings") return send(200, JSON.stringify(settings), MIME[".json"]);
  if (url.pathname === "/api/tags") {
    const rows = [...tagCount.entries()].map(([name, count]) => ({ name, count }));
    return send(200, JSON.stringify(rows), MIME[".json"]);
  }
  if (url.pathname === "/api/posts") return send(200, JSON.stringify(posts), MIME[".json"]);
  if (url.pathname === "/api/stats") return send(200, JSON.stringify({ views: 12873, posts: posts.length }), MIME[".json"]);
  if (url.pathname === "/api/comments") return send(200, JSON.stringify([]), MIME[".json"]);
  if (url.pathname.startsWith("/api/")) return send(200, JSON.stringify({ ok: true }), MIME[".json"]);

  let file = path.join(ROOT, url.pathname === "/" ? "index.html" : url.pathname);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(ROOT, "index.html");
  }
  const ext = path.extname(file).toLowerCase();
  send(200, fs.readFileSync(file), MIME[ext] || "application/octet-stream");
});

const PORT = Number(process.env.PORT) || 8899;
server.listen(PORT, "127.0.0.1", () => console.log("preview on http://127.0.0.1:" + PORT));
