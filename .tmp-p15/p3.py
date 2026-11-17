import io
p = 'src/main.ts'
s = io.open(p, encoding='utf-8').read()
count = 0
def rep(old, new):
    global s, count
    n = s.count(old)
    assert n >= 1, 'MISSING: ' + old[:100]
    s = s.replace(old, new)
    count += n

rep('headTitle.textContent = "设置";', 'headTitle.textContent = t("设置");')
rep('assocTitle.textContent = "打开方式";', 'assocTitle.textContent = t("打开方式");')
rep('assocNote.textContent = "注册后本应用会出现在 Windows「打开方式」列表中。不会设为默认打开程序，也不修改系统的默认应用设置。";',
    'assocNote.textContent = t("注册后本应用会出现在 Windows「打开方式」列表中。不会设为默认打开程序，也不修改系统的默认应用设置。");')
rep('assocState.append(dot, document.createTextNode(registered ? "已注册" : "未注册"));',
    'assocState.append(dot, document.createTextNode(registered ? t("已注册") : t("未注册")));')
rep('assocAction.textContent = registered ? "移除注册" : "注册到打开方式列表";',
    'assocAction.textContent = registered ? t("移除注册") : t("注册到打开方式列表");')
rep('assocHelper.textContent = "打开 Windows 默认应用设置";', 'assocHelper.textContent = t("打开 Windows 默认应用设置");')
rep('setStatus("已在系统「默认应用」设置中选择本程序");',
    'setStatus(t("已在系统「默认应用」设置中选择本程序"));')
rep('setStatus(`打开系统设置失败：${formatError(error)}`);',
    'setStatus(tf("打开系统设置失败：{error}", { error: formatError(error) }));')
rep('setStatus("已在浏览器中打开下载页");',
    'setStatus(t("已在浏览器中打开下载页"));')
rep('setStatus(`打开下载页失败：${formatError(error)}`);',
    'setStatus(tf("打开下载页失败：{error}", { error: formatError(error) }));')
rep('appearanceTitle.textContent = "界面与编辑器";', 'appearanceTitle.textContent = t("界面与编辑器");')
rep('uiSizeLabel.textContent = "界面字号 ";', 'uiSizeLabel.textContent = t("界面字号 ");')
rep('for (const [value, text] of [["1", "标准"], ["1.125", "较大"], ["1.25", "大"], ["0.9", "紧凑"]] as const) {',
    'for (const [value, text] of [["1", t("标准")], ["1.125", t("较大")], ["1.25", t("大")], ["0.9", t("紧凑")]] as const) {')
rep('fontSizeLabel.textContent = "编辑字号 ";', 'fontSizeLabel.textContent = t("编辑字号 ");')
rep('menubarLabel.textContent = "菜单栏 ";', 'menubarLabel.textContent = t("菜单栏 ");')
rep('for (const [value, text] of [["full", "显示"], ["compact", "精简"], ["hidden", "隐藏"]] as const) {',
    'for (const [value, text] of [["full", t("显示")], ["compact", t("精简")], ["hidden", t("隐藏")]] as const) {')
rep('dataTitle.textContent = "数据与恢复";', 'dataTitle.textContent = t("数据与恢复");')
rep('sessionLabel.append(sessionCheckbox, document.createTextNode(" 会话恢复（重启后恢复上次的标签页）"));',
    'sessionLabel.append(sessionCheckbox, document.createTextNode(t(" 会话恢复（重启后恢复上次的标签页）")));')
rep('autosaveLabel.append(autosaveCheckbox, document.createTextNode(" 自动保存草稿（崩溃后恢复未保存内容）"));',
    'autosaveLabel.append(autosaveCheckbox, document.createTextNode(t(" 自动保存草稿（崩溃后恢复未保存内容）")));')
rep('dataNote.textContent = "会话与草稿仅保存在本机（便携目录 data/ 优先；不可写时 %APPDATA%\\\\HIA-HugeRTE），不上传、不联网。";',
    'dataNote.textContent = t("会话与草稿仅保存在本机（便携目录 data/ 优先；不可写时 %APPDATA%\\\\HIA-HugeRTE），不上传、不联网。");')
rep('versionTitle.textContent = "版本";', 'versionTitle.textContent = t("版本");')
rep('versionNote.textContent = "本程序不联网检查更新、不会自动下载或替换自身；有新版本时请前往下载页手动替换。";',
    'versionNote.textContent = t("本程序不联网检查更新、不会自动下载或替换自身；有新版本时请前往下载页手动替换。");')
rep('versionState.textContent = "当前版本 —";', 'versionState.textContent = t("当前版本 —");')
rep('assocState.textContent = "读取中…";', 'assocState.textContent = t("读取中…");')
rep('assocState.textContent = "状态未知";', 'assocState.textContent = t("状态未知");')
rep('assocNote.textContent = "无法读取当前注册状态。";', 'assocNote.textContent = t("无法读取当前注册状态。");')
rep('headVersion.textContent = `v${versionInfoCache.version}`;\n    versionState.textContent = `当前版本 ${versionInfoCache.version}`;',
    'headVersion.textContent = `v${versionInfoCache.version}`;\n    versionState.textContent = tf("当前版本 {version}", { version: versionInfoCache.version });')
