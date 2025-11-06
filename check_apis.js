//  check_apis.js
const fs = require('fs');
const axios = require('axios');
const path = require('path');

const configPath = path.join(__dirname, 'LunaTV-config.json');
const reportPath = path.join(__dirname, 'report.md');
const MAX_DAYS = 100;
const WARN_STREAK = 3; // 连续失败天数阈值

// 读取 API 配置
const rawData = fs.readFileSync(configPath);
const config = JSON.parse(rawData);
const apiEntries = Object.values(config.api_site).map(site => ({ name: site.name, api: site.api }));

// 当前 CST 时间
const now = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().replace("T", " ").slice(0, 16) + " CST";

// 读取历史记录
let history = [];
if (fs.existsSync(reportPath)) {
  const oldReport = fs.readFileSync(reportPath, 'utf-8');
  const match = oldReport.match(/```json\n([\s\S]+?)\n```/);
  if (match) history = JSON.parse(match[1]);
}

// 检查重复 API
const apiCountMap = {};
for (const { api } of apiEntries) {
  apiCountMap[api] = (apiCountMap[api] || 0) + 1;
}

(async () => {
  const todayResults = [];

  for (const { name, api } of apiEntries) {
    try {
      const res = await axios.get(api, { timeout: 10000 });
      todayResults.push({ name, api, success: res.status === 200 });
    } catch (e) {
      todayResults.push({ name, api, success: false });
    }
  }

  // 更新历史
  history.push({ date: new Date().toISOString().slice(0,10), results: todayResults });
  if (history.length > MAX_DAYS) history = history.slice(-MAX_DAYS);

  // 统计每个 API 的成功/失败次数和连续失败天数
  const stats = {};
  for (const { name, api } of apiEntries) {
    stats[api] = { name, ok: 0, fail: 0, fail_streak: 0, status: "❌", duplicate: apiCountMap[api] > 1 };
    let streak = 0;
    let firstSeen = false;

    for (const day of history) {
      let r = day.results.find(x => x.api === api);
      if (!r) continue; // 历史中不存在则跳过
      firstSeen = true;

      if (r.success) {
        stats[api].ok++;
        streak = 0;
      } else {
        stats[api].fail++;
        streak++;
      }
      stats[api].fail_streak = streak;
    }

    // 判断状态
    const latest = todayResults.find(x => x.api === api);
    if (stats[api].fail_streak >= WARN_STREAK) stats[api].status = "🚨";
    else if (latest?.success) stats[api].status = "✅";
    else stats[api].status = "❌";

    // 如果 API 重复，加上重复标记
    if (stats[api].duplicate) stats[api].status = "🔁";
  }
// 统计总 API 数量和重复数量
const totalAPIs = apiEntries.length;
const duplicateAPIs = Object.values(apiCountMap).filter(count => count > 1).length;

console.log(`总 API 数量: ${totalAPIs}`);
console.log(`重复 API 数量: ${duplicateAPIs}`);

  // 生成 Markdown 报告
  let md = `# API 健康检查报告\n\n最近更新：${now}\n\n`;
  md += `**总 API 数量:** ${totalAPIs}  |  **重复 API 数量:** ${duplicateAPIs}\n\n`;
  md += `## 最近 ${MAX_DAYS} 次 API 健康统计\n\n`;
  md += "| 状态 | API 名称 | API 地址 | 成功次数 | 失败次数 | 可用率 | 连续失败天数 |\n";
  md += "|------|----------|----------|---------:|---------:|-------:|-------------:|\n";

  for (const { name, api } of apiEntries) {
    const s = stats[api];
    const total = s.ok + s.fail;
    const rate = total > 0 ? ((s.ok / total) * 100).toFixed(1) + "%" : "-";
    md += `| ${s.status} | ${s.name} | ${api} | ${s.ok} | ${s.fail} | ${rate} | ${s.fail_streak} |\n`;
  }

  md += `\n## 详细历史数据 (JSON)\n`;
  md += "```json\n" + JSON.stringify(history, null, 2) + "\n```\n";

  fs.writeFileSync(reportPath, md, 'utf-8');
 // -------- 新增：将 latest?.success 为 true 的 site 保留下来并写入 jingjian.json --------
  try {
    const healthyApis = new Set(todayResults.filter(r => r.success).map(r => r.api));

    // 依据原始 config.api_site 的键保留对应项
    const filteredApiSite = {};
    for (const [key, site] of Object.entries(config.api_site)) {
      if (site && site.api && healthyApis.has(site.api)) {
        filteredApiSite[key] = site;
      }
    }

    const filteredConfig = Object.assign({}, config, { api_site: filteredApiSite });
    fs.writeFileSync(jingjianPath, JSON.stringify(filteredConfig, null, 2), 'utf-8');

    const keptCount = Object.keys(filteredApiSite).length;
    console.log(`已将 ${keptCount} 个 latest?.success 为 true 的 site 写入: ${jingjianPath}`);
  } catch (e) {
    console.error('写入 jingjian.json 时出错:', e);
  }

})();
