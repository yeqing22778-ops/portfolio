/**
 * 渲染层：读 content/*.json → 画页面。
 * 这里没有任何密钥；所有数据来自构建期生成的静态 JSON。
 * 数据合并规则在 assets/merge.js，构建脚本也用同一份。
 */
import { initialOf, toneOf, projectPath, visibleProjects, findProject } from './merge.js';
import { wireLightbox } from './lightbox.js';

const esc = (value = '') =>
  String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function getJSON(url, fallback) {
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`${url} → ${res.status}`);
    return await res.json();
  } catch (err) {
    if (fallback !== undefined) return fallback;
    throw err;
  }
}

const state = {
  page: document.body.dataset.page || 'home',
  profile: { name: '', tagline: '', bio: '', about: '', now: [], links: [], footer: '' },
  projects: { order: [], overrides: {}, hide: [], showAll: false },
  generated: { repos: {}, source: 'placeholder', generatedAt: null },
  notes: { notes: [] },
};

const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
};

/* ── 头部 / 页脚 ───────────────────────────────────────── */
const THEME_ICON = { auto: '◐', light: '☀', dark: '☾' };
const THEME_LABEL = { auto: '跟随系统', light: '浅色', dark: '深色' };

function renderHeader() {
  const el = document.querySelector('[data-header]');
  if (!el) return;
  const { name = '', links = [] } = state.profile;
  const github = links.find((l) => /github/i.test(l.label || ''));
  el.innerHTML = `
    <a class="brand" href="/">${esc(name)}</a>
    <div class="header-right">
      <nav class="site-nav">
        <a href="/#work">作品</a>
        ${state.notes.notes?.length ? '<a href="/notes/">笔记</a>' : ''}
        ${github ? `<a class="nav-github" href="${esc(github.url)}" target="_blank" rel="noopener">GitHub ↗</a>` : ''}
      </nav>
      <button class="theme-toggle" type="button" data-theme-toggle aria-label="切换主题"></button>
    </div>`;

  const btn = el.querySelector('[data-theme-toggle]');
  const api = globalThis.__pfTheme;
  if (btn && api) {
    const paint = () => {
      const mode = api.get();
      btn.textContent = THEME_ICON[mode] || '◐';
      btn.title = `主题：${THEME_LABEL[mode] || '跟随系统'}`;
    };
    paint();
    btn.addEventListener('click', () => {
      api.cycle();
      paint();
    });
  } else if (btn) {
    btn.remove();
  }
}

function renderFooter() {
  const el = document.querySelector('[data-footer]');
  if (!el) return;
  const year = new Date().getFullYear();
  const stamp = state.generated.generatedAt
    ? `<span class="footer-meta">数据更新于 ${esc(fmtDate(state.generated.generatedAt))}</span>`
    : '';
  el.innerHTML = `
    <div class="wrap footer-inner">
      <span>${esc(state.profile.footer || '')} · ${year}</span>
      ${stamp}
    </div>`;
}

/* ── 首屏 ─────────────────────────────────────────────── */
function heroHtml() {
  const { name = '', handle = '', tagline = '', bio = '', avatar = '', status = '', links = [] } = state.profile;
  const badge = avatar
    ? `<img class="avatar" src="${esc(avatar)}" alt="${esc(name)}" width="64" height="64" loading="lazy">`
    : `<div class="monogram" aria-hidden="true">${esc(initialOf(name || handle))}</div>`;

  return `
    <section class="hero-wrap">
      <div class="hero">
        ${badge}
        <div>
          <h1>
            ${esc(name)}
            ${status ? `<span class="status">${esc(status)}</span>` : ''}
          </h1>
          ${tagline ? `<p class="tagline">${esc(tagline)}</p>` : ''}
          ${bio ? `<p class="bio">${esc(bio)}</p>` : ''}
          ${links.length
            ? `<ul class="links">${links.map((l) => `<li><a href="${esc(l.url)}"${/^https?:/.test(l.url) ? ' target="_blank" rel="noopener"' : ''}>${esc(l.label)}</a></li>`).join('')}</ul>`
            : ''}
        </div>
      </div>
    </section>`;
}

function aboutHtml() {
  const raw = String(state.profile.about || '').trim();
  if (!raw) return '';
  const paragraphs = raw.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return `
    <section id="about">
      <div class="section-head"><h2>关于</h2></div>
      <div class="about">${paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}</div>
    </section>`;
}

function nowHtml() {
  const list = Array.isArray(state.profile.now) ? state.profile.now : [];
  if (!list.length) return '';
  const rows = list
    .map((entry) => {
      if (typeof entry === 'string') return `<li><span>${esc(entry)}</span></li>`;
      return `<li>${entry.label ? `<b>${esc(entry.label)}</b>` : ''}<span>${esc(entry.value || '')}</span></li>`;
    })
    .join('');
  return `
    <section id="now">
      <div class="section-head"><h2>现在</h2><span>随手更新</span></div>
      <ul class="now-list">${rows}</ul>
    </section>`;
}

