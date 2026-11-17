// 临时诊断：逐步收窄正则（不入库）
const line = 'count.textContent = scan.truncated ? tf("{hits}+ 行", { hits: scan.hits.length }) : tf("{hits} 行", { hits: scan.hits.length });';
console.log("step1 /tf\\(/ :", /tf\(/.test(line));
console.log("step2 /tf\\(\"/ :", /tf\("/.test(line));
console.log("step3 /\\bt(?:f)?\\(\"/ :", /\bt(?:f)?\("/.test(line));
console.log("step4 full short:", /\bt(?:f)?\("([^"]*)"\)/.test(line));
const re = /\b(?:t|tf)\("((?:[^"\\]|\\.)*)"\)/g;
console.log("step5 full:", [...line.matchAll(re)].map((m) => m[1]));
const re2 = /\bt\("([^"]*)"\)/g;
console.log("step6 t-only:", [...line.matchAll(re2)].map((m) => m[1]));
