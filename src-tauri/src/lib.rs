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
            resolve_document_asset
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
}
