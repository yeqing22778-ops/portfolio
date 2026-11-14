# 个人作品集（静态优先 · GitHub 数据 · 边缘鉴权）

一个**不需要云服务器**的个人网页：代码公开在 GitHub，站点跑在 Cloudflare Pages，
构建时自动抓取你的仓库信息，私密区由边缘函数把关。

- 公网 URL + HTTPS：平台自动提供
- 自动部署：`git push` 即上线
- 私密区：`/secret/` 需要密码，未登录看不到任何私密内容
- 密钥安全：GitHub Token 只存在于构建环境变量，永不出现在前端
- 深浅色：跟随系统 / 手动锁定，选择记在浏览器里，且不做入场淡入（内容立刻可见）
- 分享与订阅：**每个项目一个独立页面 `/p/<slug>/`**、专属分享图、`sitemap.xml`、`feed.xml`（RSS）、`robots.txt`、独立 404 页
- 无脚本可读：项目页内嵌一份静态内容，禁用 JS 或爬虫抓取也能看到简介和 README 摘要
- 笔记：`content/notes/*.md` 在构建期编译成静态页 `/notes/<slug>/`，自带 Markdown 渲染与分享图
- 图片灯箱：正文里的图片点一下全屏预览，Esc 或再点关闭
- 访问统计（可选）：Cloudflare Web Analytics，无 Cookie，默认关闭

---

## 1. 目录结构

| 路径 | 作用 |
| --- | --- |
| `index.html` | 首页：简介 + 项目卡片 |
| `project.html` | 项目详情（`?repo=owner/name`） |
| `secret/index.html` | 私密工作台（受边缘函数保护） |
| `assets/app.js` | 全部渲染逻辑（读 JSON → 画页面） |
| `assets/merge.js` | 数据合并规则（**浏览器与构建脚本共用同一份**） |
| `p/<slug>/index.html` | 构建产物：每个项目的独立页面（自动生成，别手改） |
| `p/<slug>/og.png` | 构建产物：该项目的分享预览图 |
| `content/notes/*.md` | 你写的笔记（Markdown + 头部元信息） |
| `content/notes.json` | 构建产物：笔记索引（导航、sitemap、feed 用） |
| `notes/index.html` | 构建产物：笔记列表页 |
| `notes/<slug>/` | 构建产物：单篇笔记页 + 分享图 |
| `assets/theme.js` | 主题初始化（head 里同步执行，避免闪一下） |
| `assets/lightbox.js` | 图片灯箱（事件委托，动态插入的图也能点） |
| `assets/analytics.js` | 构建产物：访问统计脚本（未开启时是无害占位） |
| `assets/favicon.svg` | 站点图标 |
| `assets/og.png` | 分享预览图（1200×630，由脚本生成） |
| `404.html` | 找不到页面时显示（Cloudflare Pages 自动使用） |
| `scripts/build-pages.mjs` | 构建期生成 `p/` 下的项目页与分享图 |
| `scripts/build-notes.mjs` | 构建期把 Markdown 编译成 `notes/` |
| `scripts/lib/markdown.mjs` | 零依赖 Markdown 渲染器（先转义再替换标记） |
| `scripts/lib/og-image.mjs` | 分享图绘制器（零依赖，按色调配色） |
| `scripts/build-site.mjs` | 构建期生成 sitemap / feed / robots |
| `scripts/make-og.mjs` | 生成分享预览图（无需联网、无依赖） |
| `styles.css` | 全站样式（跟随系统深浅色，响应式） |
| `content/profile.json` | 你的名字、简介、链接 |
| `content/projects.json` | 展示哪个项目、顺序、隐藏、文案覆盖 |
| `content/generated.json` | 构建产物快照（GitHub 数据，也是失败兜底） |
| `scripts/fetch-github.mjs` | 构建期抓 GitHub（唯一接触 Token 的地方） |
| `scripts/hash-password.mjs` | 生成密码哈希 / Cookie 密钥 |
| `functions/_middleware.js` | 私密区鉴权（登录、Cookie、限流） |
| `_routes.json` | 限定函数只在 `/secret` 下运行，其余走纯静态 |

