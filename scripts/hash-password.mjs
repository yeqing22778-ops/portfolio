#!/usr/bin/env node
/**
 * 小工具：
 *   node scripts/hash-password.mjs "你的密码"   → 输出 SHA-256，填到 SITE_PASSWORD_SHA256
 *   node scripts/hash-password.mjs --secret     → 生成一个随机的 COOKIE_SECRET
 *
 * 密码本身不会被保存：环境变量里只有它的哈希，签 Cookie 用的是另一个密钥。
 */
import { createHash, randomBytes } from 'node:crypto';

const arg = process.argv.slice(2).join(' ').trim();

if (arg === '--secret') {
  console.log(randomBytes(32).toString('hex'));
  process.exit(0);
}

if (!arg) {
  console.error('用法:');
  console.error('  node scripts/hash-password.mjs "你的密码"');
  console.error('  node scripts/hash-password.mjs --secret');
  process.exit(1);
}

console.log(createHash('sha256').update(arg, 'utf8').digest('hex'));
