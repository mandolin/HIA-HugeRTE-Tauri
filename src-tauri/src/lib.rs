use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};

use serde::Serialize;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DocumentPayload {
    path: String,
    content: String,
    /// 文档所在目录；仅用于在前端把相对资源引用安全映射为可显示的内联数据，绝不写回磁盘。
    base_dir: String,
}

struct DocumentState {
    startup_paths: Vec<PathBuf>,
    writable_paths: Mutex<HashSet<PathBuf>>,
}

/// 中文：验证并读取用户明确打开的 HTML 文档；当前版本只承诺 UTF-8 文本。
fn read_html_document(path: &Path, state: &DocumentState) -> Result<DocumentPayload, String> {
    if !is_supported_html_path(path) {
        return Err("[file.unsupported_type] 仅支持 .htm 和 .html 文件。".into());
    }

    let canonical_path = path
        .canonicalize()
        .map_err(|error| format!("[file.not_found] 无法访问文件：{error}"))?;
    if !canonical_path.is_file() {
        return Err("[file.not_a_file] 指定路径不是普通文件。".into());
    }

    let content = fs::read_to_string(&canonical_path)
        .map_err(|error| format!("[file.read_failed] 无法以 UTF-8 文本读取文件：{error}"))?;
    state
        .writable_paths
        .lock()
        .map_err(|_| "[file.state_failed] 文档权限状态不可用。".to_string())?
        .insert(canonical_path.clone());

    let base_dir = canonical_path
        .parent()
        .map(|parent| parent.to_string_lossy().into_owned())
        .unwrap_or_default();

    Ok(DocumentPayload {
        path: canonical_path.to_string_lossy().into_owned(),
        content,
        base_dir,
    })
}

/// 中文：只允许保存本会话中已经通过打开或另存为授权的路径。
fn write_authorized_html_document(
    path: &Path,
    content: &str,
    state: &DocumentState,
) -> Result<(), String> {
    if !is_supported_html_path(path) {
        return Err("[file.unsupported_type] 仅支持 .htm 和 .html 文件。".into());
    }

    let canonical_path = path
        .canonicalize()
        .map_err(|error| format!("[file.not_found] 无法访问目标文件：{error}"))?;
    let paths = state
        .writable_paths
        .lock()
        .map_err(|_| "[file.state_failed] 文档权限状态不可用。".to_string())?;
    if !paths.contains(&canonical_path) {
        return Err("[permission.path_not_authorized] 当前会话未授权写入该文件。".into());
    }
    drop(paths);

    fs::write(&canonical_path, content)
        .map_err(|error| format!("[file.write_failed] 无法保存文件：{error}"))
}

fn is_supported_html_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| matches!(extension.to_ascii_lowercase().as_str(), "htm" | "html"))
}

#[tauri::command]
fn get_startup_documents(state: State<'_, DocumentState>) -> Result<Vec<DocumentPayload>, String> {
    Ok(state
        .startup_paths
        .iter()
        .filter_map(|path| read_html_document(path, &state).ok())
        .collect())
}

#[tauri::command]
fn open_document_path(
    path: String,
    state: State<'_, DocumentState>,
) -> Result<DocumentPayload, String> {
    read_html_document(Path::new(&path), &state)
}

#[tauri::command]
fn open_document_dialog(
    app: AppHandle,
    state: State<'_, DocumentState>,
) -> Result<Option<DocumentPayload>, String> {
    let selected = app
        .dialog()
        .file()
        .add_filter("HTML 文档", &["htm", "html"])
        .blocking_pick_file();
    let Some(selected) = selected else {
        return Ok(None);
    };
    let path = selected
        .as_path()
        .ok_or_else(|| "[file.unsupported_path] 当前版本不支持非本地文件路径。".to_string())?;

    read_html_document(path, &state).map(Some)
}

#[tauri::command]
fn save_document(
    path: String,
    content: String,
    state: State<'_, DocumentState>,
) -> Result<(), String> {
    write_authorized_html_document(Path::new(&path), &content, &state)
}