### 路由

| 地址 | 内容 | 谁生成的 |
| --- | --- | --- |
| `/` | 首页：简介 + 关于 + 作品 + 现在 | 手写 `index.html` + `app.js` 渲染 |
| `/p/<slug>/` | 单个项目（有独立分享图与 meta） | `scripts/build-pages.mjs` |
| `/notes/` | 笔记列表 | `scripts/build-notes.mjs` |
| `/notes/<slug>/` | 单篇笔记 | `scripts/build-notes.mjs` |
| `/project.html?repo=owner/name` | 同一页面的备用入口（兼容旧链接） | 手写 `project.html` |
| `/secret/` | 私密工作台（需要密码） | `secret/index.html` + 边缘函数 |
| `/404.html` | 找不到页面 | 手写 |
| `/feed.xml` `/sitemap.xml` `/robots.txt` | 订阅、收录、爬虫规则 | `scripts/build-site.mjs` |

`slug` 的规则：`owner/repo` → 小写并把非字母数字转成 `-`，
例如 `yeqing22778-ops/calendar-site` → `yeqing22778-ops-calendar-site`。
全中文的仓库名会退化成 `p-<短哈希>`，保证不撞车。

---

## 2. 本地跑起来

```bash
# 1) 装好 Node 20+，然后在项目根目录
cp .env.example .env          # 填 GITHUB_USER，可选 GITHUB_TOKEN
export GITHUB_USER=你的用户名
export GITHUB_TOKEN=你的token

# 2) 抓一次数据（生成 content/generated.json）
npm run build

# 3) 起本地静态服务（http://localhost:8788）
npm run dev
```

> **顺序很重要**：先 `npm run build` 再 `npm run dev`。
> 因为卡片链接指向 `/p/<slug>/`，那些页面是构建时生成的——没构建过就会 404。
> 只想看首页、先不管私密区：跳过第 2 步也能跑，只是项目详情点不进去。

想看私密区（含边缘函数），用 Wrangler：

```bash
npm run preview
```

首次运行会在 `.dev.vars` 里放测试变量（不要提交，已在 `.gitignore`）：

```
SITE_PASSWORD_SHA256=...
COOKIE_SECRET=...
PRIVATE_DATA=[]
```

---

## 3. 发布到公网（一次性配置，之后全自动）

### 3.1 建 GitHub 仓库

```bash
git init
git add .
git commit -m "init: portfolio"
git branch -M main
git remote add origin https://github.com/你的用户名/你的仓库名.git
git push -u origin main
```

仓库设为 **Public**（作品集本身就该被看到；私密性靠下面的访问控制，不靠藏源码）。

### 3.2 生成私密区需要的两个值

```bash
node scripts/hash-password.mjs "你的密码"   # → SITE_PASSWORD_SHA256
node scripts/hash-password.mjs --secret     # → COOKIE_SECRET
```

### 3.3 Cloudflare Pages 接入

1. 注册/登录 <https://dash.cloudflare.com>（免费，不用绑卡）
2. **Workers & Pages → Create → Pages → Connect to Git**，选你的仓库
3. 构建设置：
   - Framework preset：**None**
   - Build command：`npm run build`
   - Build output directory：留空（站点就在根目录）
4. **Variables and Secrets** 添加：

| 变量 | 值 | 用途 |
| --- | --- | --- |
| `GITHUB_USER` | 你的 GitHub 用户名 | 构建期抓哪个账号 |
| `GITHUB_TOKEN` | fine-grained token（Public repositories: Read-only） | 提高限流额度到 5000/小时 |
| `SITE_PASSWORD_SHA256` | 3.2 生成的那串 | 私密区密码校验 |
| `COOKIE_SECRET` | 3.2 生成的那串 | 签名登录 Cookie |
| `PRIVATE_DATA` | 可选，JSON 数组字符串 | 私密区草稿内容 |

