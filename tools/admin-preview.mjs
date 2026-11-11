// 本地后台预览代理：把请求转发到 wrangler dev，并注入管理员会话 Cookie，
// 这样 headless 浏览器就能直接打开 #/admin/* 页面截图。仅本地使用。
import http from "node:http";

const TARGET = process.env.TARGET || "http://127.0.0.1:8787";
const PORT = Number(process.env.PORT) || 8788;
const COOKIE = process.env.SID || "sid=localtest123";

const server = http.createServer((req, res) => {
  const url = new URL(req.url, TARGET);
  const headers = { ...req.headers, cookie: COOKIE, host: new URL(TARGET).host };
  delete headers["accept-encoding"];

  const proxy = http.request(
    { hostname: url.hostname, port: url.port, path: url.pathname + url.search, method: req.method, headers },
    (up) => {
      res.writeHead(up.statusCode || 502, up.headers);
      up.pipe(res);
    }
  );
  proxy.on("error", (e) => {
    res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    res.end("proxy error: " + e.message);
  });
  req.pipe(proxy);
});

server.listen(PORT, "127.0.0.1", () => console.log("admin preview on http://127.0.0.1:" + PORT));
