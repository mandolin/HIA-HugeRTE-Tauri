import io
p='src/contract-freeze.test.ts'
s=io.open(p,encoding='utf-8').read()
old='''import mainSource from "./main.ts?raw";
import documentSource from "./document.ts?raw";'''
new='''import mainSource from "./main.ts?raw";
import stringsSource from "./ui/strings.ts?raw";
import documentSource from "./document.ts?raw";'''
assert s.count(old)==1
s=s.replace(old,new)
old='''describe("契约冻结：界面状态键（docs/contract-freeze.md §5）", () => {
  const frozenKeys = ['''
new='''describe("契约冻结：界面状态键（docs/contract-freeze.md §5）", () => {
  // 中文：语言键封装在 strings.ts（main.ts 只经 t()/tf() 间接使用）——冻结检查覆盖两个源。
  const frozenKeys = ['''
assert s.count(old)==1
s=s.replace(old,new)
old='''  it.each(frozenKeys)("冻结键仍被使用：%s", (key) => {
    expect(mainSource).toContain(key);
  });'''
new='''  it.each(frozenKeys)("冻结键仍被使用：%s", (key) => {
    expect(mainSource.includes(key) || stringsSource.includes(key)).toBe(true);
  });'''
assert s.count(old)==1
s=s.replace(old,new)
f=io.open(p,'w',encoding='utf-8',newline=''); f.write(s); f.close()
print('contract test extended')