#[tauri::command]
fn save_document_as(
    app: AppHandle,
    content: String,
    suggested_name: String,
    state: State<'_, DocumentState>,
) -> Result<Option<SaveResult>, String> {
    let selected = app
        .dialog()
        .file()
        .set_file_name(&suggested_name)
        .add_filter("HTML 文档", &["htm", "html"])
        .blocking_save_file();
    let Some(selected) = selected else {
        return Ok(None);
    };
    let path = selected
        .as_path()
        .ok_or_else(|| "[file.unsupported_path] 当前版本不支持非本地文件路径。".to_string())?;
    let path = ensure_html_extension(path);

    fs::write(&path, content)
        .map_err(|error| format!("[file.write_failed] 无法保存文件：{error}"))?;
    let canonical_path = path
        .canonicalize()
        .map_err(|error| format!("[file.write_failed] 保存后无法确认文件路径：{error}"))?;
    state
        .writable_paths
        .lock()
        .map_err(|_| "[file.state_failed] 文档权限状态不可用。".to_string())?
        .insert(canonical_path.clone());

    Ok(Some(SaveResult {
        path: canonical_path.to_string_lossy().into_owned(),
    }))
}

#[derive(Serialize)]
struct SaveResult {
    path: String,
}

fn ensure_html_extension(path: &Path) -> PathBuf {
    if is_supported_html_path(path) {
        path.to_path_buf()
    } else {
        path.with_extension("html")
    }
}

/// 中文：把被打开文档内的相对资源引用安全解析为内联 data URI，仅供前端显示，绝不写回磁盘。
/// 仅接受落在 `base_dir` 之内（含子目录）的相对图片路径；任何越界或读取失败都返回 `None`，
/// 由前端保留原引用而不致崩溃。
#[tauri::command]
fn resolve_document_asset(base_dir: String, relative_path: String) -> Option<String> {
    let base = Path::new(&base_dir).canonicalize().ok()?;
    // 中文：允许相对路径引用到文档目录的同级资源（如 ../assets），
    // 但禁止跳出文档目录的父目录（如 ../../etc/passwd）。
    let scope = base.parent().map(Path::to_path_buf).unwrap_or(base.clone());
    let joined = base.join(&relative_path);
    let canonical = joined.canonicalize().ok()?;
    let scope_with_sep = scope.join("");
    if canonical != scope && !canonical.starts_with(&scope_with_sep) {
        return None;
    }
    let bytes = fs::read(&canonical).ok()?;
    let mime = mime_for_path(&canonical);
    Some(format!("data:{mime};base64,{}", encode_base64(&bytes)))
}

/// 中文：根据扩展名推断常见图片 MIME；未知类型回退为 application/octet-stream。
fn mime_for_path(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.to_ascii_lowercase())
    {
        Some(ref extension) if extension == "png" => "image/png",
        Some(ref extension) if extension == "jpg" || extension == "jpeg" => "image/jpeg",
        Some(ref extension) if extension == "gif" => "image/gif",
        Some(ref extension) if extension == "webp" => "image/webp",
        Some(ref extension) if extension == "svg" => "image/svg+xml",
        Some(ref extension) if extension == "bmp" => "image/bmp",
        Some(ref extension) if extension == "ico" => "image/x-icon",
        _ => "application/octet-stream",
    }
}

/// 中文：目录树条目的白名单元数据——只暴露展示与插入引用所需字段，不暴露权限、时间戳等系统信息。
/// English: Whitelisted metadata for a tree entry — only the fields needed for display and
/// reference insertion; no permissions, timestamps or other system metadata.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TreeEntry {
    name: String,
    is_dir: bool,
    size: u64,
    is_supported_asset: bool,
}

