use std::path::{Path, PathBuf};

/// R.E.P.O. 的 Steam AppID
const REPO_APP_ID: &str = "3241660";

/// 自动探测 R.E.P.O. 游戏安装目录。
///
/// 流程:注册表取 Steam 路径 → 解析 libraryfolders.vdf 收集所有游戏库 →
/// 逐个库探测 `steamapps/common/R.E.P.O.` 或 `appmanifest_3241660.acf` →
/// 验证 `REPO.exe` 存在后返回绝对路径。
#[cfg(windows)]
#[tauri::command]
pub fn auto_detect_repo_path() -> Result<String, String> {
    let steam_path = steam_path_from_registry()
        .ok_or_else(|| "无法从注册表获取 Steam 安装路径".to_string())?;

    let mut libraries = vec![steam_path.clone()];
    let vdf_path = steam_path.join("steamapps").join("libraryfolders.vdf");
    if let Ok(content) = std::fs::read_to_string(&vdf_path) {
        libraries.extend(
            vdf_string_values(&content, "path")
                .into_iter()
                .map(PathBuf::from),
        );
    }

    find_game_in_libraries(&libraries)
        .ok_or_else(|| "未找到 R.E.P.O. 游戏安装目录".to_string())
        .map(|p| normalize(&p))
}

#[cfg(not(windows))]
#[tauri::command]
pub fn auto_detect_repo_path() -> Result<String, String> {
    Err("自动检测仅支持 Windows 系统".to_string())
}

/// 遍历所有 Steam 游戏库,探测 R.E.P.O. 安装目录。
fn find_game_in_libraries(libraries: &[PathBuf]) -> Option<PathBuf> {
    for lib in libraries {
        let steamapps = lib.join("steamapps");

        // 方式一:默认目录名 steamapps/common/R.E.P.O.
        let common_dir = steamapps.join("common").join("R.E.P.O.");
        if common_dir.join("REPO.exe").exists() {
            return Some(common_dir);
        }

        // 方式二:通过 appmanifest_3241660.acf 的 installdir 字段定位
        let acf_path = steamapps.join(format!("appmanifest_{}.acf", REPO_APP_ID));
        if let Ok(acf) = std::fs::read_to_string(&acf_path) {
            if let Some(installdir) = vdf_string_values(&acf, "installdir").into_iter().next() {
                let game_dir = steamapps.join("common").join(installdir);
                if game_dir.join("REPO.exe").exists() {
                    return Some(game_dir);
                }
            }
        }
    }
    None
}

/// 从 Windows 注册表获取 Steam 安装路径。
/// 优先读取 HKCU 的 SteamPath,兜底读取 HKLM 的 InstallPath。
#[cfg(windows)]
fn steam_path_from_registry() -> Option<PathBuf> {
    use winreg::enums::*;
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if let Ok(key) = hkcu.open_subkey(r"Software\Valve\Steam") {
        if let Ok(path) = key.get_value::<String, _>("SteamPath") {
            return Some(PathBuf::from(path));
        }
    }

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    if let Ok(key) = hklm.open_subkey(r"SOFTWARE\WOW6432Node\Valve\Steam") {
        if let Ok(path) = key.get_value::<String, _>("InstallPath") {
            return Some(PathBuf::from(path));
        }
    }

    None
}

/// 规范化路径:去除 Windows 长路径前缀 `\\?\`。
fn normalize(path: &Path) -> String {
    dunce::canonicalize(path)
        .unwrap_or_else(|_| path.to_path_buf())
        .to_string_lossy()
        .into_owned()
}

/// 简易 VDF(KeyValues)解析:提取内容中所有 `"key" "value"` 形式的 value。
fn vdf_string_values(content: &str, key: &str) -> Vec<String> {
    let mut results = Vec::new();
    let bytes = content.as_bytes();
    let mut i = 0;

    while i < bytes.len() {
        while i < bytes.len() && (bytes[i] as char).is_whitespace() {
            i += 1;
        }
        if i >= bytes.len() {
            break;
        }
        // 跳过 `{` `}` 等非字符串 token
        if bytes[i] != b'"' {
            i += 1;
            continue;
        }

        let Some((text, next)) = read_string_token(bytes, i) else {
            break;
        };
        if text == key {
            // 键匹配,读取下一个字符串 token 作为值
            let mut j = next;
            while j < bytes.len() && (bytes[j] as char).is_whitespace() {
                j += 1;
            }
            if let Some((value, after)) = read_string_token(bytes, j) {
                results.push(value);
                i = after;
                continue;
            }
        }
        i = next;
    }

    results
}

