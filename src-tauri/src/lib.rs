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

    Ok(DocumentPayload {
        path: canonical_path.to_string_lossy().into_owned(),
        content,
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
            save_document_as
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
}