/** 封面：优先用配置的图，其次可选用 GitHub 社交预览图，最后退回首字母色块 */
function coverHtml(item) {
  const tone = toneOf(item.full);
  const letter = initialOf(item.title);
  const src = item.cover
    || (state.projects.coverFallback === 'github' ? `https://opengraph.githubassets.com/1/${item.full}` : '');
  if (!src) return `<div class="cover tone-${tone}" aria-hidden="true">${esc(letter)}</div>`;
  return `<img class="cover" src="${esc(src)}" alt="${esc(item.title)} 封面" loading="lazy" data-tone="${tone}" data-letter="${esc(letter)}">`;
}

/** 图片挂了就换成色块，别让卡片开天窗 */
function wireCoverFallbacks(root) {
  if (typeof root.querySelectorAll !== 'function' || typeof document.createElement !== 'function') return;
  root.querySelectorAll('img.cover[data-tone]').forEach((img) => {
    img.addEventListener('error', () => {
      const div = document.createElement('div');
      div.className = `cover tone-${img.dataset.tone}`;
      div.setAttribute('aria-hidden', 'true');
      div.textContent = img.dataset.letter || '';
      img.replaceWith(div);
    }, { once: true });
  });
}

function cardHtml(item) {
  const cover = coverHtml(item);
  const chips = item.stack.length
    ? `<ul class="chips">${item.stack.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>`
    : '';
  const href = projectPath(item.full);

  return `
    <li class="card">
      ${cover}
      <div class="card-body">
        <a class="card-title" href="${href}">${esc(item.title)}</a>
        <p class="card-summary">${esc(item.summary)}</p>
        ${chips}
      </div>
      <div class="card-foot">
        <a href="${esc(item.url)}" target="_blank" rel="noopener">GitHub ↗</a>
        <span>${item.stars ? `★ ${item.stars}` : fmtDate(item.pushedAt)}</span>
      </div>
    </li>`;
}

function renderHome() {
  const root = document.querySelector('[data-page-root]');
  if (!root) return;
  const items = visibleProjects(state.projects, state.generated);

  const cards = items.length
    ? items.map(cardHtml).join('')
    : `<li class="placeholder-card">
        <strong>作品筹备中</strong>
        ${state.projects.showAll === false
          ? '在 content/projects.json 的 order 里加上 owner/repo，它就会出现在这里。'
          : '往 GitHub 推一个仓库，下次构建自动出现在这里。'}
      </li>`;

  const notice = state.generated.source === 'placeholder'
    ? `<p class="notice">当前是占位数据（还没跑构建脚本）。设置 GITHUB_USER 后执行 <code>npm run build</code>，这里会换成真实仓库信息。</p>`
    : '';

  root.innerHTML = `
    ${heroHtml()}
    ${aboutHtml()}
    <section id="work">
      <div class="section-head">
        <h2>作品</h2>
        <span>${items.length ? `${items.length} 项` : '筹备中'}</span>
      </div>
      <ul class="grid">${cards}</ul>
      ${notice}
    </section>
    ${nowHtml()}`;

  wireCoverFallbacks(root);
}

