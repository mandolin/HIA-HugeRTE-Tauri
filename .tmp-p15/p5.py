import io
p='docs/contract-freeze.md'
s=io.open(p,encoding='utf-8').read()
old='| `hia-hugerte.autosave` | Autosave-drafts toggle |'
new='| `hia-hugerte.autosave` | Autosave-drafts toggle |\n| `hia-hugerte.language` | Interface language (`zh-Hans` default / `en`) |'
assert s.count(old)==1, 'doc anchor'
s=s.replace(old,new)
f=io.open(p,'w',encoding='utf-8',newline=''); f.write(s); f.close()

p='src/contract-freeze.test.ts'
s=io.open(p,encoding='utf-8').read()
old='    "hia-hugerte.autosave"\n  ];'
new='    "hia-hugerte.autosave",\n    "hia-hugerte.language"\n  ];'
assert s.count(old)==1, 'test anchor'
s=s.replace(old,new)
f=io.open(p,'w',encoding='utf-8',newline=''); f.write(s); f.close()
print('contract key registered')
