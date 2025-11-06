/**
 * Node.js 重写版 of get_vod.py
 *
 * 用法:
 *   node get_vod.js "url1,<url2"
 * 如果不提供任何参数，脚本将使用内置的默认 URLs（与原脚本一致）。
 *
 * 说明:
 * - 使用全局 fetch (Node 18+)；若 Node 版本 <18，请安装并引入 node-fetch，或升级 Node。
 * - 合并所有顶层键并对 api_site 根据 site.api 去重（保留首次出现的条目）。
 * - 输出写入 LunaTV-config.json
 */

const fs = require('fs');

async function getJson(url, headers = {}, payload = {}) {
  // GET 请求忽略 payload（与原 Python 脚本一致）
  const res = await fetch(url, { method: 'GET', headers });
  const text = await res.text();

  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`Failed to parse JSON from ${url}: ${err.message}\nResponse snippet: ${text.slice(0, 200)}`);
  }
}

function removeDuplicates(jsonData) {
  if (!jsonData || typeof jsonData !== 'object' || !jsonData.api_site) {
    return { cache_time: 9200, api_site: {} };
  }

  const uniqueItems = { cache_time: 9200, api_site: {} };
  const seenApis = new Set();

  for (const key of Object.keys(jsonData.api_site)) {
    const site = jsonData.api_site[key];
    if (!site || typeof site !== 'object') continue;

    const apiValue = site.api;
    if (!seenApis.has(apiValue)) {
      // 使用 site.name 作为键（与原脚本行为一致）
      uniqueItems.api_site[site.name] = site;
      seenApis.add(apiValue);
    }
  }

  return uniqueItems;
}

async function mergeJson(urls) {
  let merged = {};

  for (const url of urls) {
    try {
      const data = await getJson(url);
      if (data && typeof data === 'object') {
        // 合并顶层键（类似 Python dict.update）
        merged = Object.assign(merged, data);
      }
    } catch (err) {
      console.error(`Failed to fetch/parse ${url}:`, err.message);
      // 忽略错误，继续处理其他 URL
    }
  }

  // 对合并后的结果进行去重并返回
  return removeDuplicates(merged);
}

function isProbablyUrl(s) {
  try {
    new URL(s);
    return true;
  } catch {
    return false;
  }
}

(async function main() {
  // 从命令行参数读取 urls
  // node get_vod.js https://a.json https://b.json
  const args = process.argv.slice(2);

  // 如果提供了一个以逗号分隔的单个参数，支持将其拆分为多个 URL
  let urls = [];
  if (args.length === 1 && args[0].includes(',')) {
    urls = args[0].split(',').map(s => s.trim()).filter(Boolean);
  } else {
    urls = args.map(s => s.trim()).filter(Boolean);
  }

  // 如果没有参数，则使用默认列表（保留原脚本的默认）
  if (urls.length === 0) {
    urls = [
      'https://raw.githubusercontent.com/666zmy/MoonTV/refs/heads/main/config.json',
      'https://jjpz.hafrey.dpdns.org?config=0'
    ];
  }

  // 简单验证，移除看起来不是 URL 的参数（保守处理）
  const invalid = urls.filter(u => !isProbablyUrl(u));
  if (invalid.length > 0) {
    console.warn('Warning: Some provided arguments do not look like URLs and will be ignored:', invalid);
    urls = urls.filter(isProbablyUrl);
    if (urls.length === 0) {
      console.error('No valid URLs provided. Exiting.');
      process.exit(2);
    }
  }

  try {
    const jsonData = await mergeJson(urls);
    fs.writeFileSync('LunaTV-config.json', JSON.stringify(jsonData, null, 2), 'utf8');
    console.log('Wrote LunaTV-config.json with', Object.keys(jsonData.api_site || {}).length, 'api_site entries');
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
})();
