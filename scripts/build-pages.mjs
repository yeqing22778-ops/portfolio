#!/usr/bin/env node
/**
 * 按项目生成独立静态页面：p/<slug>/index.html + p/<slug>/og.png
 *
 * 为什么值得：
 *  - 每个项目有独立 URL，可以单独分享
 *  - 每页有自己的 og:title / og:description / og:image（分享出去有对应缩略图）
 *  - 页面里带一份静态可读内容，禁用 JS 或爬虫都能看到
 *
 * 数据合并规则来自 assets/merge.js —— 和浏览器用的是同一份。
 */
import { readFile, writeFile, mkdir, readdir, rm, copyFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { visibleProjects, slugOf, toneOf } from '../assets/merge.js';
import { renderOgImage } from './lib/og-image.mjs';

const ROOT = process.cwd();
const PAGES_DIR = path.join(ROOT, 'p');
const COVERS_DIR = path.join(ROOT, 'content', 'covers');

const readJSON = async (p, fallback = {}) => {
  try {
    return JSON.parse(await readFile(path.join(ROOT, p), 'utf8'));
  } catch {
    return fallback;
  }
};

const esc = (v = '') =>
  String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const clip = (s, n) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

const isoDate = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const paragraphsOf = (text) =>
  String(text || '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

/** 优先用 content/covers/<slug>.<ext>，否则画一张配色卡片 */
async function writeOgImage(dir, item) {
  for (const ext of ['png', 'jpg', 'jpeg', 'webp']) {
    const candidate = path.join(COVERS_DIR, `${item.slug}.${ext}`);
    if (await exists(candidate)) {
      await copyFile(candidate, path.join(dir, 'og.png'));
      return 'cover';
    }
  }
  await writeFile(path.join(dir, 'og.png'), renderOgImage({ tone: toneOf(item.full) }));
  return 'generated';
}

function pageHtml(item, profile, base) {
  const siteName = profile.name || '作品集';
  const title = `${item.title} · ${siteName}`;
  const desc = clip(item.summary, 160);
  const abs = (p) => (base ? `${base}${p}` : p);
  const canonical = abs(`/p/${item.slug}/`);
  const ogImage = abs(`/p/${item.slug}/og.png`);

  const chips = item.stack.length
    ? `<ul class="chips" style="margin-top:16px">${item.stack.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>`
    : '';
  const excerpt = paragraphsOf(item.excerpt)
    .map((p) => `<p>${esc(p)}</p>`)
    .join('');
  const meta = [
    item.language && !item.stack.some((s) => String(s).toLowerCase() === item.language.toLowerCase())
      ? `<span>${esc(item.language)}</span>`
      : '',
    item.stars ? `<span>★ ${item.stars}</span>` : '',
    item.pushedAt ? `<span>更新于 ${esc(isoDate(item.pushedAt))}</span>` : '',
  ].filter(Boolean).join('');

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}">
  <meta name="color-scheme" content="light dark">
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <link rel="canonical" href="${esc(canonical)}">
  <link rel="alternate" type="application/rss+xml" title="RSS" href="/feed.xml">
  <meta property="og:site_name" content="${esc(siteName)}">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:url" content="${esc(canonical)}">
  <meta property="og:image" content="${esc(ogImage)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(desc)}">
  <meta name="twitter:image" content="${esc(ogImage)}">
  <link rel="stylesheet" href="/styles.css">
  <script src="/assets/theme.js"></script>
  <script defer src="/assets/analytics.js"></script>
</head>
<body data-page="project" data-repo="${esc(item.full)}">
  <header class="site-header">
    <div class="wrap" data-header></div>
  </header>

  <main>
    <div class="wrap" data-page-root>
      <!-- 静态可读内容：没有 JS 或爬虫抓取时看到的是这一份 -->
      <p class="crumbs"><a href="/">首页</a> / <a href="/#work">作品</a> / ${esc(item.title)}</p>
      <article class="detail">
        <h1>${esc(item.title)}</h1>
        <p class="lead">${esc(item.summary)}</p>
        ${chips}
        ${meta ? `<div class="meta-row">${meta}</div>` : ''}
        ${excerpt ? `<div class="excerpt">${excerpt}</div>` : ''}
        <div class="cta-row">
          <a class="btn" href="${esc(item.url)}" target="_blank" rel="noopener">查看仓库 ↗</a>
          ${item.homepage ? `<a class="btn ghost" href="${esc(item.homepage)}" target="_blank" rel="noopener">在线预览 ↗</a>` : ''}
        </div>
      </article>
    </div>
  </main>

  <footer class="site-footer" data-footer></footer>
  <script type="module" src="/assets/app.js"></script>
</body>
</html>
`;
}

async function main() {
  const profile = await readJSON('content/profile.json');
  const projects = await readJSON('content/projects.json');
  const generated = await readJSON('content/generated.json', { repos: {} });

  const items = visibleProjects(projects, generated);
  const base = String(profile.url || '').replace(/\/+$/, '');
  if (!base) {
    console.warn('[pages] profile.json 没有 url：og:image 会用相对路径，部分抓取器不认');
  }

  await mkdir(PAGES_DIR, { recursive: true });

  const want = new Set(items.map((i) => i.slug));
  let covers = 0;
  let generatedImages = 0;

  for (const item of items) {
    const dir = path.join(PAGES_DIR, item.slug);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'index.html'), pageHtml(item, profile, base), 'utf8');
    const kind = await writeOgImage(dir, item);
    if (kind === 'cover') covers += 1;
    else generatedImages += 1;
  }

  // 清掉已经不在展示列表里的旧页面（只动 p/ 下的 slug 目录）
  let removed = 0;
  for (const entry of await readdir(PAGES_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (!/^[a-z0-9-]+$/.test(entry.name)) continue;
    if (want.has(entry.name)) continue;
    await rm(path.join(PAGES_DIR, entry.name), { recursive: true, force: true });
    removed += 1;
  }

  console.log(
    `[pages] 生成 ${items.length} 个项目页（预览图：自定义 ${covers} + 自动生成 ${generatedImages}）` +
      (removed ? `，清理旧页面 ${removed} 个` : '')
  );
  if (!items.length) console.log('[pages] 还没有项目，p/ 目录为空——推一个公开仓库后会自动出现');
}

main().catch((err) => {
  console.warn(`[pages] 生成失败：${err.message}`);
  process.exitCode = 0;
});