5. **Deploy**。等 1–2 分钟，会拿到 `https://你的项目.pages.dev`。
6. 打开它 → 看到作品列表 → 打开 `/secret/` → 输密码 → 看到工作台。

之后每次 `git push` 自动重新构建发布，无需任何手动操作。

### 3.4 换密码 / 重新部署

改密码：重新跑 `node scripts/hash-password.mjs "新密码"`，把新哈希填进 `SITE_PASSWORD_SHA256`，
再到 Deployments 里 **Retry deployment** 或推一个空提交。旧 Cookie 会因签名不符自动失效（若同时换了 `COOKIE_SECRET`）。

---

## 4. 日常维护：三件事

### 加一个项目
1. 编辑 `content/projects.json`，把 `owner/仓库名` 加进 `order`（顺序即展示顺序）
2. 想改文案就写进 `overrides`，格式是：

```json
"overrides": {
  "yeqing22778-ops/我的项目": {
    "title": "显示用的标题",
    "summary": "一句话说清它做什么",
    "stack": ["HTML", "JavaScript"],
    "cover": "/assets/covers/我的项目.png",
    "homepage": "https://在线预览地址"
  }
}
```

3. `git push`

> 当前 `showAll` 是 `true`：**你推上来的任何公开仓库都会自动出现在首页**，不需要手动登记。
> 想把展示权收回手里，就改成 `false`，只有 `order` 里列出的才显示。
> 有仓库暂时不想公开，加进 `hide` 数组即可。

### 写一篇笔记

在 `content/notes/` 放一个 `.md` 文件，顶上用三条 `---` 包住元信息：

```markdown
---
title: 标题（不写就用正文第一个 # 标题）
date: 2026-11-14
summary: 列表页和分享卡片上显示的一句话
draft: true   # 加这行就不发布，本地也不生成
---

正文用 Markdown 写。
```

然后 `git push`。文件名会变成网址：`my-note.md` → `/notes/my-note/`。
中文文件名会自动转成 `p-<短哈希>`，不同名字不会撞车。

支持的语法：标题、段落、粗体/斜体/删除线、行内代码、代码块、有序/无序列表、
引用、分割线、链接、图片。不支持表格和嵌套列表（需要时再补）。

### 隐藏一个项目
加进 `hide` 数组，或从 `order` 里删掉。

### 自动展示全部仓库
把 `showAll` 改成 `true`（未列出的仓库按最近更新排序补在后面）。

### 改文案 / 简介
只改 `content/profile.json`，不碰任何页面代码。可用字段：

| 字段 | 作用 | 留空会怎样 |
| --- | --- | --- |
| `name` | 站点标题、首屏大标题 | 显示成 handle |
| `url` | 线上地址，如 `https://xxx.pages.dev`（sitemap/feed 用） | 跳过 sitemap/feed 生成 |
| `handle` | 备用名字（取首字母做徽块） | — |
| `tagline` | 一句话副标题 | 不显示 |
| `avatar` | 头像地址（`/assets/me.png` 或完整 URL） | 自动用首字母徽块 |
| `status` | 状态小标签，如「正在搭第一个项目」 | 不显示 |
| `bio` | 首屏一段简介 | 不显示 |
| `about` | 「关于」区正文，空行分段 | 整个区块隐藏 |
| `now` | 「现在」区列表，支持 `{label, value}` 或纯字符串 | 整个区块隐藏 |
| `analytics` | `{ enabled, token }` 访问统计，见第 5 节 | 统计关闭 |
| `links` | 社交链接按钮 | 不显示 |
| `footer` | 页脚一句话 | 只剩年份 |

> 顺序、标题、简介、技术栈、封面都在 `projects.json` 里，页面本身不含内容。