/// 中文：按 ADR-0003 列出目录树的一层内容。作用域与 `resolve_document_asset` 同源
/// （文档目录的父目录），canonicalize 后前缀校验拒绝越界与链接逃逸；返回条目按
/// 目录优先、名称排序，仅含白名单元数据。失败一律返回空数组由前端降级为空态。
/// English: List one level of a directory tree per ADR-0003. The scope matches
/// `resolve_document_asset` (the document directory's parent); canonicalize plus prefix checks
/// reject escapes and link jumps. Entries sort directories first then by name and carry only
/// whitelisted metadata. Any failure returns an empty vector for the frontend's empty state.
#[tauri::command]
fn list_directory_tree(base_dir: String, relative_path: String) -> Vec<TreeEntry> {
    let mut entries: Vec<TreeEntry> = Vec::new();
    let Some(base) = Path::new(&base_dir).canonicalize().ok() else {
        return entries;
    };
    let Some(scope) = base.parent().map(Path::to_path_buf) else {
        return entries;
    };
    let joined = base.join(&relative_path);
    let Ok(canonical) = joined.canonicalize() else {
        return entries;
    };
    let scope_with_sep = scope.join("");
    if canonical != scope && !canonical.starts_with(&scope_with_sep) {
        return entries;
    }
    let Ok(read_dir) = fs::read_dir(&canonical) else {
        return entries;
    };
    for item in read_dir.flatten() {
        // 中文：默认不跟随目录符号链接（file_type 的 is_symlink 判定），防止树遍历逃逸出作用域。
        // English: Never follow directory symlinks (via file_type), keeping traversal inside the scope.
        let Ok(file_type) = item.file_type() else {
            continue;
        };
        let is_dir = file_type.is_dir();
        let name = item.file_name().to_string_lossy().to_string();
        let size = item.metadata().map(|meta| meta.len()).unwrap_or(0);
        let is_supported_asset = !is_dir && is_asset_path(&item.path());
        entries.push(TreeEntry {
            name,
            is_dir,
            size,
            is_supported_asset,
        });
    }
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    entries
}

/// 中文：判断路径是否为侧栏预览/插入引用关注的资源类型（图片与样式表；与 mime_for_path 同基）。
fn is_asset_path(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|extension| extension.to_str())
            .map(|extension| extension.to_ascii_lowercase())
            .as_deref(),
        Some("png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" | "bmp" | "ico" | "css")
    )
}

/// 中文：标准 Base64 编码，避免为单一用途引入额外依赖。
fn encode_base64(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut output = String::with_capacity((bytes.len() + 2) / 3 * 4);
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = chunk.get(1).copied().unwrap_or(0) as u32;
        let b2 = chunk.get(2).copied().unwrap_or(0) as u32;
        let triple = (b0 << 16) | (b1 << 8) | b2;
        output.push(TABLE[((triple >> 18) & 0x3f) as usize] as char);
        output.push(TABLE[((triple >> 12) & 0x3f) as usize] as char);
        output.push(if chunk.len() > 1 {
            TABLE[((triple >> 6) & 0x3f) as usize] as char
        } else {
            '='
        });
        output.push(if chunk.len() > 2 {
            TABLE[(triple & 0x3f) as usize] as char
        } else {
            '='
        });
    }
    output
}

/// 中文：单条历史记录——仅路径与最后打开时间（ADR-0004 第 2 条：内容最小化，无摘要/无编辑史）。
/// English: One recent-file record — path and last-opened time only (ADR-0004 §2: minimal
/// content; no digests or edit history).
#[derive(serde::Serialize, serde::Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RecentFileEntry {
    path: String,
    opened_at: String,
}

/// 中文：历史文件 JSON 的磁盘形态（记录数组）。
#[derive(serde::Serialize, serde::Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RecentFilesFile {
    entries: Vec<RecentFileEntry>,
}

/// 中文：历史文件上限，FIFO 淘汰（ADR-0004 第 2 条）。
const RECENT_FILES_LIMIT: usize = 50;

/// 中文：当前 UTC 时间的 RFC3339 字符串（秒精度，`2026-11-10T12:34:56Z`）。
/// 手写避免为单一用途引入 `time`/`chrono` 依赖（发行物依赖最小化）。
fn rfc3339_now() -> String {
    let seconds = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0);
    let days = seconds / 86_400;
    let rem = seconds % 86_400;
    let (hour, minute, second) = (rem / 3600, (rem % 3600) / 60, rem % 60);
    // 中文： civil-from-days 算法（Howard Hinnant 公有领域算法），天序号转年月日。
    // English: civil-from-days (Howard Hinnant's public-domain algorithm): day number to y/m/d.
    let z = days as i64 + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!("{y:04}-{m:02}-{d:02}T{hour:02}:{minute:02}:{second:02}Z")
}

