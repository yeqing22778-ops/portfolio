#!/usr/bin/env node
/**
 * 生成站点默认分享图 assets/og.png
 * 用法：npm run og    （想用自己的图，直接覆盖 assets/og.png 即可）
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { renderOgImage } from './lib/og-image.mjs';

const png = renderOgImage({ tone: 0 });
mkdirSync('assets', { recursive: true });
writeFileSync('assets/og.png', png);
console.log(`assets/og.png 已生成：1200×630，${(png.length / 1024).toFixed(1)} KB`);
