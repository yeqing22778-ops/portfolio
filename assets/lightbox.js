/**
 * 图片灯箱：点正文里的图 → 全屏预览；再点一下 / Esc 关闭。
 *
 * 用事件委托挂在 document 上，所以渲染后动态插入的图片也能用。
 * 不劫持链接里的图片（那种情况点击应该去链接指向的地方）。
 */
const OVERLAY_ID = 'pf-lightbox';
const DEFAULT_SELECTOR = '.prose img, [data-zoom]';

function hasDom() {
  return typeof document !== 'undefined' && typeof document.createElement === 'function';
}

export function closeLightbox() {
  if (!hasDom()) return;
  const overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) return;
  const restoreFocus = overlay.__returnFocus;
  overlay.remove();
  document.body.classList.remove('lightbox-open');
  if (restoreFocus && typeof restoreFocus.focus === 'function') restoreFocus.focus();
}

export function openLightbox(src, alt = '') {
  if (!hasDom() || !src) return null;
  if (document.getElementById(OVERLAY_ID)) closeLightbox();

  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.className = 'lightbox';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', alt ? `图片：${alt}` : '图片预览');

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'lightbox-close';
  close.setAttribute('aria-label', '关闭');
  close.textContent = '✕';

  const img = document.createElement('img');
  img.className = 'lightbox-img';
  img.src = src;
  img.alt = alt;

  overlay.append(close, img);
  overlay.__returnFocus = document.activeElement;
  document.body.appendChild(overlay);
  document.body.classList.add('lightbox-open');
  close.focus();

  overlay.addEventListener('click', (event) => {
    // 点空白处、点关闭按钮、点图片本身都关闭；给「看图」留个全屏观感
    if (event.target === overlay || event.target === close || event.target === img) closeLightbox();
  });

  return overlay;
}

let bound = false;

/** 只在页面生命周期里调一次 */
export function wireLightbox({ root, selector = DEFAULT_SELECTOR } = {}) {
  if (!hasDom()) return;
  const host = root || document;
  if (bound) return;
  bound = true;

  host.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeLightbox();
  });

  host.addEventListener('click', (event) => {
    const target = event.target;
    if (!target || target.tagName !== 'IMG') return;
    if (!target.matches || !target.matches(selector)) return;
    if (target.closest('a')) return;          // 图片在链接里：交给链接
    event.preventDefault();
    openLightbox(target.currentSrc || target.src, target.alt || '');
  });
}
