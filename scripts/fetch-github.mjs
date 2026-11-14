#!/usr/bin/env node
/**
 * 构建期脚本：抓取 GitHub 公开仓库数据 → content/generated.json
 *
 * 设计原则
 *  1. 这是唯一接触 GITHUB_TOKEN 的地方；Token 只从环境变量读，绝不写进产物。
 *  2. 任何失败都不阻断构建：保留仓库里上一版快照（兜底），退出码始终 0。
 *  3. 只抓「公开」数据；不抓私有仓库、不抓用户信息。
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const GENERATED = path.join(ROOT, 'content', 'generated.json');
const PROJECTS = path.join(ROOT, 'content', 'projects.json');
const API = (process.env.GITHUB_API_BASE || 'https://api.github.com').replace(/\/+$/, '');
const TOKEN = (process.env.GITHUB_TOKEN || '').trim();

function headers(asRaw) {
  const h = {
    'User-Agent': 'personal-portfolio-build',
    'X-GitHub-Api-Version': '2022-11-28',
    Accept: asRaw ? 'application/vnd.github.raw' : 'application/vnd.github+json',
  };
  if (TOKEN) h.Authorization = `Bearer ${TOKEN}`;
  return h;
}

async function gh(url, { raw = false } = {}) {
  const res = await fetch(url, { headers: headers(raw) });
  const remaining = res.headers.get('x-ratelimit-remaining');
  if (remaining !== null) console.log(`[build] GitHub 剩余额度: ${remaining}`);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GitHub ${res.status} ${url} ${body.slice(0, 180)}`);
  }
  return raw ? res.text() : res.json();
}

/** 把 README 压成一段纯文本摘要（不注入 HTML，前端只当文字用） */
function excerpt(markdown, max = 700) {
  if (!markdown) return '';
  let text = markdown.replace(/<!--[\s\S]*?-->/g, '');
  if (/^---\n[\s\S]*?\n---/.test(text)) text = text.replace(/^---\n[\s\S]*?\n---/, '');
  const keep = [];
  let inFence = false;
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (/^```/.test(line) || /^~~~/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (!line) {
      if (keep.length && keep[keep.length - 1] !== '') keep.push('');
      continue;
    }
    if (/^!\[/.test(line)) continue;                 // 图片
    if (/shields\.io|badge|img\.shields|visitor-badge/i.test(line)) continue;
    if (/^#{1,6}\s/.test(line)) continue;            // 标题
    if (/^<\/?(p|div|br|img|a|h[1-6]|table|tr|td)\b/i.test(line)) continue;
    if (/^\[!\[/.test(line)) continue;
    keep.push(
      line
        .replace(/^[-*+]\s+/, '· ')
        .replace(/^\d+\.\s+/, '· ')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')     // 链接留文字
        .replace(/[*_`~]{1,3}/g, '')                 // 强调符号
        .replace(/\|/g, ' ')
    );
  }
  let body = keep.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (body.length > max) {
    body = body.slice(0, max);
    const cut = Math.max(body.lastIndexOf('。'), body.lastIndexOf('. '), body.lastIndexOf('\n'));
    if (cut > max * 0.5) body = body.slice(0, cut + 1);
    body += '…';
  }
  return body;
}

async function main() {
  const projects = JSON.parse(await readFile(PROJECTS, 'utf8').catch(() => '{}'));
  const user = (process.env.GITHUB_USER || projects.owner || '').trim();
  if (!user || user === 'your-handle') {
    console.warn('[build] 跳过抓取：还没有设置 GITHUB_USER（或仍是占位值 your-handle）');
    return;
  }
  console.log(`[build] 目标用户: ${user}${TOKEN ? '（已认证）' : '（未认证，限流 60 次/小时）'}`);

  const repos = await gh(`${API}/users/${encodeURIComponent(user)}/repos?per_page=100&sort=pushed&type=owner`);
  if (!Array.isArray(repos)) throw new Error('返回格式异常');
  const live = repos.filter((r) => !r.fork);

  const wantedReadme = new Set((projects.order || []).map((s) => String(s).toLowerCase()));
  const out = {};

  for (const r of live) {
    const full = r.full_name;
    const item = {
      name: r.name,
      full,
      description: r.description || '',
      htmlUrl: r.html_url,
      homepage: r.homepage || '',
      stars: r.stargazers_count || 0,
      forks: r.forks_count || 0,
      language: r.language || '',
      topics: Array.isArray(r.topics) ? r.topics.slice(0, 8) : [],
      pushedAt: r.pushed_at || '',
      updatedAt: r.updated_at || '',
      archived: !!r.archived,
      readmeExcerpt: '',
    };
    if (wantedReadme.has(full.toLowerCase())) {
      try {
        item.readmeExcerpt = excerpt(await gh(`${API}/repos/${full}/readme`, { raw: true }));
      } catch (err) {
        console.warn(`[build] README 抓取失败 ${full}: ${err.message}`);
      }
    }
    out[full] = item;
  }

  if (!Object.keys(out).length) {
    console.warn('[build] 没有抓到任何仓库，保留上一版快照');
    return;
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    source: 'github',
    user,
    repos: out,
  };
  await writeFile(GENERATED, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  console.log(`[build] 写入 ${Object.keys(out).length} 个仓库 → content/generated.json`);
}

main().catch((err) => {
  // 兜底：构建永远成功，用仓库里上一版 generated.json
  console.warn(`[build] 抓取失败，继续使用仓库内快照：${err.message}`);
  process.exitCode = 0;
});
