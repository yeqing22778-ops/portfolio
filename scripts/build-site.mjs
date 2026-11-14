#!/usr/bin/env node
/**
 * 构建期生成站点级文件：sitemap.xml / feed.xml / robots.txt
 *
 * 需要 content/profile.json 里的 "url"（你的线上地址）。
 * 没填就跳过，并给出提示——不会让构建失败。
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { visibleProjects, slugOf } from '../assets/merge.js';

const ROOT = process.cwd();
const read = async (p, fallback) => {
  try {
    return JSON.parse(await readFile(path.join(ROOT, p), 'utf8'));
  } catch {
    return fallback;
  }
};

const xml = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

const rfc822 = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? new Date().toUTCString() : d.toUTCString();
};


const ANALYTICS_DEFAULT = `/* 访问统计未开启。
   开启方式：content/profile.json 里把 analytics.enabled 设为 true，并填入 analytics.token
   （Cloudflare 面板 → Web Analytics → 添加站点 → 复制 token），然后重新构建。 */`;

/** 生成 assets/analytics.js：token 是公开标识，但仍只从配置读，不写死在页面里 */
async function writeAnalytics(profile) {
  const cfg = profile.analytics || {};
  const token = String(cfg.token || '').trim();
  const enabled = cfg.enabled === true && token.length > 0;
  const code = enabled
    ? `/* 由 scripts/build-site.mjs 生成，请勿手改 */
(function () {
  if (location.pathname.indexOf('/secret') === 0) return;  // 私密区不统计
  var s = document.createElement('script');
  s.defer = true;
  s.src = 'https://static.cloudflareinsights.com/beacon.min.js';
  s.setAttribute('data-cf-beacon', JSON.stringify({ token: '${token}' }));
  document.head.appendChild(s);
})();
`
    : ANALYTICS_DEFAULT;
  await writeFile(path.join(ROOT, 'assets', 'analytics.js'), code, 'utf8');
  return enabled;
}

async function main() {
  const profile = await read('content/profile.json', {});
  const projects = await read('content/projects.json', {});
  const generated = await read('content/generated.json', { repos: {} });
  const notesIndex = await read('content/notes.json', { notes: [] });
  const notes = Array.isArray(notesIndex.notes) ? notesIndex.notes : [];

  const analyticsOn = await writeAnalytics(profile);
  const base = String(profile.url || '').replace(/\/+$/, '');
  if (!base) {
    console.warn('[site] 跳过 sitemap/feed：content/profile.json 里还没有填 "url"');
    await writeFile(path.join(ROOT, 'robots.txt'), 'User-agent: *\nDisallow: /secret/\n', 'utf8');
    return;
  }

  // 与页面、构建脚本共用同一套合并规则
  const items = visibleProjects(projects, generated);

  const lastmod = generated.generatedAt ? new Date(generated.generatedAt).toISOString() : new Date().toISOString();

  /* ── sitemap ── */
  const urls = [
    { loc: `${base}/`, lastmod },
    ...items.map((item) => ({
      loc: `${base}/p/${slugOf(item.full)}/`,
      lastmod: item.pushedAt || lastmod,
    })),
    ...(notes.length ? [{ loc: `${base}/notes/`, lastmod }] : []),
    ...notes.map((n) => ({
      loc: `${base}/notes/${slugOf(n.slug)}/`,
      lastmod: n.date || lastmod,
    })),
  ];
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url>\n    <loc>${xml(u.loc)}</loc>\n    <lastmod>${xml(u.lastmod)}</lastmod>\n  </url>`).join('\n')}
</urlset>
`;
  await writeFile(path.join(ROOT, 'sitemap.xml'), sitemap, 'utf8');

  /* ── feed（按最近更新排序）── */
  const feedItems = [
    ...items.map((item) => ({
      title: item.title,
      summary: item.summary,
      updated: item.pushedAt || lastmod,
      link: `${base}/p/${item.slug}/`,
    })),
    ...notes.map((n) => ({
      title: n.title,
      summary: n.summary || '',
      updated: n.date || lastmod,
      link: `${base}/notes/${slugOf(n.slug)}/`,
    })),
  ]
    .sort((a, b) => String(b.updated).localeCompare(String(a.updated)))
    .slice(0, 20);

  const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xml(profile.name || '作品集')}</title>
    <link>${xml(`${base}/`)}</link>
    <description>${xml(profile.tagline || profile.bio || '')}</description>
    <language>zh-cn</language>
    <lastBuildDate>${rfc822(lastmod)}</lastBuildDate>
    <atom:link href="${xml(`${base}/feed.xml`)}" rel="self" type="application/rss+xml"/>
${feedItems.map((it) => `    <item>
      <title>${xml(it.title)}</title>
      <link>${xml(it.link)}</link>
      <guid isPermaLink="true">${xml(it.link)}</guid>
      <pubDate>${rfc822(it.updated)}</pubDate>
      <description>${xml(it.summary)}</description>
    </item>`).join('\n')}
  </channel>
</rss>
`;
  await writeFile(path.join(ROOT, 'feed.xml'), feed, 'utf8');

  /* ── robots ── */
  await writeFile(
    path.join(ROOT, 'robots.txt'),
    `User-agent: *\nDisallow: /secret/\nDisallow: /404.html\n\nSitemap: ${base}/sitemap.xml\n`,
    'utf8'
  );

  console.log(
    `[site] 已生成 sitemap.xml（${urls.length} 条，含笔记 ${notes.length} 篇）、feed.xml（${feedItems.length} 条）、robots.txt、analytics.js（${analyticsOn ? '已开启' : '未开启'}）`
  );
}

main().catch((err) => {
  console.warn(`[site] 生成失败，已跳过：${err.message}`);
  process.exitCode = 0;
});
