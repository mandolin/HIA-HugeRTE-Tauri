// 临时诊断：验证提取正则对 tf() 调用的匹配性（不入库）
const re = /\b(?:t|tf)\("((?:[^"\\]|\\.)*)"\)/g;
const line = 'count.textContent = scan.truncated ? tf("{hits}+ 行", { hits: scan.hits.length }) : tf("{hits} 行", { hits: scan.hits.length });';
const matches = [...line.matchAll(re)].map((m) => m[1]);
console.log("tf matches:", JSON.stringify(matches));
const line2 = 'setStatus(t("已保存"));';
console.log("plain t:", JSON.stringify([...line2.matchAll(re)].map((m) => m[1])));