/// 从 pos 位置读取一个带引号的字符串 token,返回 (解析后的内容, 结束位置)。
fn read_string_token(bytes: &[u8], pos: usize) -> Option<(String, usize)> {
    let mut i = pos;
    while i < bytes.len() && (bytes[i] as char).is_whitespace() {
        i += 1;
    }
    if i >= bytes.len() || bytes[i] != b'"' {
        return None;
    }

    let mut j = i + 1;
    let mut out = String::new();
    while j < bytes.len() {
        match bytes[j] {
            b'"' => return Some((out, j + 1)),
            b'\\' if j + 1 < bytes.len() => {
                j += 1;
                match bytes[j] {
                    b'n' => out.push('\n'),
                    b't' => out.push('\t'),
                    b'\\' => out.push('\\'),
                    b'"' => out.push('"'),
                    other => {
                        out.push('\\');
                        out.push(other as char);
                    }
                }
            }
            b => out.push(b as char),
        }
        j += 1;
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    static COUNTER: AtomicU32 = AtomicU32::new(0);

    fn temp_dir() -> PathBuf {
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!(
            "repo_detect_test_{}_{}",
            std::process::id(),
            n
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn create_game_at(root: &Path) -> PathBuf {
        let game = root.join("steamapps").join("common").join("R.E.P.O.");
        std::fs::create_dir_all(&game).unwrap();
        std::fs::write(game.join("REPO.exe"), b"x").unwrap();
        game
    }

    #[test]
    fn test_vdf_parse_paths() {
        let vdf = r#""libraryfolders"
{
	"0"
	{
		"path"		"C:\\Program Files (x86)\\Steam"
		"label"		""
		"apps"
		{
			"3241660"		"1866265"
		}
	}
	"1"
	{
		"path"		"D:\\SteamLibrary"
	}
}"#;
        let paths = vdf_string_values(vdf, "path");
        assert_eq!(
            paths,
            vec![
                "C:\\Program Files (x86)\\Steam".to_string(),
                "D:\\SteamLibrary".to_string()
            ]
        );
    }

    #[test]
    fn test_vdf_parse_installdir() {
        let acf = r#""AppState"
{
	"appid"		"3241660"
	"name"		"R.E.P.O."
	"StateFlags"		"4"
	"installdir"		"R.E.P.O."
}"#;
        assert_eq!(
            vdf_string_values(acf, "installdir"),
            vec!["R.E.P.O.".to_string()]
        );
    }

    #[test]
    fn test_find_by_default_dir() {
        let root = temp_dir();
        let game = create_game_at(&root);
        assert_eq!(find_game_in_libraries(&[root.clone()]), Some(game));
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn test_find_by_manifest() {
        let root = temp_dir();
        let steamapps = root.join("steamapps");
        std::fs::create_dir_all(steamapps.join("common")).unwrap();
        std::fs::write(
            steamapps.join(format!("appmanifest_{}.acf", REPO_APP_ID)),
            "\"AppState\"\n{\n\t\"installdir\"\t\t\"R.E.P.O.\"\n}\n",
        )
        .unwrap();
        let game = create_game_at(&root);
        assert_eq!(find_game_in_libraries(&[root.clone()]), Some(game));
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn test_manifest_without_exe_not_found() {
        let root = temp_dir();
        let steamapps = root.join("steamapps");
        std::fs::create_dir_all(steamapps.join("common")).unwrap();
        std::fs::write(
            steamapps.join(format!("appmanifest_{}.acf", REPO_APP_ID)),
            "\"AppState\"\n{\n\t\"installdir\"\t\t\"R.E.P.O.\"\n}\n",
        )
        .unwrap();
        assert_eq!(find_game_in_libraries(&[root.clone()]), None);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn test_no_library_found() {
        let root = temp_dir();
        std::fs::create_dir_all(root.join("steamapps").join("common")).unwrap();
        assert_eq!(find_game_in_libraries(&[root.clone()]), None);
        let _ = std::fs::remove_dir_all(&root);
    }
}