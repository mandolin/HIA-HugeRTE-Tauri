import { readFileSync } from "node:fs";
const main = readFileSync("src/main.ts", "utf8");
const line = main.split("\n").find(l => l.includes('tf("{hits}+ 行"'));
console.log("line found:", JSON.stringify(line?.trim().slice(0, 80)));
const pattern = /\b(?:t|tf)\("((?:[^"\]|\.)*)"\)/g;
const matches = [...line.matchAll(pattern)];
console.log("matches on line:", matches.length);
// 对整份源码逐段计数
const all = [...main.matchAll(/\bt\("((?:[^"\]|\.)*)"\)/g)].map(m => m[1]);
console.log("plain t() keys:", all.length);
console.log("contains target literal:", main.includes('tf("{hits}+ 行"'));
const idx = main.indexOf('tf("{hits}+ 行"');
console.log("context:", JSON.stringify(main.slice(idx - 30, idx + 40)));