/* ── 详情页 ───────────────────────────────────────────── */
function renderProject() {
  const root = document.querySelector('[data-page-root]');
  if (!root) return;
  const full = document.body.dataset.repo
    || new URLSearchParams(location.search).get('repo')
    || '';
  const known = findProject(state.projects, state.generated, full);

  if (!known) {
    root.innerHTML = `
      <p class="crumbs"><a href="/">首页</a> / 未找到</p>
      <p class="empty">没有找到这个项目。可能链接不完整，或者它已经被隐藏了。</p>
      <p><a class="back" href="/">← 返回作品列表</a></p>`;
    return;
  }

  document.title = `${known.title} · ${state.profile.name || '作品集'}`;

  const paragraphs = String(known.excerpt || '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('');

  const stackHasLang = known.language
    && known.stack.some((s) => String(s).toLowerCase() === known.language.toLowerCase());

  const meta = [
    known.language && !stackHasLang ? `<span>${esc(known.language)}</span>` : '',
    known.stars ? `<span>★ ${known.stars}</span>` : '',
    known.pushedAt ? `<span>更新于 ${esc(fmtDate(known.pushedAt))}</span>` : '',
    known.archived ? '<span>已归档</span>' : '',
  ].filter(Boolean).join('');

  const list = visibleProjects(state.projects, state.generated);
  const index = list.findIndex((p) => p.full.toLowerCase() === known.full.toLowerCase());
  const prev = index > 0 ? list[index - 1] : null;
  const next = index >= 0 && index < list.length - 1 ? list[index + 1] : null;
  const pager = prev || next
    ? `<nav class="pager">
        ${prev ? `<a href="${projectPath(prev.full)}"><span>← 上一个</span><b>${esc(prev.title)}</b></a>` : '<span></span>'}
        ${next ? `<a class="next" href="${projectPath(next.full)}"><span>下一个 →</span><b>${esc(next.title)}</b></a>` : '<span></span>'}
      </nav>`
    : '';

  root.innerHTML = `
    <p class="crumbs"><a href="/">首页</a> / <a href="/#work">作品</a> / ${esc(known.title)}</p>
    <article class="detail">
      <h1>${esc(known.title)}</h1>
      <p class="lead">${esc(known.summary)}</p>
      ${known.stack.length ? `<ul class="chips" style="margin-top:16px">${known.stack.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
      ${meta ? `<div class="meta-row">${meta}</div>` : ''}
      ${paragraphs
        ? `<div class="excerpt">${paragraphs}</div>`
        : '<p class="notice">这个仓库还没有 README，或者构建时没抓到。</p>'}
      <div class="cta-row">
        <a class="btn" href="${esc(known.url)}" target="_blank" rel="noopener">查看仓库 ↗</a>
        ${known.homepage ? `<a class="btn ghost" href="${esc(known.homepage)}" target="_blank" rel="noopener">在线预览 ↗</a>` : ''}
      </div>
    </article>
    ${pager}`;
}

/* ── 私密区工作台 ─────────────────────────────────────── */
async function renderSecret() {
  const root = document.querySelector('[data-page-root]');
  if (!root) return;

  const curated = new Set((state.projects.order || []).map((s) => String(s).toLowerCase()));
  const hiddenSet = new Set((state.projects.hide || []).map((s) => String(s).toLowerCase()));
  const repos = Object.entries(state.generated.repos || {}).sort((a, b) =>
    String(b[1].pushedAt || '').localeCompare(String(a[1].pushedAt || '')));

  const ledger = repos.length
    ? repos.map(([full, r]) => {
        const key = full.toLowerCase();
        const badge = hiddenSet.has(key)
          ? '<span class="badge">已隐藏</span>'
          : curated.has(key)
            ? '<span class="badge on">已精选</span>'
            : '<span class="badge">未精选</span>';
        return `<li>
          <a href="${esc(r.htmlUrl || `https://github.com/${full}`)}" target="_blank" rel="noopener">${esc(full)}</a>
          ${badge}
          <span class="grow">${esc(r.language || '—')} · ${esc(fmtDate(r.pushedAt) || '无更新记录')}${r.stars ? ` · ★ ${r.stars}` : ''}</span>
        </li>`;
      }).join('')
    : '<li class="empty">没有仓库数据。先跑一次 npm run build。</li>';

  const draftsRes = await getJSON('/secret/data', { drafts: [] });
  const drafts = Array.isArray(draftsRes?.drafts) ? draftsRes.drafts : [];
  const draftList = drafts.length
    ? `<ul class="ledger">${drafts.map((d) => `<li>
        <span>${esc(d.title || '未命名')}</span>
        <span class="grow">${esc(d.note || '')}</span>
        ${d.url ? `<a href="${esc(d.url)}" target="_blank" rel="noopener">打开 ↗</a>` : ''}
      </li>`).join('')}</ul>`
    : '<p class="empty">草稿区是空的。在 Cloudflare 的 PRIVATE_DATA 环境变量里放一个 JSON 数组就能出现在这里。</p>';

  root.innerHTML = `
    <div class="section-head" style="margin-top:0">
      <h2>私密工作台</h2>
      <span>只有登录后可见</span>
    </div>
    <section>
      <div class="section-head" style="margin-top:32px">
        <h2>草稿</h2>
        <span>来自环境变量 PRIVATE_DATA</span>
      </div>
      ${draftList}
    </section>
    <section>
      <div class="section-head">
        <h2>发布台账</h2>
        <span>共 ${repos.length} 个公开仓库</span>
      </div>
      <ul class="ledger">${ledger}</ul>
      <p class="notice">要把某个仓库放进首页：把它的 <code>owner/name</code> 加到 <code>content/projects.json</code> 的 <code>order</code> 里，推一次代码就好。</p>
    </section>
    <form class="logout" method="POST" action="/secret/logout">
      <button type="submit">退出登录</button>
    </form>`;
}

/* ── 启动 ─────────────────────────────────────────────── */
async function init() {
  const [profile, projects, generated, notes] = await Promise.all([
    getJSON('/content/profile.json', {}),
    getJSON('/content/projects.json', {}),
    getJSON('/content/generated.json', { repos: {} }),
    getJSON('/content/notes.json', { notes: [] }),
  ]);
  Object.assign(state.profile, profile);
  Object.assign(state.projects, projects);
  Object.assign(state.generated, generated, { repos: generated?.repos || {} });
  Object.assign(state.notes, notes, { notes: notes?.notes || [] });

  renderHeader();
  renderFooter();
  wireLightbox();   // 图片灯箱：委托在 document 上，后渲染的图也能点

  if (state.page === 'home') {
    renderHome();
    if (state.profile.name) {
      document.title = state.profile.tagline
        ? `${state.profile.name} · ${state.profile.tagline}`
        : state.profile.name;
    }
  } else if (state.page === 'project') {
    renderProject();
  } else if (state.page === 'secret') {
    await renderSecret();
  }
}

init().catch((err) => {
  const root = document.querySelector('[data-page-root]');
  if (root) root.innerHTML = `<p class="empty">页面加载失败：${esc(err.message)}</p>`;
  console.error(err);
});