> 顺序、标题、简介、技术栈、封面都在 `projects.json` 里，页面本身不含内容 —— 这是"内容与页面分离"的实现方式。

---

## 5. 项目独立页、分享预览、SEO 与订阅

这套东西是**构建期生成**的，你不用手写：

| 产物 | 什么时候生成 | 作用 |
| --- | --- | --- |
| `sitemap.xml` | `npm run build` | 搜索引擎收录 |
| `feed.xml` | `npm run build` | RSS 订阅（按项目最近更新排序） |
| `robots.txt` | `npm run build` | 禁爬 `/secret/`；声明 sitemap |
| `p/<slug>/index.html` | `npm run build` | 每个项目的独立页面（独立 URL + 专属 meta） |
| `p/<slug>/og.png` | `npm run build` | 该项目的分享缩略图 |
| `assets/og.png` | 手动 `npm run og`（已生成过一次） | 首页分享时的缩略图 |

**部署后要改一处域名**：三个 HTML 里的绝对地址现在是占位域名
`https://yeqing22778-ops.pages.dev`（在 `og:url` / `og:image` / `canonical` 里）。
换成你的真实域名后，分享预览图才显示得出来：

```bash
# 一次性替换（把新域名换进命令）
grep -rl "yeqing22778-ops.pages.dev" index.html project.html | xargs sed -i 's|https://yeqing22778-ops.pages.dev|https://你的域名|g'
```

同时把 `content/profile.json` 的 `url` 改成同一个域名——sitemap/feed 里的链接才会对。

**想换成自己的封面图**：直接覆盖 `assets/og.png`（建议 1200×630），不用改代码。

分享单个项目时，链接是 `https://你的域名/p/<slug>/`，
预览图是那一页自己的 `og.png`（按项目名哈希出的配色），meta 里的标题和简介也是该项目的。

**想让某个项目的分享图更具体**：把图片放到 `content/covers/<slug>.png`
（1200×630 最好），构建时会优先用它，不用改代码。

### 访问统计（可选，默认关闭）

用的是 Cloudflare Web Analytics：**不写 Cookie、不做跨站追踪**，只在页面加载时上报一次。

开启步骤：

1. Cloudflare 面板 → **Analytics & Logs → Web Analytics** → 添加站点 → 复制 **JS 片段里的 token**
2. 打开 `content/profile.json`，把 `analytics` 改成：

```json
"analytics": { "provider": "cloudflare", "enabled": true, "token": "你的token" }
```

3. `npm run build` 之后 `assets/analytics.js` 里才会带上 beacon

几点说明：

- token 是**公开标识**，不是密钥；但仍只在构建时从配置读，页面里没有硬编码
- `/secret/` 开头的路径**不统计**，私密区永远不出现
- 没开启时 `assets/analytics.js` 只写一段注释，页面照常加载它，不会产生任何请求
- 换方案（Plausible / Umami）只需改 `scripts/build-site.mjs` 里的 `writeAnalytics`

### 封面图三种模式

`content/projects.json` 里的 `coverFallback` 决定「没有封面图时显示什么」：

| 值 | 效果 | 代价 |
| --- | --- | --- |
| `letter`（默认） | 按仓库名生成稳定配色 + 首字母 | 零请求，最快 |
| `github` | 用 GitHub 的仓库社交预览图 | 每张卡一次站外请求，慢一点 |

不管哪种，图片加载失败都会自动退回首字母色块，不会开天窗。

## 6. 私密区怎么用

- 访问路径：`/secret/`
- 内容：草稿清单（来自 `PRIVATE_DATA`）+ 发布台账（所有公开仓库，标出已精选/未精选/已隐藏）
- 退出：页面底部按钮
- 有效期：7 天免登录