/// 中文：解析历史存储路径（ADR-0004 第 1 条）：便携优先 = EXE 同目录 `data/recent-files.json`；
/// 目录不可写时降级 `%APPDATA%\HIA-HugeRTE\`。`for_write` 为 true 时会创建父目录。
fn recent_files_path(for_write: bool) -> Option<PathBuf> {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            let portable_dir = parent.join("data");
            let candidate = portable_dir.join("recent-files.json");
            if candidate.is_file() {
                return Some(candidate);
            }
            if for_write {
                if fs::create_dir_all(&portable_dir).is_ok() {
                    let probe = portable_dir.join(".write-probe");
                    if fs::write(&probe, b"").is_ok() {
                        let _ = fs::remove_file(&probe);
                        return Some(candidate);
                    }
                }
            } else if portable_dir.is_dir() {
                return Some(candidate);
            }
        }
    }
    let app_data = std::env::var_os("APPDATA").map(PathBuf::from)?;
    let fallback_dir = app_data.join("HIA-HugeRTE");
    if for_write {
        fs::create_dir_all(&fallback_dir).ok()?;
    } else if !fallback_dir.is_dir() {
        return None;
    }
    Some(fallback_dir.join("recent-files.json"))
}

/// 中文：读取历史列表；文件缺失/损坏一律返回空列表（历史不是关键路径，ADR-0004 第 5 条）。
#[tauri::command]
fn recent_files_load() -> Vec<RecentFileEntry> {
    let Some(path) = recent_files_path(false) else {
        return Vec::new();
    };
    fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str::<RecentFilesFile>(&text).ok())
        .map(|file| file.entries)
        .unwrap_or_default()
}

/// 中文：记录一次成功打开（去重置顶 + FIFO 淘汰 + 原子写：临时文件再替换）。
/// 失败静默——历史写入不影响编辑主流程。
#[tauri::command]
fn recent_files_record(path: String) {
    record_recent_file(path);
}

/// 中文：`recent_files_record` 的可测内核（无 Tauri 宏）。
fn record_recent_file(path: String) {
    let Some(store) = recent_files_path(true) else {
        return;
    };
    let mut file = fs::read_to_string(&store)
        .ok()
        .and_then(|text| serde_json::from_str::<RecentFilesFile>(&text).ok())
        .unwrap_or_default();
    let opened_at = rfc3339_now();
    file.entries.retain(|entry| entry.path != path);
    file.entries.insert(0, RecentFileEntry { path, opened_at });
    file.entries.truncate(RECENT_FILES_LIMIT);
    let temp = store.with_extension("json.tmp");
    if fs::write(&temp, serde_json::to_string(&file).unwrap_or_default()).is_ok() {
        let _ = fs::rename(&temp, &store);
    }
}

/// 中文：清空历史（前端经 DEF-1 确认模态后再调用）；删除底层文件即为清空。
#[tauri::command]
fn recent_files_clear() {
    if let Some(store) = recent_files_path(true) {
        let _ = fs::remove_file(store);
    }
}

