#!/usr/bin/env node
/**
 * 把 content/notes/*.md 编译成静态笔记页：
 *   notes/index.html          列表页
 *   notes/<slug>/index.html   单篇（含分享图）
 *   content/notes.json        给前端导航与 sitemap/feed 用的索引
 *
 * 笔记在构建期就变成 HTML，运行时不需要解析 Markdown，也不依赖 JS。
 */
import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { slugOf, toneOf } from '../assets/merge.js';
import { renderMarkdown, parseFrontMatter, plainSummary } from './lib/markdown.mjs';
import { renderOgImage } from './lib/og-image.mjs';

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, 'content', 'notes');
const OUT_DIR = path.join(ROOT, 'notes');

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

async function listMarkdown() {
  try {
    const files = await readdir(SRC_DIR);
    return files.filter((f) => f.endsWith('.md')).sort();
  } catch {
    return [];
  }
}

/** 没写 title 就退回第一个 # 标题，再退回文件名 */
function titleOf(data, body, file) {
  if (data.title) return String(data.title);
  const h1 = body.match(/^#\s+(.+)$/m);
  if (h1) return h1[1].trim();
  return path.basename(file, '.md');
}

async function main() {
  const profile = await readJSON('content/profile.json');
  const base = String(profile.url || '').replace(/\/+$/, '');
  const siteName = profile.name || '作品集';

  const files = await listMarkdown();
  const notes = [];

  for (const file of files) {
    const raw = await readFile(path.join(SRC_DIR, file), 'utf8');
    const { data, body } = parseFrontMatter(raw);
    if (data.draft === true) continue;

    const slug = slugOf(String(data.slug || path.basename(file, '.md')));
    const title = titleOf(data, body, file);
    const summary = data.summary ? String(data.summary) : plainSummary(body, 110);
    const date = String(data.date || '');
    // 正文开头如果就是一个和标题相同的一级标题，去掉它（标题由模板统一渲染）
    const bodyForRender = body.replace(/^#\s+(.+)\n+/, (m, text) => (text.trim() === title ? '' : m));
    const html = renderMarkdown(bodyForRender);

    notes.push({ file, slug, title, summary, date, html, tone: toneOf(slug) });
  }

  // 新的排前面；没有日期的排最后
  notes.sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.slug.localeCompare(b.slug));

  await mkdir(OUT_DIR, { recursive: true });
  const want = new Set(notes.map((n) => n.slug));

  const abs = (p) => (base ? `${base}${p}` : p);

  for (const note of notes) {
    const dir = path.join(OUT_DIR, note.slug);
    await mkdir(dir, { recursive: true });

    const pageTitle = `${note.title} · ${siteName}`;
    const canonical = abs(`/notes/${note.slug}/`);
    const ogImage = abs(`/notes/${note.slug}/og.png`);

    const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(pageTitle)}</title>
  <meta name="description" content="${esc(clip(note.summary, 160))}">
  <meta name="color-scheme" content="light dark">
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <link rel="canonical" href="${esc(canonical)}">
  <link rel="alternate" type="application/rss+xml" title="RSS" href="/feed.xml">
  <meta property="og:site_name" content="${esc(siteName)}">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${esc(pageTitle)}">
  <meta property="og:description" content="${esc(clip(note.summary, 160))}">
  <meta property="og:url" content="${esc(canonical)}">
  <meta property="og:image" content="${esc(ogImage)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(pageTitle)}">
  <meta name="twitter:description" content="${esc(clip(note.summary, 160))}">
  <meta name="twitter:image" content="${esc(ogImage)}">
  <link rel="stylesheet" href="/styles.css">
  <script src="/assets/theme.js"></script>
  <script defer src="/assets/analytics.js"></script>
</head>
<body data-page="note">
  <header class="site-header">
    <div class="wrap" data-header>
      <a class="brand" href="/">${esc(siteName)}</a>
      <div class="header-right">
        <nav class="site-nav">
          <a href="/#work">作品</a>
          <a href="/notes/">笔记</a>
        </nav>
      </div>
    </div>
  </header>

  <main>
    <div class="wrap" data-page-root>
      <p class="crumbs"><a href="/">首页</a> / <a href="/notes/">笔记</a> / ${esc(note.title)}</p>
      <article class="prose">
        <h1>${esc(note.title)}</h1>
        ${note.date ? `<time class="note-date" datetime="${esc(note.date)}">${esc(note.date)}</time>` : ''}
        ${note.html}
      </article>
    </div>
  </main>

  <footer class="site-footer" data-footer>
    <div class="wrap footer-inner"><span>${esc(profile.footer || '')} · ${new Date().getFullYear()}</span></div>
  </footer>
  <script type="module" src="/assets/app.js"></script>
</body>
</html>
`;
    await writeFile(path.join(dir, 'index.html'), html, 'utf8');
    await writeFile(path.join(dir, 'og.png'), renderOgImage({ tone: note.tone }));
  }

  // 列表页
  const rows = notes.length
    ? notes
        .map(
          (n) => `        <li class="note-row">
          <a class="note-row-title" href="/notes/${esc(n.slug)}/">${esc(n.title)}</a>
          ${n.date ? `<time class="note-date" datetime="${esc(n.date)}">${esc(n.date)}</time>` : ''}
          <p class="note-row-summary">${esc(n.summary)}</p>
        </li>`
        )
        .join('\n')
    : `        <li class="empty">还没有笔记。在 <code>content/notes/</code> 里放一个 <code>.md</code> 文件就行。</li>`;

  const indexTitle = `笔记 · ${siteName}`;
  const indexHtml = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(indexTitle)}</title>
  <meta name="description" content="${esc(clip(profile.tagline || profile.bio || '笔记', 160))}">
  <meta name="color-scheme" content="light dark">
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <link rel="canonical" href="${esc(abs('/notes/'))}">
  <link rel="alternate" type="application/rss+xml" title="RSS" href="/feed.xml">
  <meta property="og:site_name" content="${esc(siteName)}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${esc(indexTitle)}">
  <meta property="og:description" content="${esc(clip(profile.bio, 160))}">
  <meta property="og:url" content="${esc(abs('/notes/'))}">
  <meta property="og:image" content="${esc(abs('/assets/og.png'))}">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="stylesheet" href="/styles.css">
  <script src="/assets/theme.js"></script>
  <script defer src="/assets/analytics.js"></script>
</head>
<body data-page="notes">
  <header class="site-header">
    <div class="wrap" data-header>
      <a class="brand" href="/">${esc(siteName)}</a>
      <div class="header-right">
        <nav class="site-nav">
          <a href="/#work">作品</a>
          <a href="/notes/">笔记</a>
        </nav>
      </div>
    </div>
  </header>

  <main>
    <div class="wrap" data-page-root>
      <div class="section-head" style="margin-top:0">
        <h2>笔记</h2>
        <span>${notes.length} 篇</span>
      </div>
      <ul class="notes-list">
${rows}
      </ul>
    </div>
  </main>

  <footer class="site-footer" data-footer>
    <div class="wrap footer-inner"><span>${esc(profile.footer || '')} · ${new Date().getFullYear()}</span></div>
  </footer>
  <script type="module" src="/assets/app.js"></script>
</body>
</html>
`;
  await writeFile(path.join(OUT_DIR, 'index.html'), indexHtml, 'utf8');

  // 索引：给导航、sitemap、feed 用
  await writeFile(
    path.join(ROOT, 'content', 'notes.json'),
    `${JSON.stringify(
      {
        updatedAt: new Date().toISOString(),
        notes: notes.map((n) => ({ slug: n.slug, title: n.title, date: n.date, summary: n.summary, url: abs(`/notes/${n.slug}/`) })),
      },
      null,
      2
    )}\n`,
    'utf8'
  );

  // 清理已删除的笔记
  let removed = 0;
  for (const entry of await readdir(OUT_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (!/^[a-z0-9-]+$/.test(entry.name)) continue;
    if (want.has(entry.name)) continue;
    await rm(path.join(OUT_DIR, entry.name), { recursive: true, force: true });
    removed += 1;
  }

  console.log(
    `[notes] 生成 ${notes.length} 篇笔记` +
      (removed ? `，清理旧笔记 ${removed} 篇` : '') +
      (notes.length ? '' : '（content/notes/ 里还没有 .md 文件）')
  );
}

main().catch((err) => {
  console.warn(`[notes] 生成失败：${err.message}`);
  process.exitCode = 0;
});
