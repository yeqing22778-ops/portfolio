/**
 * 纯数据逻辑 —— 浏览器渲染（assets/app.js）和构建脚本（scripts/build-pages.mjs）
 * 共用同一份规则，避免出现「页面显示的项目」和「构建出来的项目」对不上。
 *
 * 这个文件不许碰 DOM、不许发请求、不许读环境变量。
 */

/** 没有封面时，按名字哈希出稳定配色（与 styles.css 的 .tone-N 对应） */
export function toneOf(str) {
  let h = 7;
  for (let i = 0; i < String(str).length; i += 1) h = (h * 31 + String(str).charCodeAt(i)) % 1000003;
  return h % 6;
}

export const initialOf = (text) => String(text || 'Y').trim().charAt(0).toUpperCase();

/** owner/repo → p 目录名。只留 ASCII 小写与连字符，保证 URL 干净 */
export function slugOf(full) {
  const slug = String(full)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug) return slug;
  // 全中文等非 ASCII 仓库名：退化成稳定短哈希，避免多个项目撞成同一个 slug
  let h = 7;
  const src = String(full);
  for (let i = 0; i < src.length; i += 1) h = (h * 31 + src.charCodeAt(i)) % 1000003;
  return `p-${h.toString(36)}`;
}

/** 项目的公开访问路径 */
export const projectPath = (full) => `/p/${slugOf(full)}/`;

/** 把「GitHub 抓到的数据」和「本地覆盖配置」合成一个可渲染的项目对象 */
export function toItem(projects = {}, generated = {}, full) {
  const repo = generated.repos?.[full] || {};
  const ov = projects.overrides?.[full] || {};
  const fallbackName = String(full).split('/').pop();
  return {
    full,
    slug: slugOf(full),
    title: ov.title || repo.name || fallbackName,
    summary: ov.summary || repo.description || '还没有写简介。',
    stack: Array.isArray(ov.stack) && ov.stack.length
      ? ov.stack
      : repo.topics?.length
        ? repo.topics.slice(0, 4)
        : repo.language
          ? [repo.language]
          : [],
    cover: ov.cover || '',
    homepage: ov.homepage || repo.homepage || '',
    url: repo.htmlUrl || `https://github.com/${full}`,
    stars: repo.stars || 0,
    pushedAt: repo.pushedAt || '',
    language: repo.language || '',
    excerpt: repo.readmeExcerpt || '',
    archived: !!repo.archived,
  };
}

/** 最终要在页面上展示哪些项目（顺序、隐藏、showAll 都在这里决定） */
export function visibleProjects(projects = {}, generated = {}) {
  const { order = [], hide = [], showAll = false } = projects;
  const repos = generated.repos || {};
  const hidden = new Set(hide.map((s) => String(s).toLowerCase()));
  const seen = new Set();
  const items = [];

  for (const full of order) {
    const key = String(full).toLowerCase();
    if (hidden.has(key) || seen.has(key)) continue;
    seen.add(key);
    items.push(toItem(projects, generated, full));
  }

  if (showAll) {
    const rest = Object.keys(repos)
      .filter((k) => !seen.has(k.toLowerCase()) && !hidden.has(k.toLowerCase()))
      .sort((a, b) => String(repos[b].pushedAt || '').localeCompare(String(repos[a].pushedAt || '')));
    for (const full of rest) items.push(toItem(projects, generated, full));
  }
  return items;
}

/** 详情页用：只认真正存在过的项目（在生成数据或 overrides 里出现过） */
export function findProject(projects = {}, generated = {}, full) {
  if (!full) return null;
  const lower = String(full).toLowerCase();
  const visible = visibleProjects(projects, generated).find((p) => p.full.toLowerCase() === lower);
  if (visible) return visible;
  const hasRepo = generated.repos?.[full]?.htmlUrl;
  const hasOverride = projects.overrides?.[full]?.title;
  return hasRepo || hasOverride ? toItem(projects, generated, full) : null;
}