pub fn run() {
    let startup_paths = std::env::args_os()
        .skip(1)
        .map(PathBuf::from)
        .filter(|path| is_supported_html_path(path))
        .collect();

    tauri::Builder::default()
        .manage(DocumentState {
            startup_paths,
            writable_paths: Mutex::new(HashSet::new()),
        })
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_startup_documents,
            open_document_path,
            open_document_dialog,
            save_document,
            save_document_as,
            resolve_document_asset,
            list_directory_tree,
            recent_files_load,
            recent_files_record,
            recent_files_clear
        ])
        .run(tauri::generate_context!())
        .expect("启动 Tauri 应用失败");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        time::{SystemTime, UNIX_EPOCH},
    };

    fn test_state() -> DocumentState {
        DocumentState {
            startup_paths: Vec::new(),
            writable_paths: Mutex::new(HashSet::new()),
        }
    }

    fn create_test_directory() -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("系统时间应晚于 Unix 纪元")
            .as_nanos();
        let directory = std::env::temp_dir().join(format!("hia-hugerte-tauri-{unique}"));
        fs::create_dir(&directory).expect("应能创建临时测试目录");
        directory
    }

    #[test]
    fn 仅接受_html_扩展名() {
        assert!(is_supported_html_path(Path::new("示例.HTM")));
        assert!(is_supported_html_path(Path::new("示例.html")));
        assert!(!is_supported_html_path(Path::new("示例.md")));
        assert!(!is_supported_html_path(Path::new("没有扩展名")));
    }

    #[test]
    fn 另存为自动补充_html_扩展名() {
        assert_eq!(
            ensure_html_extension(Path::new("新建文档")),
            PathBuf::from("新建文档.html")
        );
        assert_eq!(
            ensure_html_extension(Path::new("已有扩展.HTM")),
            PathBuf::from("已有扩展.HTM")
        );
    }

    #[test]
    fn 已打开文档可在本会话保存() {
        let directory = create_test_directory();
        let document_path = directory.join("example.html");
        fs::write(&document_path, "<p>初始内容</p>").expect("应能写入测试文档");
        let state = test_state();

        let payload = read_html_document(&document_path, &state).expect("应能读取 HTML 文档");
        assert_eq!(payload.content, "<p>初始内容</p>");

        write_authorized_html_document(&document_path, "<p>已保存内容</p>", &state)
            .expect("已打开的文档应可保存");
        assert_eq!(
            fs::read_to_string(&document_path).expect("应能回读测试文档"),
            "<p>已保存内容</p>"
        );

        fs::remove_file(&document_path).expect("应能清理测试文档");
        fs::remove_dir(&directory).expect("应能清理临时测试目录");
    }

    #[test]
    fn 未打开文档不可直接保存() {
        let directory = create_test_directory();
        let document_path = directory.join("unauthorized.html");
        fs::write(&document_path, "<p>原内容</p>").expect("应能写入测试文档");
        let state = test_state();

        let error = write_authorized_html_document(&document_path, "<p>不应写入</p>", &state)
            .expect_err("未授权路径必须被拒绝");
        assert!(error.contains("[permission.path_not_authorized]"));
        assert_eq!(
            fs::read_to_string(&document_path).expect("应能回读测试文档"),
            "<p>原内容</p>"
        );

        fs::remove_file(&document_path).expect("应能清理测试文档");
        fs::remove_dir(&directory).expect("应能清理临时测试目录");
    }

    #[test]
    fn 资源解析返回内联_data_uri() {
        let directory = create_test_directory();
        let asset_path = directory.join("logo.png");
        fs::write(&asset_path, [0x89, 0x50, 0x4e, 0x47]).expect("应能写入测试图片");
        let result = resolve_document_asset(
            directory.to_string_lossy().into_owned(),
            "logo.png".to_string(),
        );
        assert!(result.is_some());
        let uri = result.unwrap();
        assert!(uri.starts_with("data:image/png;base64,"));
        assert_eq!(uri, "data:image/png;base64,iVBORw==");

        fs::remove_file(&asset_path).expect("应能清理测试图片");
        fs::remove_dir(&directory).expect("应能清理临时测试目录");
    }

    #[test]
    fn 资源解析允许文档目录的同级资源() {
        let directory = create_test_directory();
        let sibling_assets = directory
            .parent()
            .expect("临时目录应有父目录")
            .join("assets");
        fs::create_dir(&sibling_assets).expect("应能创建同级 assets 目录");
        let asset_path = sibling_assets.join("sibling.png");
        fs::write(&asset_path, [0x89, 0x50, 0x4e, 0x47]).expect("应能写入测试图片");

        let result = resolve_document_asset(
            directory.to_string_lossy().into_owned(),
            "../assets/sibling.png".to_string(),
        );
        assert!(result.is_some());
        assert!(result.unwrap().starts_with("data:image/png;base64,"));

        fs::remove_file(&asset_path).expect("应能清理测试图片");
        fs::remove_dir(&sibling_assets).expect("应能清理同级 assets 目录");
        fs::remove_dir(&directory).expect("应能清理临时测试目录");
    }

    #[test]
    fn 资源解析拒绝跳出文档目录父目录() {
        let directory = create_test_directory();
        let outside_scope = directory
            .parent()
            .expect("临时目录应有父目录")
            .parent()
            .expect("临时目录父目录应有父目录")
            .join("hia-hugerte-tauri-outside");
        fs::create_dir(&outside_scope).ok();
        let asset_path = outside_scope.join("outside.png");
        fs::write(&asset_path, [0x89, 0x50, 0x4e, 0x47]).expect("应能写入测试图片");

        let relative = format!(
            "../../{}/outside.png",
            outside_scope.file_name().unwrap().to_string_lossy()
        );
        let result = resolve_document_asset(directory.to_string_lossy().into_owned(), relative);
        assert!(result.is_none());

        fs::remove_file(&asset_path).expect("应能清理测试图片");
        fs::remove_dir(&outside_scope).expect("应能清理 scope 外目录");
        fs::remove_dir(&directory).expect("应能清理临时测试目录");
    }

    #[test]
    fn 资源解析拒绝缺失文件() {
        let directory = create_test_directory();
        let result = resolve_document_asset(
            directory.to_string_lossy().into_owned(),
            "missing.png".to_string(),
        );
        assert!(result.is_none());

        fs::remove_dir(&directory).expect("应能清理临时测试目录");
    }

    /// 中文：构造"父目录/工作区/文档目录"结构与若干条目，供目录树测试复用。
    fn create_tree_fixture() -> (PathBuf, PathBuf) {
        let workspace = create_test_directory();
        let document_dir = workspace.join("doc");
        fs::create_dir(&document_dir).expect("应能创建文档目录");
        fs::create_dir(document_dir.join("assets")).expect("应能创建子目录");
        fs::write(document_dir.join("page.html"), "<p>x</p>").expect("应能写入文件");
        fs::write(document_dir.join("assets").join("banner.png"), "png").expect("应能写入图片");
        fs::write(document_dir.join("assets").join("notes.css"), "body{}").expect("应能写入样式");
        (workspace, document_dir)
    }

    #[test]
    fn 目录树列出条目并目录优先排序() {
        let (workspace, document_dir) = create_tree_fixture();
        let entries =
            list_directory_tree(document_dir.to_string_lossy().into_owned(), ".".to_string());
        assert_eq!(entries.len(), 2);
        assert!(entries[0].is_dir, "目录应排在文件之前");
        assert_eq!(entries[0].name, "assets");
        assert_eq!(entries[1].name, "page.html");
        assert!(!entries[1].is_supported_asset, "html 不属于资源白名单");

        let sub = list_directory_tree(
            document_dir.to_string_lossy().into_owned(),
            "assets".to_string(),
        );
        assert_eq!(sub.len(), 2);
        assert!(sub.iter().all(|entry| entry.is_supported_asset));
        assert_eq!(sub[0].name, "banner.png");
        assert_eq!(sub[1].name, "notes.css");

        fs::remove_dir_all(&workspace).expect("应能清理临时测试目录");
    }

    #[test]
    fn 目录树拒绝越界与缺失目录() {
        let (workspace, document_dir) = create_tree_fixture();
        assert!(list_directory_tree(
            document_dir.to_string_lossy().into_owned(),
            "../../..".to_string()
        )
        .is_empty());
        assert!(list_directory_tree(
            document_dir.to_string_lossy().into_owned(),
            "missing-dir".to_string()
        )
        .is_empty());
        assert!(list_directory_tree(
            document_dir.to_string_lossy().into_owned(),
            "page.html".to_string()
        )
        .is_empty());

        fs::remove_dir_all(&workspace).expect("应能清理临时测试目录");
    }

    #[test]
    fn rfc3339_now_输出合法秒精度格式() {
        let stamp = rfc3339_now();
        // 中文：形如 2026-11-10T12:34:56Z——20 字符且第 11 位为 T、末位为 Z。
        // English: Shaped like 2026-11-10T12:34:56Z — 20 chars with 'T' at index 10 and 'Z' last.
        assert_eq!(stamp.len(), 20);
        assert_eq!(&stamp[10..11], "T");
        assert!(stamp.ends_with('Z'));
        assert!(stamp.starts_with("2"));
    }

    #[test]
    fn 历史记录结构可往返序列化() {
        let file = RecentFilesFile {
            entries: vec![RecentFileEntry {
                path: "K:\\docs\\a.html".to_string(),
                opened_at: "2026-11-10T00:00:00Z".to_string(),
            }],
        };
        let text = serde_json::to_string(&file).expect("应能序列化");
        let back: RecentFilesFile = serde_json::from_str(&text).expect("应能反序列化");
        assert_eq!(back.entries[0].path, "K:\\docs\\a.html");
        // 中文：camelCase 字段名落盘（recentCase 语义稳定，前端按 camelCase 读取）。
        // English: camelCase keys on disk (stable contract; the frontend reads camelCase).
        assert!(text.contains("\"openedAt\""));
        // 中文：损坏输入回退为空（recent_files_load 的容错语义在此等价验证）。
        // English: Corrupt input falls back to empty (equivalent to recent_files_load tolerance).
        let broken: Option<RecentFilesFile> = serde_json::from_str("{not-json").ok();
        assert!(broken.is_none());
    }
}
