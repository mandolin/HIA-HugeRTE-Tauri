import io
p = 'src/main.ts'
s = io.open(p, encoding='utf-8').read()
count = 0
def rep(old, new):
    global s, count
    n = s.count(old)
    assert n >= 1, 'MISSING: ' + old[:80]
    s = s.replace(old, new)
    count += n

# —— 工具栏（renderAppToolbar）——
rep('label: "新建", title: t', 'label: t("新建"), title: t') if False else None
rep('{ icon: "file-plus", label: "新建", title: "新建文档 (Ctrl+N)"', '{ icon: "file-plus", label: t("新建"), title: t("新建文档 (Ctrl+N)")')
rep('{ icon: "folder-open", label: "打开", title: "打开 HTML 文件 (Ctrl+O)"', '{ icon: "folder-open", label: t("打开"), title: t("打开 HTML 文件 (Ctrl+O)")')
rep('{ icon: "device-floppy", label: "保存", title: "保存当前文档 (Ctrl+S)"', '{ icon: "device-floppy", label: t("保存"), title: t("保存当前文档 (Ctrl+S)")')
rep('{ icon: "file-download", label: "另存为", title: "另存为 HTML 文件"', '{ icon: "file-download", label: t("另存为"), title: t("另存为 HTML 文件")')
rep('{ icon: "history", label: "历史", title: "最近打开的文件"', '{ icon: "history", label: t("历史"), title: t("最近打开的文件")')
rep('{ icon: "layout-sidebar-left-collapse", label: "目录树", title: "显示/隐藏目录树"', '{ icon: "layout-sidebar-left-collapse", label: t("目录树"), title: t("显示/隐藏目录树")')

# —— 菜单栏（buildAppMenus）——
rep('label: "文件"', 'label: t("文件")')
rep('label: "新建 Tab"', 'label: t("新建 Tab")')
rep('label: "打开…"', 'label: t("打开…")')
rep('label: "保存"', 'label: t("保存")')
rep('label: "另存为…"', 'label: t("另存为…")')
rep('label: "最近打开…"', 'label: t("最近打开…")')
rep('label: "清空历史…"', 'label: t("清空历史…")')
rep('label: "编辑"', 'label: t("编辑")')
rep('label: "撤销"', 'label: t("撤销")')
rep('label: "重做"', 'label: t("重做")')
rep('label: "查找与替换…"', 'label: t("查找与替换…")')
rep('label: "查看"', 'label: t("查看")')
rep('label: "显示/隐藏目录树"', 'label: t("显示/隐藏目录树")')
rep('''label: sourceViewMode === "split" ? "✓ 源码并排双栏" : "源码并排双栏"''', '''label: sourceViewMode === "split" ? `✓ ${t("源码并排双栏")}` : t("源码并排双栏")''')
rep('''label: sourceViewMode === "full" ? "✓ 源码整区切换" : "源码整区切换"''', '''label: sourceViewMode === "full" ? `✓ ${t("源码整区切换")}` : t("源码整区切换")''')
rep('label: "编辑字号…"', 'label: t("编辑字号…")')
rep('label: "全屏（编辑器）"', 'label: t("全屏（编辑器）")')
rep('label: "插入"', 'label: t("插入")')
rep('label: "图片…"', 'label: t("图片…")')
rep('label: "链接…"', 'label: t("链接…")')
rep('label: "表格…"', 'label: t("表格…")')
rep('label: "特殊字符…"', 'label: t("特殊字符…")')
rep('label: "格式"', 'label: t("格式")')
rep('label: "加粗"', 'label: t("加粗")')
rep('label: "斜体"', 'label: t("斜体")')
rep('label: "下划线"', 'label: t("下划线")')
rep('label: "清除格式"', 'label: t("清除格式")')
rep('label: "源代码"', 'label: t("源代码")')
rep('label: "工具"', 'label: t("工具")')
rep('label: "设置…"', 'label: t("设置…")')
rep('label: "打开方式注册…"', 'label: t("打开方式注册…")')
rep('label: "打开 Windows 默认应用设置"', 'label: t("打开 Windows 默认应用设置")')
rep('label: "帮助"', 'label: t("帮助")')
rep('label: "打开下载页"', 'label: t("打开下载页")')
rep('label: "关于 HIA HugeRTE"', 'label: t("关于 HIA HugeRTE")')

# —— 精简态 ☰ 菜单 ——
rep('label.textContent = "菜单";', 'label.textContent = t("菜单");')

# —— Tab 条 ——
rep('close.title = "关闭标签页";', 'close.title = t("关闭标签页");')
rep('unpin.title = "解除固定";', 'unpin.title = t("解除固定");')
rep('pin.title = "固定标签页";', 'pin.title = t("固定标签页");')
rep('chip.title = tab.pinned ? `${displayText}（已固定）` : displayText;', 'chip.title = tab.pinned ? tf("{text}（已固定）", { text: displayText }) : displayText;')
rep('input.setAttribute("aria-label", "编辑标签页别名");', 'input.setAttribute("aria-label", t("编辑标签页别名"));')
rep('more.textContent = `▾ 更多标签（${tabs.length}）`;', 'more.textContent = tf("▾ 更多标签（{count}）", { count: tabs.length });')

# —— 头部摘要与状态栏 ——
rep('const summaryText = summary.total > 1 ? `${summary.total} 个文档 · ${summary.dirty} 个未保存` : (summary.dirty > 0 ? "1 个文档 · 1 个未保存" : "1 个文档");',
    'const summaryText = summary.total > 1 ? tf("{total} 个文档 · {dirty} 个未保存", { total: summary.total, dirty: summary.dirty }) : (summary.dirty > 0 ? tf("1 个文档 · 1 个未保存") : tf("1 个文档"));')
rep('statusbarSave.textContent = state().dirty ? "● 未保存" : "已保存";',
    'statusbarSave.textContent = state().dirty ? t("● 未保存") : t("已保存");')
rep('statusbarCursor.textContent = `行 ${line} · 列 ${column}`;', 'statusbarCursor.textContent = tf("行 {line} · 列 {column}", { line, column });')

f = io.open(p, 'w', encoding='utf-8', newline='')
f.write(s)
f.close()
print('p2 done, replacements:', count)