rep('headVersion.textContent = `v${info.version}`;\n      versionState.textContent = `当前版本 ${info.version}`;',
    'headVersion.textContent = `v${info.version}`;\n      versionState.textContent = tf("当前版本 {version}", { version: info.version });')
rep('versionState.textContent = "当前版本未知";', 'versionState.textContent = t("当前版本未知");')
rep('setStatus(result.registered ? "已注册到「打开方式」列表（可在系统设置中选择）" : "已移除「打开方式」注册");',
    'setStatus(result.registered ? t("已注册到「打开方式」列表（可在系统设置中选择）") : t("已移除「打开方式」注册"));')
rep('assocNote.textContent = `操作失败：${formatError(error)}`;', 'assocNote.textContent = tf("操作失败：{error}", { error: formatError(error) });')

old = '''  appearanceRow.append(uiSizeLabel, fontSizeLabel, menubarLabel);
  appearanceSection.append(appearanceTitle, appearanceRow);
  panel.appendChild(appearanceSection);'''
new = '''  // 中文：界面语言（W-hrt-P15）——切换即时重建壳文案；编辑器语言包随重启生效（init 选项）。
  const languageLabel = document.createElement("label");
  languageLabel.className = "settings-panel__state";
  languageLabel.textContent = t("语言 ");
  const languageSelect = document.createElement("select");
  languageSelect.id = "ui-language";
  for (const option of [["zh-Hans", t("中文")], ["en", t("English")]] as const) {
    const optionElement = document.createElement("option");
    optionElement.value = option[0];
    optionElement.textContent = option[1];
    languageSelect.appendChild(optionElement);
  }
  languageSelect.value = currentLanguage();
  languageSelect.addEventListener("change", () => {
    if (setUiLanguage(languageSelect.value === "en" ? "en" : "zh-Hans")) {
      rebuildShellChrome();
      setStatus(t("界面语言已切换（编辑器语言包在重启后生效）。"));
    }
  });
  languageLabel.appendChild(languageSelect);
  appearanceRow.append(uiSizeLabel, fontSizeLabel, menubarLabel, languageLabel);
  appearanceSection.append(appearanceTitle, appearanceRow);
  panel.appendChild(appearanceSection);'''
assert s.count(old) == 1, "language select anchor"
s = s.replace(old, new)

rep('''  for (const line of [
    `版本 ${version}`,
    "基于 HugeRTE 与 Tauri 的 Windows 便携 HTML 编辑器",
    "MIT 许可证；第三方组件与图标许可见 THIRD_PARTY_NOTICES",
    "本地编辑：不联网检查更新，不上传文档内容"
  ]) {''', '''  for (const line of [
    tf("版本 {version}", { version }),
    t("基于 HugeRTE 与 Tauri 的 Windows 便携 HTML 编辑器"),
    t("MIT 许可证；第三方组件与图标许可见 THIRD_PARTY_NOTICES"),
    t("本地编辑：不联网检查更新，不上传文档内容")
  ]) {''')
rep('close.textContent = "关闭";', 'close.textContent = t("关闭");')

rep('title.textContent = "最近打开（本地记录）";', 'title.textContent = t("最近打开（本地记录）");')
rep('clear.textContent = "清空历史";', 'clear.textContent = t("清空历史");')
rep('toggleLabel.textContent = historyDisabled ? "开启记录" : "不记录模式";', 'toggleLabel.textContent = historyDisabled ? t("开启记录") : t("不记录模式");')
rep('setStatus(historyDisabled ? "已开启不记录模式（新打开的文件不再记录）" : "已恢复历史记录");',
    'setStatus(historyDisabled ? t("已开启不记录模式（新打开的文件不再记录）") : t("已恢复历史记录"));')
rep('empty.textContent = historyDisabled ? "（不记录模式已开启）" : "暂无历史记录";', 'empty.textContent = historyDisabled ? t("（不记录模式已开启）") : t("暂无历史记录");')
rep('footer.textContent = "记录仅保存在本机（便携目录优先；不可写时 %APPDATA%\\\\HIA-HugeRTE）";', 'footer.textContent = t("记录仅保存在本机（便携目录优先；不可写时 %APPDATA%\\\\HIA-HugeRTE）");')
rep('confirmDiscardButton.textContent = "清空历史";', 'confirmDiscardButton.textContent = t("清空历史");')
rep('void showConfirmModal("将删除本机全部历史记录，且无法撤销。确定清空？").then((result) => {',
    'void showConfirmModal(t("将删除本机全部历史记录，且无法撤销。确定清空？")).then((result) => {')
rep('setStatus("已清空历史记录");', 'setStatus(t("已清空历史记录"));')

f = io.open(p, 'w', encoding='utf-8', newline='')
f.write(s)
f.close()
print('p3 done, replacements:', count)
