/**
 * Node.js 重写版 of get_vod.py
 *
 * 用法:
 *   node get_vod.js "url1,<url2"
 * 或通过环境变量 urls 传入（优先级高于命令行参数）:
 *   urls="url1,url2" node get_vod.js
 * 如果不提供任何参数或环境变量，脚本将使用内置的默认 URLs（与原脚本一致）。
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
  console.log(`Fetched ${url}, status: ${res.status}, length: ${text.length}`);
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

  // Initialize merged structure that we will progressively fill
  const merged = { cache_time: undefined, api_site: {} };

  for (const url of urls) {
    try {
      const data = await getJson(url);
      if (!data || typeof data !== 'object') {
        continue;
      }

      // Merge cache_time: choose the smallest numeric cache_time (more frequent refresh),
      // or prefer first-seen if only one provided.
      if (typeof data.cache_time === 'number') {
        if (typeof merged.cache_time !== 'number') {
          merged.cache_time = data.cache_time;
        } else {
          merged.cache_time = Math.min(merged.cache_time, data.cache_time);
        }
      }

      // Merge api_site by iterating each site's key and adding only when absent.
      if (data.api_site && typeof data.api_site === 'object') {
        for (const key of Object.keys(data.api_site)) {
          if (!(key in merged.api_site)) {
            merged.api_site[key] = data.api_site[key];
          } 
        }
      } 

      // Merge other top-level keys: keep first-seen value (do not overwrite existing)
      for (const key of Object.keys(data)) {
        if (key === 'api_site' || key === 'cache_time') continue;
        if (!(key in merged)) {
          merged[key] = data[key];

        } 
      }
    } catch (err) {
      
      // 忽略错误，继续处理其他 URL
    }
  }

  // Ensure cache_time has a sensible default
  if (typeof merged.cache_time !== 'number') merged.cache_time = 9200;

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

function parseEnvUrls(envValue) {
  if (!envValue || typeof envValue !== 'string') return [];
  // 支持以逗号、分号或换行分隔
  return envValue.split(/[,\n;]+/).map(s => s.trim()).filter(Boolean);
}

(async function main() {
  // 优先从环境变量读取 urls（支持小写 urls 或大写 URLS）
  const envVar = process.env.urls || process.env.URLS;
  let urls = [];

  if (envVar) {
    urls = parseEnvUrls(envVar);
    if (urls.length > 0) {
      console.log('Using URLs from environment variable "urls".');
    } else {
      console.warn('Environment variable "urls" is set but contains no valid URLs. Falling back to command-line args or defaults.');
    }
  }

  // 如果环境变量没有有效 URL，则从命令行参数读取
  if (urls.length === 0) {
    const args = process.argv.slice(2);

    // 如果提供了一个以逗号分隔的单个参数，支持将其拆分为多个 URL
    if (args.length === 1 && args[0].includes(',')) {
      urls = args[0].split(',').map(s => s.trim()).filter(Boolean);
    } else {
      urls = args.map(s => s.trim()).filter(Boolean);
    }
  }

  // 如果仍没有参数，则使用默认列表（保留原脚本的默认）
  if (urls.length === 0) {
    urls = [
      'https://raw.githubusercontent.com/666zmy/MoonTV/refs/heads/main/config.json',
      'https://jjpz.hafrey.dpdns.org?config=0'
    ];
    console.log('No URLs from environment or args; using built-in default URLs.');
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