**为什么私密数据放在环境变量里？**
因为仓库是公开的。任何写进 `content/` 提交进 Git 的文字，在 GitHub 上都能被搜到——页面上加了锁也没用。
所以真正的敏感数据走 `PRIVATE_DATA`（环境变量，不进仓库），页面再用边缘函数在**登录后**下发。

**如果内容变多**，把 `PRIVATE_DATA` 换成 Cloudflare KV 或 D1（免费额度内），改 `functions/_middleware.js` 里取数据那几行即可。

---

## 7. 安全说明（请读一遍）

做对了什么：

- 密码只以 SHA-256 存在于环境变量，仓库里没有明文
- 登录凭证是 HMAC 签名的 HttpOnly + Secure Cookie，前端 JS 读不到
- 未登录时**响应体里没有任何私密内容**（不是"渲染完再隐藏"）
- 环境变量缺失时拒绝一切访问（fail closed）
- 单 IP 10 分钟 10 次失败即限流
- `next` 参数只允许跳回 `/secret` 内部，防开放重定向
- `_routes.json` 让公开页面完全走静态，不消耗函数额度

已知边界（心里有数就行）：

| 边界 | 说明 |
| --- | --- |
| 单一共享密码 | 没有多用户体系，也没有找回密码流程 |
| 限流是内存态 | Cloudflare 多实例部署，限流是按实例计数的软限制，不是硬防护 |
| 站内链接可见 | 首页不会链接到 `/secret/`，但路径规律容易被猜到——这正是需要密码的原因 |
| 私密区内容建议走环境变量 | 写进仓库的文件 = 公开 |
| 上游依赖 | GitHub API 若一次性故障，站点会用上一版快照继续跑（不会白屏） |

额外的一道兜底：即使 `_routes.json` 配错导致函数没被调用，私密数据也拿不到 ——
因为草稿只存在于环境变量 `PRIVATE_DATA` 里，只有「已登录」的函数才会读它，静态文件里根本没有这份数据。

---

## 8. 常见问题

| 现象 | 原因 / 处理 |
| --- | --- |
| 首页全是占位项目 | 没跑构建，或 `GITHUB_USER` 还是 `your-handle` |
| 构建日志里 `GitHub 403 / rate limit` | 没配 `GITHUB_TOKEN`，未认证只有 60 次/小时 |
| 项目详情没有 README 摘要 | 该仓库没 README，或它不在 `projects.json` 的 `order` 里（只给要展示的仓库抓 README，省额度） |
| 笔记没出现 | 文件得放在 `content/notes/` 下且是 `.md`；有 `draft: true` 会被跳过；改完要重新构建 |
| 笔记标题重复出现两次 | 正文开头的一级标题和 front matter 的 `title` 相同时，构建会自动去掉正文那个 |
| 点项目卡片 404 | 没跑 `npm run build`，`p/` 目录是空的 |
| 改了项目标题，`/p/` 页面还是旧的 | 重新 `npm run build`；CI 里每次 push 会自动跑 |
| 本地 `npm run dev` 时 `/secret/` 直接能看 | `serve` 是纯静态服务，不跑边缘函数。测私密区请用 `npm run preview`（Wrangler）或直接看线上 |
| `/secret/` 显示"私密区还没配置" | `SITE_PASSWORD_SHA256` / `COOKIE_SECRET` 没设，或设了没重新部署 |
| 输对密码又跳回登录页 | 浏览器禁用了 Cookie，或访问的是 `http://` 而非 `https://`（Cookie 带 Secure） |
| 分享到聊天软件没有预览图 | 三个 HTML 里的域名还是占位值；改成真实域名并确认 `/assets/og.png` 能直接打开 |
| `/feed.xml` 是 404 | 没跑 `npm run build`，或 `profile.json` 里没填 `url` |
| 改完 `projects.json` 页面没变 | 缓存，或没推代码；Cloudflare 只在你 push 后重新构建 |

---

## 9. 验收清单（上线后逐条打勾）

