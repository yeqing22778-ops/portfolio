/**
 * 私密区入口守卫（Cloudflare Pages Functions Middleware）
 *
 * 规则
 *  1. 只拦 /secret 及其子路径，其它请求一律放行（另有 _routes.json 限制调用范围）。
 *  2. 未登录访问 = 登录页，响应里不含任何私密内容。
 *  3. 登录成功 → 下发 HMAC 签名的 HttpOnly Cookie（7 天）。
 *  4. 环境变量缺失 → 直接拒绝（fail closed），绝不"默认放行"。
 *  5. 密码以 SHA-256 形式存放，环境变量里没有明文。
 */

const COOKIE = 'pf_auth';
const TTL = 60 * 60 * 24 * 7;        // Cookie 有效期：7 天
const MAX_TRIES = 10;                // 单 IP 10 分钟内最多 10 次失败
const WINDOW = 10 * 60 * 1000;

const enc = new TextEncoder();
const attempts = new Map();

const NO_STORE = {
  'Cache-Control': 'no-store, max-age=0',
  'X-Robots-Tag': 'noindex, nofollow',
};

const escapeHtml = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function sha256Hex(text) {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

async function hmacHex(secret, text) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(text)));
}

/** 定长比较，避免按字符提前返回 */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function readCookie(request, name) {
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return '';
}

async function isAuthed(request, secret) {
  const value = readCookie(request, COOKIE);
  if (!value) return false;
  const [expRaw, sig] = value.split('.');
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
  return safeEqual(sig, await hmacHex(secret, `auth:${exp}`));
}

function throttleOk(ip) {
  const now = Date.now();
  const rec = attempts.get(ip);
  if (attempts.size > 5000) attempts.clear();
  if (!rec || now > rec.reset) {
    attempts.set(ip, { count: 0, reset: now + WINDOW });
    return true;
  }
  return rec.count < MAX_TRIES;
}

function noteFailure(ip) {
  const rec = attempts.get(ip);
  if (rec) rec.count += 1;
}

/** 只允许跳回私密区内部，避免开放重定向 */
function safeNext(next) {
  return /^\/secret(\/|$)/.test(next || '') ? next : '/secret/';
}

function loginPage(error = '', next = '/secret/') {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="light dark">
<title>私密区</title>
<link rel="stylesheet" href="/styles.css">
<link rel="icon" href="data:,">
</head>
<body>
<main>
  <div class="wrap">
    <div class="gate">
      <h1>私密区</h1>
      <p>这里只有站长能进。输入密码继续。</p>
      ${error ? `<p class="gate-error">${escapeHtml(error)}</p>` : ''}
      <form method="POST" action="/secret/">
        <input type="hidden" name="next" value="${escapeHtml(next)}">
        <label for="pw">密码</label>
        <input id="pw" name="password" type="password" autocomplete="current-password" required autofocus>
        <button type="submit">进入</button>
      </form>
    </div>
    <p style="text-align:center;font-size:.84rem;color:var(--fg-soft)"><a href="/">← 回到公开主页</a></p>
  </div>
</main>
</body>
</html>`;
}

function setupPage() {
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>私密区未配置</title><link rel="stylesheet" href="/styles.css">
</head><body><main><div class="wrap"><div class="gate">
<h1>私密区还没配置</h1>
<p>缺少环境变量，出于安全这里直接拒绝所有访问：</p>
<p style="font-family:monospace;font-size:.82rem;line-height:1.9">
SITE_PASSWORD_SHA256 &nbsp;←&nbsp; node scripts/hash-password.mjs "你的密码"<br>
COOKIE_SECRET &nbsp;←&nbsp; node scripts/hash-password.mjs --secret
</p>
<p>去 Cloudflare Pages → Settings → Variables and Secrets 加上，然后重新部署。</p>
</div></div></main></body></html>`;
}

const html = (body, status = 200) =>
  new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', ...NO_STORE } });

const json = (payload, status = 200) =>
  new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...NO_STORE } });

function parseDrafts(raw) {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.slice(0, 50) : [];
  } catch {
    return [];
  }
}

async function handleLogin(context, env) {
  const ip = context.request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!throttleOk(ip)) return html(loginPage('尝试次数太多了，过十分钟再试。'), 429);

  const form = await context.request.formData().catch(() => null);
  const password = String(form?.get('password') || '');
  const next = safeNext(String(form?.get('next') || '/secret/'));

  const expected = String(env.SITE_PASSWORD_SHA256 || '').toLowerCase();
  const given = await sha256Hex(password);

  if (!safeEqual(given, expected)) {
    noteFailure(ip);
    return html(loginPage('密码不对。', next), 401);
  }

  const exp = Math.floor(Date.now() / 1000) + TTL;
  const value = `${exp}.${await hmacHex(String(env.COOKIE_SECRET), `auth:${exp}`)}`;

  return new Response(null, {
    status: 303,
    headers: {
      Location: next,
      'Set-Cookie': `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${TTL}`,
      ...NO_STORE,
    },
  });
}

function handleLogout() {
  return new Response(null, {
    status: 303,
    headers: {
      Location: '/',
      'Set-Cookie': `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
      ...NO_STORE,
    },
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  const norm = path.replace(/\/+$/, '').toLowerCase() || '/';

  // 只管私密区，其余请求原样放行
  if (norm !== '/secret' && !norm.startsWith('/secret/')) return context.next();

  // fail closed：没配好就当没开门
  if (!env.COOKIE_SECRET || !env.SITE_PASSWORD_SHA256) return html(setupPage(), 500);

  if (norm === '/secret/logout') return handleLogout();
  if (request.method === 'POST' && norm === '/secret') return handleLogin(context, env);

  const authed = await isAuthed(request, String(env.COOKIE_SECRET));

  if (norm === '/secret/data') {
    if (!authed) return json({ error: 'unauthorized' }, 401);
    return json({ drafts: parseDrafts(env.PRIVATE_DATA) });
  }

  if (!authed) {
    // 静态资源类请求给 401 JSON，页面请求给登录页（都不含私密内容）
    if (/\.(json|js|css|png|jpe?g|svg|webp|woff2?|txt)$/i.test(path)) return json({ error: 'unauthorized' }, 401);
    return html(loginPage('', '/secret/'));
  }

  return context.next();
}
