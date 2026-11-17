import io
p = 'src/main.ts'
s = io.open(p, encoding='utf-8').read()
count = 0
def rep(old, new, allow_all=False):
    global s, count
    n = s.count(old)
    assert n >= 1, 'MISSING: ' + old[:100]
    s = s.replace(old, new)
    count += n

# —— 编辑器初始化：语言包接入 + 初始化错误 ——
rep("import hugerte, { type Editor } from \"hugerte\";",
    "import hugerte, { type Editor } from \"hugerte\";\nimport \"./editor/langs/zh-Hans\";")
rep('''    contextmenu_never_use_native: true,
    skin_url: "default", content_css: "default",''',
    '''    contextmenu_never_use_native: true,
    // 中文：编辑器界面语言（W-hrt-P15）——按持久化语言条件传入（zh-Hans 语言包已通过副作用
    //       导入注册；英文为内置缺省无需包）。language 是 init 选项，切换语言后重启生效。
    // English: The editor UI language (W-hrt-P15) — passed conditionally on the persisted language
    //       (the zh-Hans pack registers via the side-effect import; English is the built-in
    //       default and needs no pack). language is an init option, so switching applies after a
    //       restart.
    language: currentLanguage() === "en" ? undefined : "zh-Hans",
    skin_url: "default", content_css: "default",''')
rep('throw new Error("HugeRTE 未能创建编辑器实例。");', 'throw new Error(t("HugeRTE 未能创建编辑器实例。"));')
rep('throw new Error("无法初始化应用根节点。");', 'throw new Error(t("无法初始化应用根节点。"));')
rep('throw new Error(`找不到必要的界面元素：${selector}`);', 'throw new Error(tf("找不到必要的界面元素：{selector}", { selector }));')

# —— 状态消息 ——
rep('setStatus("已修改，尚未保存");', 'setStatus(t("已修改，尚未保存"));')
rep('setStatus("已保存");', 'setStatus(t("已保存"));')
rep('setStatus("已打开");', 'setStatus(t("已打开"));')
rep('setStatus("已新建文档");', 'setStatus(t("已新建文档"));')
rep('setStatus("已切换标签页");', 'setStatus(t("已切换标签页"));')
rep('setStatus(tabs.length > 1 ? "已关闭标签页" : "已新建文档");',
    'setStatus(tabs.length > 1 ? t("已关闭标签页") : t("已新建文档"));')
rep('setStatus(`标签页已达上限（${MAX_TABS}），请先关闭部分标签页。`);',
    'setStatus(tf("标签页已达上限（{max}），请先关闭部分标签页。", { max: MAX_TABS }));')
rep('setStatus(`打开失败：${formatError(error)}`);', 'setStatus(tf("打开失败：{error}", { error: formatError(error) }));')
rep('setStatus(`无法打开文件：${formatError(error)}`);', 'setStatus(tf("无法打开文件：{error}", { error: formatError(error) }));')
rep('setStatus(`保存失败：${formatError(error)}`);', 'setStatus(tf("保存失败：{error}", { error: formatError(error) }));')
rep('return typeof error === "string" ? error : "发生未知错误。";', 'return typeof error === "string" ? error : t("发生未知错误。");')
rep('statusbarCount.textContent = `字符 ${event.wordCount.characters} · 词 ${event.wordCount.words}`;',
    'statusbarCount.textContent = tf("字符 {chars} · 词 {words}", { chars: event.wordCount.characters, words: event.wordCount.words });')

# —— 资源树/预览/面包屑 ——
rep('explorerScope.textContent = "浏览：可逐级导航（文档内容引用仍限于文档目录作用域）";',
    'explorerScope.textContent = t("浏览：可逐级导航（文档内容引用仍限于文档目录作用域）");')
rep('hint.textContent = "点行首按钮展开目录";', 'hint.textContent = t("点行首按钮展开目录");')
rep('empty.textContent = indent === 1 ? "目录为空或不可读" : "（空）";', 'empty.textContent = indent === 1 ? t("目录为空或不可读") : t("（空）");')
rep('device.textContent = "此电脑";', 'device.textContent = t("此电脑");')
rep('caret.title = "显示同级文件夹";', 'caret.title = t("显示同级文件夹");')
rep('empty.textContent = "（无同级文件夹）";', 'empty.textContent = t("（无同级文件夹）");')
rep('toggle.title = expanded ? "收起目录" : "展开目录";', 'toggle.title = expanded ? t("收起目录") : t("展开目录");')
rep('ref.textContent = `相对引用：${relativePath} · 约 ${size} KB`;',
    'ref.textContent = tf("相对引用：{relativePath} · 约 {size} KB", { relativePath, size });')
rep('insert.textContent = "插入相对引用";', 'insert.textContent = t("插入相对引用");')

# —— 大纲 ——
rep('|| "（空标题）",', '|| t("（空标题）"),')
rep('empty.textContent = "文档没有标题（h1–h6），无法生成大纲";', 'empty.textContent = t("文档没有标题（h1–h6），无法生成大纲");')
rep('caret.title = collapsed ? "展开此节" : "折叠此节";', 'caret.title = collapsed ? t("展开此节") : t("折叠此节");')