**A. 能发布**
- [ ] 手机用流量（不连 Wi-Fi）打开公网 URL 正常
- [ ] HTTPS 无警告
- [ ] `git push` 后几分钟内站点自动更新
- [ ] Cloudflare 面板能看到历史部署并可回滚

**B. 接进 GitHub**
- [ ] 首页 ≥3 张项目卡片，含标题、简介、技术栈、GitHub 链接
- [ ] 详情页有 README 摘要、仓库链接
- [ ] 加项目只改 `content/projects.json`，不动页面代码
- [ ] 前端源码/网络请求里搜不到 Token
- [ ] 断网跑构建 → 站点仍能发布（走快照）

**C. 私密性**
- [ ] 匿名访问 `/secret/` 只看到登录页
- [ ] 登录页的 HTML 源码里没有任何私密内容
- [ ] 未登录请求 `/secret/data` 返回 401
- [ ] 直接输入 `/secret/index.html` 也需要密码
- [ ] GitHub 仓库里搜不到真实密码、Token、草稿内容

**D. 项目独立页**
- [ ] 点首页任意卡片，地址是 `/p/<slug>/` 而不是带 `?repo=` 的
- [ ] 该项目页地址栏复制出去，别人能打开
- [ ] 页头标题、简介与该项目对应（不是站点通用文案）
- [ ] 禁用 JavaScript 后刷新，仍能看到标题、简介和 README 摘要
- [ ] `/p/<slug>/og.png` 能直接打开，是 1200×630 的图

**E. 笔记**
- [ ] `/notes/` 能打开，列出所有笔记，新的在上
- [ ] 点进单篇，标题和日期正确，Markdown 正常（粗体/代码块/列表都对）
- [ ] 草稿（`draft: true`）不出现，也访问不到
- [ ] 正文里写的 `<script>` 只是文字，没有被执行
- [ ] 有笔记时头部出现「笔记」入口；一篇都没有时不显示

**F. 交互**
- [ ] 笔记里的图片点一下能全屏放大，Esc 或再点一下能关掉
- [ ] 图片在链接里时，点击走链接、不弹灯箱
- [ ] 灯箱打开时背景页面不跟着滚动
- [ ] 开了访问统计后，Cloudflare 后台能看到访问数；`/secret/` 的访问不计入

**G. 分享与订阅**
- [ ] 浏览器打开 `/assets/og.png` 能看到预览图
- [ ] `/feed.xml`、`/sitemap.xml`、`/robots.txt` 都能直接访问
- [ ] 随便输一个不存在的地址，出现 404 页而不是平台默认页
- [ ] 把首页链接发到聊天软件，能看到标题+缩略图

**H. 可迭代**
- [ ] 手机竖屏阅读无横向滚动
- [ ] 4G 下首屏 3 秒内出现内容
- [ ] 改文案只碰 `content/*.json`
- [ ] README 里的步骤能让别人（或三个月后的你）重新跑起来

---

## 10. 迭代路线图与迭代协议

### 10.1 下一阶段优先级

| 优先级 | 功能 | 为什么现在做/不做 |
| --- | --- | --- |
| ~~P0~~ ✅ | ~~按项目生成独立页面（专属分享图 + 独立 URL）~~ | 已完成：`p/<slug>/` + 每页专属 `og.png` |
| ~~P1~~ ✅ | ~~文章 / 笔记页（Markdown → 静态页）~~ | 已完成：`content/notes/*.md` → `/notes/<slug>/` |
| P1 | 封面图本地化（`assets/covers/`） | 不再依赖站外图片，加载更快 |
| ~~P2~~ ✅ | ~~访问统计（Cloudflare Web Analytics）~~ | 已完成：`analytics` 配置 + 构建期生成 |
| ~~P2~~ ✅ | ~~详情页多图 / 灯箱~~ | 已完成：`assets/lightbox.js` |
| P3 | 站内搜索（客户端索引） | 项目到十几个才有意义 |
| P3 | 评论（giscus，基于 GitHub Issues） | 有真实流量再说，否则是负担 |

