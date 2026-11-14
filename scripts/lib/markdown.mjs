/**
 * 极简 Markdown 渲染器（无依赖，构建期用）
 *
 * 安全原则：先整体转义 HTML，再做标记替换 —— 原文里的 <script> 只会变成文字。
 * 支持：标题(1-6)、段落、粗体、斜体、行内代码、代码块、列表、引用、分割线、
 *      链接、图片、换行。不支持表格/脚注/嵌套列表（用到时再补）。
 */

const esc = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** 只允许安全协议，挡掉 javascript: 之类 */
function safeUrl(url) {
  const u = String(url || '').trim();
  if (/^(https?:|mailto:|tel:|\/|#|\.\/|\.\.\/)/i.test(u)) return u;
  return '#';
}

/** 标题锚点：英文数字保留，中文去掉只留短哈希 */
export function anchorOf(text) {
  const base = String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  const ascii = base.replace(/[^a-z0-9-]/g, '');
  if (ascii.length >= 2) return ascii.replace(/-+/g, '-').replace(/^-|-$/g, '');
  let h = 7;
  for (let i = 0; i < String(text).length; i += 1) h = (h * 31 + String(text).charCodeAt(i)) % 1000003;
  return `h-${h.toString(36)}`;
}

/** 行内标记：行内代码 → 粗体 → 斜体 → 删除线 → 图片 → 链接 */
function inline(text) {
  let s = text;

  // 行内代码先抽出来，避免里面的符号被当成格式
  const codes = [];
  // 注意：传进来的 text 已经过 esc()，这里不能再转义，否则会出现 &amp;lt; 的双重转义
  s = s.replace(/`([^`]+)`/g, (_, code) => {
    codes.push(`<code>${code}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });

  s = s
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    // 用断言代替「前面必须是空格」：中文标点后也能识别，同时不会吃掉 **粗体** 的星号
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>')
    .replace(/(?<![_\w])_([^_\n]+)_(?![_\w])/g, '<em>$1</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, src) => `<img src="${safeUrl(src)}" alt="${alt}" loading="lazy">`)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => `<a href="${safeUrl(href)}">${label}</a>`);

  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => codes[Number(i)]);
}

/** 主入口：markdown 文本 → HTML 片段 */
export function renderMarkdown(md = '') {
  const lines = String(md).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;

  const flushParagraph = (buf) => {
    if (!buf.length) return;
    out.push(`<p>${inline(buf.map((l) => esc(l)).join('\n')).replace(/\n/g, '<br>')}</p>`);
    buf.length = 0;
  };

  let para = [];

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trimEnd();

    // 代码块
    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      flushParagraph(para);
      const lang = fence[1];
      const code = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        code.push(lines[i]);
        i += 1;
      }
      i += 1; // 跳过结束栅栏
      const cls = lang ? ` class="language-${esc(lang)}"` : '';
      out.push(`<pre><code${cls}>${esc(code.join('\n'))}</code></pre>`);
      continue;
    }

    // 空行
    if (!line.trim()) {
      flushParagraph(para);
      i += 1;
      continue;
    }

    // 分割线
    if (/^(\*{3,}|-{3,}|_{3,})\s*$/.test(line.trim())) {
      flushParagraph(para);
      out.push('<hr>');
      i += 1;
      continue;
    }

    // 标题
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushParagraph(para);
      const level = heading[1].length;
      const text = heading[2].trim();
      out.push(`<h${level} id="${anchorOf(text)}">${inline(esc(text))}</h${level}>`);
      i += 1;
      continue;
    }

    // 引用（连续行合并）
    if (/^>\s?/.test(line)) {
      flushParagraph(para);
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(esc(lines[i].replace(/^>\s?/, '')));
        i += 1;
      }
      out.push(`<blockquote><p>${inline(buf.join('\n')).replace(/\n/g, '<br>')}</p></blockquote>`);
      continue;
    }

    // 列表（只支持单层）
    const ulItem = line.match(/^\s*[-*+]\s+(.*)$/);
    const olItem = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ulItem || olItem) {
      flushParagraph(para);
      const ordered = !!olItem;
      const buf = [];
      const pick = (l) => (ordered ? l.match(/^\s*\d+[.)]\s+(.*)$/) : l.match(/^\s*[-*+]\s+(.*)$/));
      while (i < lines.length) {
        const m = pick(lines[i]);
        if (!m) break;
        buf.push(`<li>${inline(esc(m[1]))}</li>`);
        i += 1;
      }
      out.push(ordered ? `<ol>${buf.join('')}</ol>` : `<ul>${buf.join('')}</ul>`);
      continue;
    }

    // 普通段落行
    para.push(line);
    i += 1;
  }

  flushParagraph(para);
  return out.join('\n');
}

/** 解析文章头部的 --- 区段（只支持 key: value 单行） */
export function parseFrontMatter(text = '') {
  const src = String(text).replace(/\r\n?/g, '\n');
  const m = src.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { data: {}, body: src.trim() };

  const data = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!kv) continue;
    let value = kv[2].trim();
    if (/^["'].*["']$/.test(value)) value = value.slice(1, -1);
    if (value === 'true') data[kv[1]] = true;
    else if (value === 'false') data[kv[1]] = false;
    else data[kv[1]] = value;
  }
  return { data, body: src.slice(m[0].length).trim() };
}

/** 纯文本摘要（用于列表页和 meta description） */
export function plainSummary(md = '', max = 120) {
  const text = String(md)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_`>~#-]/g, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