# —— 搜索态 ——
rep('hint.textContent = "输入关键字，在所有打开的文档中查找";', 'hint.textContent = t("输入关键字，在所有打开的文档中查找");')
rep('count.textContent = scan.truncated ? `${scan.hits.length}+ 行` : `${scan.hits.length} 行`;',
    'count.textContent = scan.truncated ? tf("{hits}+ 行", { hits: scan.hits.length }) : tf("{hits} 行", { hits: scan.hits.length });')
rep('setStatus(revealed ? `已定位第 ${hit.line} 行命中（源码行号）` : "已切换文档；该命中位于标签或属性中，未定位正文");',
    'setStatus(revealed ? tf("已定位第 {line} 行命中（源码行号）", { line: hit.line }) : t("已切换文档；该命中位于标签或属性中，未定位正文"));')
rep('more.textContent = `仅显示前 ${SEARCH_MAX_HITS_PER_FILE} 行命中`;',
    'more.textContent = tf("仅显示前 {max} 行命中", { max: SEARCH_MAX_HITS_PER_FILE });')
rep('empty.textContent = "未找到命中";', 'empty.textContent = t("未找到命中");')

# —— 会话恢复状态 ——
rep('setStatus(skipped > 0 ? `已恢复 ${restoredTabIds.length} 个文档；${skipped} 个已失效被跳过` : `已恢复 ${restoredTabIds.length} 个文档`);',
    'setStatus(skipped > 0 ? tf("已恢复 {restored} 个文档；{skipped} 个已失效被跳过", { restored: restoredTabIds.length, skipped }) : tf("已恢复 {restored} 个文档", { restored: restoredTabIds.length }));')

# —— 启动参数状态 ——
rep('setStatus(skipped > 0 ? `已打开 ${documents.length - skipped} 个传入文件；${skipped} 个因标签页上限被跳过` : documents.length > 1 ? `已通过系统文件入口打开 ${documents.length} 个文件` : "已通过系统文件入口打开");',
    'setStatus(skipped > 0 ? tf("已打开 {opened} 个传入文件；{skipped} 个因标签页上限被跳过", { opened: documents.length - skipped, skipped }) : documents.length > 1 ? tf("已通过系统文件入口打开 {count} 个文件", { count: documents.length }) : t("已通过系统文件入口打开"));')
rep('setStatus(`启动文件打开失败：${formatError(error)}`);', 'setStatus(tf("启动文件打开失败：{error}", { error: formatError(error) }));')

# —— 草稿 ——
rep('setStatus(`标签页已达上限（${MAX_TABS}），部分草稿未恢复。`);',
    'setStatus(tf("标签页已达上限（{max}），部分草稿未恢复。", { max: MAX_TABS }));')
rep('setStatus("已恢复未保存草稿");', 'setStatus(t("已恢复未保存草稿"));')
rep('if (!(await showConfirmModal(`将丢弃 ${pendingDrafts.length} 份上次会话的未保存草稿，且无法撤销。确定丢弃？`))) return;',
    'if (!(await showConfirmModal(tf("将丢弃 {count} 份上次会话的未保存草稿，且无法撤销。确定丢弃？", { count: pendingDrafts.length })))) return;')
rep('setStatus("已丢弃未保存草稿");', 'setStatus(t("已丢弃未保存草稿"));')
rep('''  const parts: string[] = [];
  if (named.length > 0) parts.push(named.slice(0, 3).join("、") + (named.length > 3 ? " 等" : ""));
  if (untitledCount > 0) parts.push(`${untitledCount} 份未命名文档`);
  draftBannerText.textContent = `检测到 ${pendingDrafts.length} 份上次会话的未保存草稿（${parts.join("，")}）`;''',
    '''  const parts: string[] = [];
  if (named.length > 0) parts.push(named.slice(0, 3).join("、") + (named.length > 3 ? t(" 等") : ""));
  if (untitledCount > 0) parts.push(tf("{untitled} 份未命名文档", { untitled: untitledCount }));
  draftBannerText.textContent = tf("检测到 {count} 份上次会话的未保存草稿（{list}）", { count: pendingDrafts.length, list: parts.join("、") });''')

# —— 启动链 ——
rep('.then(async () => {\n    if (!isTauriRuntime) { setStatus("浏览器兼容性验证模式"); return; }',
    '.then(async () => {\n    if (!isTauriRuntime) { setStatus(t("浏览器兼容性验证模式")); return; }')
# —— 启动时应用静态骨架文案（语言恢复）——
rep('''renderSidebarModeStrip();
applySidebarMode();''', '''renderSidebarModeStrip();
applyShellLanguage();
applySidebarMode();''')

f = io.open(p, 'w', encoding='utf-8', newline='')
f.write(s)
f.close()
print('p4 done, replacements:', count)