**可选增强（想做时再说，都不影响现有结构）：**

- 绑定自定义域名（Cloudflare 免费）
- 加 `_headers` 收紧安全响应头（CSP、X-Frame-Options）
- 用 Cloudflare Access 替代密码登录（邮箱验证码，代码不用改）
- 私密数据从环境变量迁到 KV / D1（内容变多时）

### 10.2 每次迭代固定输出四段

| 段落 | 内容 | 例子 |
| --- | --- | --- |
| 变更清单 | 做了什么、为什么 | 新增按项目生成页面 |
| 影响文件 | 新增 / 修改 / 删除的完整路径 | `+ scripts/build-pages.mjs`、`~ assets/app.js` |
| 测试点 | 怎么验，包含「失败应该长什么样」 | 访问 `/p/xxx/` 返回 200；预览图抓取显示项目名 |
| 回滚方式 | 一条命令或一次部署回退 | `git revert <sha>`，或 Cloudflare → Deployments → 选上一版 |

### 10.3 迭代约定

- 只做增量，不重写已通过验收的部分
- 新增配置一律进 `content/*.json`，不写死在代码里
- 数据结构变更必须同时给迁移说明
- 每次改完跑既有回归（页面功能 33 项 + 中间件 19 项），结果写进变更清单

## 11. 风险与成本

| 风险 | 会怎样 | 现在怎么防 | 成本 |
| --- | --- | --- | --- |
| Token 泄露 | 额度被盗用，甚至能读私有仓 | 只在构建期读环境变量；fine-grained 最小权限；不进前端、不进仓库 | 免费 |
| 私有仓库被误展示 | 敏感项目外泄 | 抓取走 `/users/{you}/repos`（只返回公开仓）；私密内容只放环境变量 | 免费 |
| 未公开项目上首页 | 半成品被人看到 | `hide` 数组 + 只抓公开仓 | 免费 |
| GitHub API 限流 | 构建抓不到数据 | 未认证 60 次/小时、认证 5000 次/小时；失败自动回退上一版快照 | 免费 |
| 私密路径被搜索引擎收录 | `/secret/` 出现在搜索结果 | `noindex` + `robots.txt` + `no-referrer`；未登录时响应里没有私密内容 | 免费 |
| 免费额度不够用 | 构建或函数停止 | 500 构建/月；函数只在 `/secret` 触发；静态资源不走函数 | 免费档对个人站够用 |
| 源码公开 | 别人能看到实现细节 | 作品集本就该公开；真正的秘密不进仓库 | 免费 |
| 想用私有仓库 + GitHub Pages | GitHub Pages 免费版只能发布公开仓 | 换 Cloudflare Pages（免费支持私有仓构建） | 私有仓 + GH Pages 需 GitHub Pro（约 $4/月）；Cloudflare Pages 免费 |
| 想加整站密码 | 需要付费方案 | **不做整站密码**——作品页就是要给人看的 | Netlify / Vercel 的密码保护在付费档；Cloudflare Access 免费版可用（50 用户额度） |
| 单点依赖平台 | 平台改规则/停服 | 全部是静态文件 + 一份 JSON，换平台只需重配部署 | 免费 |

## 12. 新窗口交接说明

如果换了对话窗口、没有上下文，按这个顺序读：

1. `README.md`（本文件）—— 结构、部署、维护、风险
2. `content/profile.json` 与 `content/projects.json` —— 内容和展示规则
3. `assets/app.js` —— 所有渲染逻辑
4. `functions/_middleware.js` —— 私密区鉴权
5. `scripts/fetch-github.mjs` / `build-site.mjs` —— 构建期数据与站点文件

然后再动代码。**先跑一遍 `npm run build` 和本地预览，确认基线是好的，再做增量。**
