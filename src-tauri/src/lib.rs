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

/// 中文：按 ADR-0003（2026-11-10 修订版）列出**指定绝对目录**的一层内容。
/// 浏览由用户手势逐级导航驱动（面包屑/向上/树内双击），因此这里接受绝对路径；安全约束为：
/// 必须是真实存在的目录（拒绝设备路径与非目录）、不跟随目录符号链接、只返回白名单元数据。
/// 注意与 `resolve_document_asset` 的区别：那个是"文档内容驱动"的读取，仍严格限制在文档
/// 目录父级作用域内；本命令是"用户手势驱动"的浏览，不写入任何文件。
/// English: List one level of the given **absolute directory** per ADR-0003 (revised 2026-11-10).
/// Browsing is driven by explicit user gestures (breadcrumb / Up / double-click), so an absolute
/// path is accepted; the safety constraints are: it must be an existing real directory (device
/// paths and non-directories rejected), directory symlinks are not followed, and only whitelisted
/// metadata is returned. Contrast `resolve_document_asset`, which is document-content-driven and
/// stays strictly inside the document directory's parent scope; this command is user-gesture
/// driven and never writes anything.
#[tauri::command]
fn list_directory_tree(absolute_path: String) -> Vec<TreeEntry> {
    let mut entries: Vec<TreeEntry> = Vec::new();
    // 中文：`read_html_document` 返回的 base_dir 本身就是 canonicalize 后的 `\\?\C:\...` 扩展长度形式，
    // 因此**不能**把 `\\?\` 当设备路径拒绝；只拒绝 `\\.\` 设备命名空间。
    // English: `read_html_document` returns base_dir in the canonicalized `\\?\C:\...` extended-length
    // form, so `\\?\` must NOT be rejected as a device path; only the `\\.\` device namespace is.
    if absolute_path.starts_with("\\\\.\\") {
        return entries;
    }
    let Ok(canonical) = Path::new(&absolute_path).canonicalize() else {
        return entries;
    };
    // 中文：只接受真实目录——普通文件一律拒绝。
    // English: Real directories only — plain files are rejected.
    if !canonical.is_dir() {
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

// ===== 授权式「打开方式候选注册」（ADR-0001 2026-11-12 修订版修订条目 1） =====
//
// 中文：语义边界（ADR 定案）——只能由用户在应用内**显式触发**；每用户（HKCU）；可一键撤销；
//       不写 `UserChoice`（系统 hash 保护且属默认接管）、不设默认关联、不触碰任何提权位置。
// 注册形态：`Applications\<exe名>` 定义本应用 + 两个扩展名的 `OpenWithList` 候选登记，
// 使 Windows「打开方式」列表出现本应用；用户仍需在系统界面中自行选择。
// 实现经系统 `reg.exe`（固定 System32 绝对路径，不经 PATH 解析），避免引入新的注册表 crate。
//
// English: Semantic boundary (decided in the ADR) — only on **explicit user action**; per-user
//       (HKCU); one-click removable; never writes `UserChoice` (hash-protected and a default
//       takeover), never sets a default handler, never touches privileged hives. Registration form:
//       `Applications\<exe name>` defines this app plus `OpenWithList` candidate entries for both
//       extensions, which makes the app appear in the Windows "Open with" list; the user still
//       picks it in the system UI. Implemented through the system `reg.exe` (absolute System32 path,
//       never resolved via PATH) to avoid adding a registry crate.

/// 中文：`Applications` 与 `OpenWithList` 中使用的可执行文件名（固定，不随构建目录变化）。
/// English: Executable name used under `Applications` and `OpenWithList` (fixed, independent of the
/// build directory).
const ASSOCIATION_EXE_NAME: &str = "HIA HugeRTE.exe";

/// 中文：注册覆盖的扩展名（与产品范围一致：仅 .html/.htm）。
/// English: Extensions covered by the registration (matching product scope: `.html`/`.htm` only).
const ASSOCIATION_EXTENSIONS: [&str; 2] = [".html", ".htm"];

/// 中文：注册状态（前端据此显示「注册/移除」按钮与说明）。
/// English: Registration status (drives the frontend's register/remove button and explanation).
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AssociationStatus {
    /// 中文：是否已注册（`Applications` 下的命令指向当前程序）。 / English: Whether registered (the command under `Applications` points at this executable).
    registered: bool,
    /// 中文：当前程序的完整路径（前端展示"注册的就是这个位置"）。 / English: Full path of this executable (the frontend shows "this is the registered location").
    current_exe: String,
}

/// 中文：本应用的「打开方式」命令行形态：`"<exe>" "%1"`（`%1` 由 Windows 启动时替换）。
/// English: This app's "Open with" command line: `"<exe>" "%1"` (`%1` is substituted by Windows).
fn association_command_line(exe: &Path) -> String {
    format!("\"{}\" \"%1\"", exe.display())
}

/// 中文：`reg.exe` 的固定路径（System32 下），避免经 PATH 解析到被替换的同名程序。
/// English: Fixed path to `reg.exe` under System32 so PATH cannot resolve to an impostor.
fn reg_exe_path() -> PathBuf {
    let system_root = std::env::var_os("SystemRoot")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(r"C:\Windows"));
    system_root.join("System32").join("reg.exe")
}

/// 中文：`Applications\<exe名>\shell\open\command` 的完整键路径。
/// English: Full registry key path for `Applications\<exe name>\shell\open\command`.
fn association_command_key() -> String {
    format!(r"HKCU\Software\Classes\Applications\{ASSOCIATION_EXE_NAME}\shell\open\command")
}

/// 中文：注册操作序列的可测内核（不含副作用）：依次写入应用定义、友好名与两个扩展名的候选登记。
/// 每条命令为 `reg.exe` 的完整参数表，供 `run_reg` 直接执行。
/// English: Testable core of the registration sequence (no side effects): writes the application
/// definition, the friendly name and the candidate entries for both extensions. Each command is the
/// complete argument list for `reg.exe`, executed directly by `run_reg`.
fn association_register_operations(exe: &Path) -> Vec<Vec<String>> {
    let applications_key = format!(r"HKCU\Software\Classes\Applications\{ASSOCIATION_EXE_NAME}");
    let mut operations = vec![
        // 中文：应用定义——「打开方式」列表中显示的名字。
        // English: Application definition — the name shown in the "Open with" list.
        vec![
            "add".to_string(),
            applications_key.clone(),
            "/v".to_string(),
            "FriendlyAppName".to_string(),
            "/t".to_string(),
            "REG_SZ".to_string(),
            "/d".to_string(),
            "HIA HugeRTE".to_string(),
            "/f".to_string(),
        ],
        // 中文：应用启动命令——带引号的 exe 路径加 `"%1"` 文档参数。
        // English: Launch command — quoted executable path plus the `"%1"` document argument.
        vec![
            "add".to_string(),
            format!(r"{applications_key}\shell\open\command"),
            "/ve".to_string(),
            "/t".to_string(),
            "REG_SZ".to_string(),
            "/d".to_string(),
            association_command_line(exe),
            "/f".to_string(),
        ],
    ];
    // 中文：两个扩展名的候选登记（值名 = 可执行文件名，值为空字符串）。
    // English: Candidate entries for both extensions (value name = executable name, empty value).
    for extension in ASSOCIATION_EXTENSIONS {
        operations.push(vec![
            "add".to_string(),
            format!(r"HKCU\Software\Classes\{extension}\OpenWithList"),
            "/v".to_string(),
            ASSOCIATION_EXE_NAME.to_string(),
            "/t".to_string(),
            "REG_SZ".to_string(),
            "/d".to_string(),
            String::new(),
            "/f".to_string(),
        ]);
    }
    operations
}

/// 中文：移除操作序列的可测内核：删除两个扩展名的候选值与应用定义键（对等清理，不留残留）。
/// English: Testable core of the removal sequence: deletes both extension candidate values and the
/// application definition key (symmetric cleanup, no leftovers).
fn association_unregister_operations() -> Vec<Vec<String>> {
    let mut operations = Vec::new();
    for extension in ASSOCIATION_EXTENSIONS {
        operations.push(vec![
            "delete".to_string(),
            format!(r"HKCU\Software\Classes\{extension}\OpenWithList"),
            "/v".to_string(),
            ASSOCIATION_EXE_NAME.to_string(),
            "/f".to_string(),
        ]);
    }
    operations.push(vec![
        "delete".to_string(),
        format!(r"HKCU\Software\Classes\Applications\{ASSOCIATION_EXE_NAME}"),
        "/f".to_string(),
    ]);
    operations
}

/// 中文：执行一条 `reg.exe` 命令；失败时返回带命令上下文的错误（不吞错）。
/// English: Run one `reg.exe` command; on failure return an error carrying the command context
/// (never swallowed).
fn run_reg(arguments: &[String]) -> Result<(), String> {
    let output = std::process::Command::new(reg_exe_path())
        .args(arguments)
        .output()
        .map_err(|error| format!("[registry.command] 无法执行 reg.exe：{error}"))?;
    if output.status.success() {
        return Ok(());
    }
    let stderr = String::from_utf8_lossy(&output.stderr);
    Err(format!(
        "[registry.command] 注册表操作失败（{}）：{}",
        arguments.first().cloned().unwrap_or_default(),
        stderr.trim()
    ))
}

/// 中文：查询当前是否已注册（读取 `Applications` 下的命令并与当前路径比较）。
/// English: Query whether the app is currently registered (read the command under `Applications`
/// and compare it with the current path).
fn association_is_registered(exe: &Path) -> bool {
    let output = std::process::Command::new(reg_exe_path())
        .args(["query", &association_command_key(), "/ve"])
        .output();
    let Ok(output) = output else {
        return false;
    };
    if !output.status.success() {
        return false;
    }
    // 中文：输出形如 `    (默认)    REG_SZ    "C:\...\app.exe" "%1"`；取 REG_SZ 之后的部分比较。
    // English: Output looks like `    (default)    REG_SZ    "C:\...\app.exe" "%1"`; compare the
    //       part after REG_SZ.
    let text = String::from_utf8_lossy(&output.stdout);
    let expected = association_command_line(exe);
    text.lines().any(|line| {
        line.split_once("REG_SZ")
            .map(|(_, value)| value.trim() == expected)
            .unwrap_or(false)
    })
}

/// 中文：读取关联状态（只读；前端进入设置面时调用）。
/// English: Read the association status (read-only; called when the frontend opens the settings surface).
#[tauri::command]
fn open_with_status() -> AssociationStatus {
    let exe = std::env::current_exe().unwrap_or_default();
    AssociationStatus {
        registered: association_is_registered(&exe),
        current_exe: exe.display().to_string(),
    }
}

/// 中文：注册为「打开方式」候选（用户显式触发）。逐条执行并保留失败上下文；成功后再回读校验。
/// English: Register as an "Open with" candidate (explicit user action). Runs each command keeping
/// the failure context and re-reads the state to verify success.
#[tauri::command]
fn open_with_register() -> Result<AssociationStatus, String> {
    let exe = std::env::current_exe()
        .map_err(|error| format!("[registry.exe] 无法确定程序路径：{error}"))?;
    for operation in association_register_operations(&exe) {
        run_reg(&operation)?;
    }
    if !association_is_registered(&exe) {
        return Err("[registry.verify] 注册完成但回读校验未通过。".to_string());
    }
    Ok(AssociationStatus {
        registered: true,
        current_exe: exe.display().to_string(),
    })
}

/// 中文：移除「打开方式」候选登记（对等清理）。已不存在时视为成功（幂等），最终回读确认。
/// English: Remove the "Open with" candidate registration (symmetric cleanup). Absent entries count
/// as success (idempotent); the final re-read confirms the outcome.
#[tauri::command]
fn open_with_unregister() -> Result<AssociationStatus, String> {
    let exe = std::env::current_exe()
        .map_err(|error| format!("[registry.exe] 无法确定程序路径：{error}"))?;
    for operation in association_unregister_operations() {
        // 中文：删除不存在的值/键会返回非零码，按幂等处理——记录但不中止。
        // English: Deleting a missing value/key returns a non-zero code; treat as idempotent —
        //       record but do not abort.
        let _ = run_reg(&operation);
    }
    Ok(AssociationStatus {
        registered: association_is_registered(&exe),
        current_exe: exe.display().to_string(),
    })
}

// ===== 更新提示（ADR-0001 修订条目 2 的零网络形态） =====
//
// 中文：形态边界（2026-11-12 维护者定案「按建议」）：**只显示版本号 + 打开下载页**，
//       不发任何网络请求、不检查远端版本、不自动下载。因此不需要 HTTP 依赖，也不改变 CSP
//       （页面通过系统默认浏览器打开，不在应用内加载远端内容）。
// English: Shape boundary (maintainer decision 2026-11-12: "follow the recommendation"): **show the
//       version and open the download page only** — no network request, no remote version check, no
//       automatic download. Hence no HTTP dependency and no CSP change (the page opens in the system
//       default browser, never inside the app).

/// 中文：公开下载页（GitHub Releases 列表）。仅在用户点击时经系统浏览器打开。
/// English: Public download page (GitHub Releases list). Opened in the system browser only on click.
const RELEASES_PAGE_URL: &str = "https://github.com/mandolin/HIA-HugeRTE-Tauri/releases";

/// 中文：应用版本信息（前端设置面展示；版本号来自编译期 `CARGO_PKG_VERSION`，与三源一致）。
/// English: Application version info (shown in the settings surface; the version comes from
/// `CARGO_PKG_VERSION` at compile time, consistent with the three version sources).
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AppVersionInfo {
    /// 中文：当前版本号（如 `0.2.1-fix.1`）。 / English: Current version (e.g. `0.2.1-fix.1`).
    version: String,
    /// 中文：下载页地址（供前端「打开下载页」按钮说明与跳转）。 / English: Download page URL (shown/opened by the frontend's button).
    releases_url: String,
}

/// 中文：读取版本与下载页地址（只读、无网络）。
/// English: Read the version and download page URL (read-only, no network).
#[tauri::command]
fn app_version_info() -> AppVersionInfo {
    AppVersionInfo {
        version: env!("CARGO_PKG_VERSION").to_string(),
        releases_url: RELEASES_PAGE_URL.to_string(),
    }
}

/// 中文：在系统默认浏览器中打开下载页（用户显式点击触发）。仅允许该常量地址，不接受前端传入
/// 任意 URL——避免把「打开外部链接」变成任意外链能力面。
/// English: Open the download page in the system default browser (explicit user action). Only the
/// constant URL is allowed; the frontend cannot pass an arbitrary URL — this keeps "open an external
/// link" from becoming a general-purpose capability surface.
#[tauri::command]
fn open_releases_page() -> Result<String, String> {
    let status = std::process::Command::new("cmd")
        .args(["/C", "start", "", RELEASES_PAGE_URL])
        .status()
        .map_err(|error| format!("[shell.browser] 无法调用系统浏览器：{error}"))?;
    if !status.success() {
        return Err("[shell.browser] 系统浏览器未能打开下载页。".to_string());
    }
    Ok(RELEASES_PAGE_URL.to_string())
}

/// 中文：打开系统「默认应用」设置页（`ms-settings:defaultapps`）。用于引导用户自行选择默认程序——
/// 本应用**从不**写入默认关联（ADR-0001 修订条目 1）。固定 URI，不接受前端传入任意目标。
/// English: Open the Windows "Default apps" settings page (`ms-settings:defaultapps`). This only
/// guides the user to pick a default themselves — the app **never** writes a default association
/// (ADR-0001 revision item 1). Fixed URI; the frontend cannot pass an arbitrary target.
#[tauri::command]
fn open_default_apps_settings() -> Result<(), String> {
    let status = std::process::Command::new("cmd")
        .args(["/C", "start", "ms-settings:defaultapps"])
        .status()
        .map_err(|error| format!("[shell.settings] 无法打开系统设置：{error}"))?;
    if !status.success() {
        return Err("[shell.settings] 系统「默认应用」设置页未能打开。".to_string());
    }
    Ok(())
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
            recent_files_clear,
            open_with_status,
            open_with_register,
            open_with_unregister,
            app_version_info,
            open_releases_page,
            open_default_apps_settings
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
        let entries = list_directory_tree(document_dir.to_string_lossy().into_owned());
        assert_eq!(entries.len(), 2);
        assert!(entries[0].is_dir, "目录应排在文件之前");
        assert_eq!(entries[0].name, "assets");
        assert_eq!(entries[1].name, "page.html");
        assert!(!entries[1].is_supported_asset, "html 不属于资源白名单");

        let sub = list_directory_tree(document_dir.join("assets").to_string_lossy().into_owned());
        assert_eq!(sub.len(), 2);
        assert!(sub.iter().all(|entry| entry.is_supported_asset));
        assert_eq!(sub[0].name, "banner.png");
        assert_eq!(sub[1].name, "notes.css");

        fs::remove_dir_all(&workspace).expect("应能清理临时测试目录");
    }

    #[test]
    fn 目录树拒绝缺失目录与普通文件() {
        let (workspace, document_dir) = create_tree_fixture();
        assert!(list_directory_tree(
            document_dir
                .join("missing-dir")
                .to_string_lossy()
                .into_owned()
        )
        .is_empty());
        // 中文：普通文件不是目录，必须返回空（浏览模型只列目录内容）。
        // English: A plain file is not a directory and must yield empty (browsing lists contents).
        assert!(list_directory_tree(
            document_dir
                .join("page.html")
                .to_string_lossy()
                .into_owned()
        )
        .is_empty());
        // 中文：设备命名空间形态一律拒绝。
        // English: Device-namespace shaped paths are rejected.
        assert!(list_directory_tree("\\\\.\\C:".to_string()).is_empty());
        // 中文：canonicalize 后的 `\\?\` 扩展长度形式是内部正常形态（read_html_document 的 base_dir
        // 就是这种），必须可列——回归防线，防止误伤侧栏根目录。
        // English: The canonicalized `\\?\` extended-length form is a normal internal shape
        // (read_html_document's base_dir uses it) and must list correctly — a regression guard so the
        // explorer root is never wrongly rejected.
        let extended = document_dir
            .canonicalize()
            .expect("应能 canonicalize 测试目录");
        assert_eq!(
            list_directory_tree(extended.to_string_lossy().into_owned()).len(),
            2,
            "扩展长度路径形式必须可列目录"
        );

        fs::remove_dir_all(&workspace).expect("应能清理临时测试目录");
    }

    #[test]
    fn 目录树可浏览文档目录的上级() {
        // 中文：浏览模型允许逐级上移（与文档内容解析的作用域约束不同），作用域外的目录也能列出。
        // English: The browsing model allows ascending level by level (unlike the document-content
        // scope); directories outside the scope can be listed too.
        // 中文：只用 workspace 作为上级目录入口；绝对路径模型下文档目录不再是浏览根。
        // English: Only the workspace serves as the parent-directory entry; under the absolute-path
        // model the document directory is no longer the browsing root.
        let (workspace, _document_dir) = create_tree_fixture();
        let parents = list_directory_tree(workspace.to_string_lossy().into_owned());
        assert!(parents
            .iter()
            .any(|entry| entry.is_dir && entry.name == "doc"));

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

    #[test]
    fn 关联注册操作序列覆盖应用定义与两个扩展名的候选登记() {
        // 中文：可测内核——验证注册操作的结构（真实注册表写入由 WIN 用例/手测覆盖）。
        // English: Testable core — verifies the registration operation structure (real registry
        //       writes are covered by WIN cases / manual testing).
        let exe = Path::new(r"C:\Apps\HIA HugeRTE.exe");
        let operations = association_register_operations(exe);
        assert_eq!(operations.len(), 4, "两条应用定义 + 两个扩展名候选");
        let flattened: Vec<String> = operations.iter().flatten().cloned().collect();
        assert!(flattened
            .iter()
            .any(|part| part.contains(r"Applications\HIA HugeRTE.exe")));
        assert!(flattened
            .iter()
            .any(|part| part.ends_with(r"shell\open\command")));
        assert!(flattened
            .iter()
            .any(|part| part == r"HKCU\Software\Classes\.html\OpenWithList"));
        assert!(flattened
            .iter()
            .any(|part| part == r"HKCU\Software\Classes\.htm\OpenWithList"));
        // 中文：命令行形态必须是「引号包路径 + "%1"」，否则带空格的路径会被 Windows 拆开。
        // English: The command line must be a quoted path plus `"%1"`, otherwise paths with spaces
        //       would be split by Windows.
        assert!(flattened.contains(&r#""C:\Apps\HIA HugeRTE.exe" "%1""#.to_string()));
    }

    #[test]
    fn 关联操作只写每用户根且绝不触碰_user_choice() {
        // 中文：红线回归（ADR-0001 修订条目 1）——所有键必须是 HKCU；不得出现 UserChoice
        //       （系统 hash 保护、属默认接管），也不得出现 HKLM/HKCR 等全局或提权位置。
        // English: Red-line regression (ADR-0001 revision item 1) — every key must be HKCU; no
        //       UserChoice (hash-protected, a default takeover), no HKLM/HKCR or other global or
        //       privileged locations.
        let exe = Path::new(r"C:\Apps\HIA HugeRTE.exe");
        let mut all: Vec<String> = association_register_operations(exe)
            .into_iter()
            .flatten()
            .collect();
        all.extend(association_unregister_operations().into_iter().flatten());
        let registry_keys: Vec<&String> = all
            .iter()
            .filter(|part| {
                part.starts_with("HKCU") || part.starts_with("HKLM") || part.starts_with("HKCR")
            })
            .collect();
        assert!(!registry_keys.is_empty(), "应至少有一个注册表键");
        for key in registry_keys {
            assert!(key.starts_with("HKCU"), "只允许每用户键：{key}");
            assert!(!key.contains("UserChoice"), "不得触碰 UserChoice：{key}");
        }
    }

    #[test]
    fn 关联移除操作与应用定义对称() {
        // 中文：移除必须与注册对等——删两个扩展名候选值 + 删应用定义键，不留残留。
        // English: Removal must mirror registration — delete both extension candidate values and the
        //       application definition key, leaving no leftovers.
        let operations = association_unregister_operations();
        assert_eq!(operations.len(), 3);
        let flattened: Vec<String> = operations.iter().flatten().cloned().collect();
        assert!(flattened.iter().all(|part| part != "add"));
        assert!(
            flattened
                .iter()
                .filter(|part| part.as_str() == "delete")
                .count()
                == 3
        );
        assert!(flattened.contains(&r"HKCU\Software\Classes\.html\OpenWithList".to_string()));
        assert!(flattened.contains(&r"HKCU\Software\Classes\.htm\OpenWithList".to_string()));
        assert!(
            flattened.contains(&r"HKCU\Software\Classes\Applications\HIA HugeRTE.exe".to_string())
        );
    }
}
