// 中文：发布版使用 Windows GUI 子系统，双击便携 EXE 时不创建控制台窗口。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Windows 下的应用入口保持极薄，便于将宿主逻辑集中到 lib.rs。
fn main() {
    hia_hugerte_tauri_lib::run()
}
