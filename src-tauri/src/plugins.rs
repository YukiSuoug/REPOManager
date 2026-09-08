use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

/// 启用插件目录
const PLUGINS_DIR_NAME: &str = "plugins";
/// 禁用插件隔离区目录
const DISABLED_DIR_NAME: &str = "disabled_plugins";

/// 插件卡片信息,供前端渲染。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModCardInfo {
    /// 显示名称(优先 manifest.json 的 name)
    pub name: String,
    /// 插件文件夹/文件名(用于开关操作)
    pub folder_name: String,
    /// 版本号(manifest.json 的 version_number / version)
    pub version: String,
    /// 介绍(manifest.json 的 description)
    pub description: String,
    /// 作者(manifest.json 的 author_name / author)
    pub author: String,
    pub enabled: bool,
    /// 是否为子文件夹插件(否则为单个 .dll)
    pub is_folder: bool,
    /// icon.png 的 Base64(data URI),无则 None
    pub icon_base64: Option<String>,
    /// Mod 占用的磁盘大小(字节)
    #[serde(default)]
    pub size: u64,
    /// 是否检测到对应的 .cfg 配置文件
    #[serde(default)]
    pub has_config: bool,
}

/// 扫描已安装插件,合并 plugins/ 与 disabled_plugins/ 两个目录。
///
/// 启用状态存于 `plugins/`,禁用状态存于 `disabled_plugins/`(隔离区,
/// BepInEx 不会扫描该目录,从而真正实现停用)。
#[tauri::command]
pub fn scan_plugins(game_path: String) -> Result<Vec<ModCardInfo>, String> {
    let bepinex = PathBuf::from(game_path).join("BepInEx");
    if !bepinex.is_dir() {
        return Ok(Vec::new());
    }

    let config_dir = bepinex.join("config");

    // 隔离区不存在时自动创建
    let disabled_dir = ensure_disabled_dir(&bepinex)?;

    let mut mods = Vec::new();
    let plugins_dir = bepinex.join(PLUGINS_DIR_NAME);
    if plugins_dir.is_dir() {
        scan_dir(&plugins_dir, true, &config_dir, &mut mods)?;
    }
    scan_dir(&disabled_dir, false, &config_dir, &mut mods)?;
    Ok(mods)
}

/// 扫描单个插件目录,将子文件夹与单个 .dll 写入 out。
fn scan_dir(
    dir: &Path,
    enabled: bool,
    config_dir: &Path,
    out: &mut Vec<ModCardInfo>,
) -> Result<(), String> {
    for entry in fs::read_dir(dir).map_err(|e| format!("读取插件目录失败: {e}"))? {
        let entry = entry.map_err(|e| format!("读取插件目录条目失败: {e}"))?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        let is_dir = entry.file_type().map_err(|e| e.to_string())?.is_dir();
        let size = dir_size(&path).unwrap_or(0);
        let has_config = crate::system_tools::find_matching_cfg(config_dir, &name).is_some();

        if is_dir {
            // 子文件夹插件
            let meta = read_metadata(&path, &name);
            out.push(ModCardInfo {
                name: meta.name,
                folder_name: name,
                version: meta.version,
                description: meta.description,
                author: meta.author,
                enabled,
                is_folder: true,
                icon_base64: load_icon(&path),
                size,
                has_config,
            });
        } else if name.ends_with(".dll") {
            // 单个 .dll 插件
            out.push(ModCardInfo {
                name: name.clone(),
                folder_name: name,
                version: String::new(),
                description: String::new(),
                author: String::new(),
                enabled,
                is_folder: false,
                icon_base64: None,
                size,
                has_config,
            });
        }
    }
    Ok(())
}

/// 切换单个插件的启用状态。
///
/// 通过移动实现:禁用时移入 `disabled_plugins/` 隔离区,启用时移回 `plugins/`。
#[tauri::command]
pub fn toggle_plugin(game_path: String, folder_name: String, enable: bool) -> Result<(), String> {
    validate_plugin_name(&folder_name)?;
    let bepinex = PathBuf::from(game_path).join("BepInEx");
    let plugins_dir = bepinex.join(PLUGINS_DIR_NAME);
    if !plugins_dir.is_dir() {
        return Err("未找到 BepInEx/plugins 目录".to_string());
    }

    let (from, to, to_parent) = if enable {
        (
            bepinex.join(DISABLED_DIR_NAME).join(&folder_name),
            plugins_dir.join(&folder_name),
            plugins_dir,
        )
    } else {
        let disabled_dir = ensure_disabled_dir(&bepinex)?;
        (
            plugins_dir.join(&folder_name),
            disabled_dir.join(&folder_name),
            disabled_dir,
        )
    };

    if !from.exists() {
        // 已在目标状态则视为成功,否则报错
        if to.exists() {
            return Ok(());
        }
        return Err(format!("未找到插件: {folder_name}"));
    }
    if to.exists() {
        return Err(format!("目标位置已存在同名条目: {}", to.display()));
    }
    fs::create_dir_all(&to_parent).map_err(|e| format!("创建目标目录失败: {e}"))?;
    fs::rename(&from, &to).map_err(|e| format!("切换插件状态失败: {e}"))?;
    Ok(())
}

/// 一键启用或禁用所有插件(在 plugins/ 与 disabled_plugins/ 之间整体移动)。
#[tauri::command]
pub fn toggle_all_plugins(game_path: String, enable: bool) -> Result<(), String> {
    let bepinex = PathBuf::from(game_path).join("BepInEx");
    if !bepinex.is_dir() {
        return Ok(());
    }

    let (from_dir, to_dir) = if enable {
        (bepinex.join(DISABLED_DIR_NAME), bepinex.join(PLUGINS_DIR_NAME))
    } else {
        let disabled_dir = ensure_disabled_dir(&bepinex)?;
        (bepinex.join(PLUGINS_DIR_NAME), disabled_dir)
    };

    if !from_dir.is_dir() {
        return Ok(());
    }
    fs::create_dir_all(&to_dir).map_err(|e| format!("创建目标目录失败: {e}"))?;

    for entry in fs::read_dir(&from_dir).map_err(|e| format!("读取插件目录失败: {e}"))? {
        let entry = entry.map_err(|e| format!("读取插件目录条目失败: {e}"))?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        let is_dir = entry.file_type().map_err(|e| e.to_string())?.is_dir();

        // 仅移动插件文件夹与 .dll 文件
        if !(is_dir || name.ends_with(".dll")) {
            continue;
        }
        let target = to_dir.join(&name);
        fs::rename(&path, &target).map_err(|e| format!("切换插件状态失败 {name}: {e}"))?;
    }
    Ok(())
}

/// 从硬盘彻底删除指定插件(同时清理 plugins/ 与 disabled_plugins/ 中的同名条目)。
/// 返回被删除的文件夹/文件数与总字节数。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteResult {
    pub deleted_count: u64,
    pub deleted_bytes: u64,
}

/// 递归统计路径大小。
fn dir_size(path: &Path) -> Result<u64, String> {
    let meta = fs::metadata(path).map_err(|e| format!("读取文件信息失败: {e}"))?;
    if meta.is_file() {
        return Ok(meta.len());
    }
    let mut total = 0u64;
    for entry in fs::read_dir(path).map_err(|e| format!("读取目录失败: {e}"))? {
        let entry = entry.map_err(|e| format!("读取目录条目失败: {e}"))?;
        total += dir_size(&entry.path())?;
    }
    Ok(total)
}

/// 删除指定插件(同时检查启用目录与隔离区)。
#[tauri::command]
pub fn delete_plugin(game_path: String, folder_name: String) -> Result<DeleteResult, String> {
    validate_plugin_name(&folder_name)?;
    let bepinex = PathBuf::from(game_path).join("BepInEx");
    let candidates = [
        bepinex.join(PLUGINS_DIR_NAME).join(&folder_name),
        bepinex.join(DISABLED_DIR_NAME).join(&folder_name),
    ];

    let mut deleted_count = 0u64;
    let mut deleted_bytes = 0u64;
    for path in candidates {
        if path.exists() {
            deleted_bytes += dir_size(&path)?;
            if path.is_dir() {
                fs::remove_dir_all(&path).map_err(|e| format!("删除插件文件夹失败: {e}"))?;
            } else {
                fs::remove_file(&path).map_err(|e| format!("删除插件文件失败: {e}"))?;
            }
            deleted_count += 1;
        }
    }
    if deleted_count == 0 {
        return Err(format!("未找到插件: {folder_name}"));
    }
    Ok(DeleteResult {
        deleted_count,
        deleted_bytes,
    })
}

/// 确保 disabled_plugins 隔离区目录存在并返回其路径。
fn ensure_disabled_dir(bepinex: &Path) -> Result<PathBuf, String> {
    let dir = bepinex.join(DISABLED_DIR_NAME);
    fs::create_dir_all(&dir).map_err(|e| format!("创建隔离区目录失败: {e}"))?;
    Ok(dir)
}

/// 读取插件文件夹内的 manifest.json 元数据,缺失时回退到文件夹名。
fn read_metadata(dir: &Path, fallback_name: &str) -> ModCardInfoMeta {
    let mut meta = ModCardInfoMeta {
        name: fallback_name.to_string(),
        version: String::new(),
        description: String::new(),
        author: String::new(),
    };
    let manifest_path = dir.join("manifest.json");
    let Ok(content) = fs::read_to_string(&manifest_path) else {
        return meta;
    };
    let Ok(manifest) = serde_json::from_str::<Value>(&content) else {
        return meta;
    };
    if let Some(name) = manifest.get("name").and_then(|v| v.as_str()) {
        meta.name = name.to_string();
    }
    if let Some(version) = manifest
        .get("version_number")
        .or_else(|| manifest.get("version"))
        .and_then(|v| v.as_str())
    {
        meta.version = version.to_string();
    }
    if let Some(desc) = manifest.get("description").and_then(|v| v.as_str()) {
        meta.description = desc.to_string();
    }
    if let Some(author) = manifest
        .get("author_name")
        .or_else(|| manifest.get("author"))
        .and_then(|v| v.as_str())
    {
        meta.author = author.to_string();
    }
    meta
}

struct ModCardInfoMeta {
    name: String,
    version: String,
    description: String,
    author: String,
}

/// 读取插件文件夹内的 icon.png 并编码为 Base64 data URI。
fn load_icon(dir: &Path) -> Option<String> {
    use base64::Engine;

    let icon_path = dir.join("icon.png");
    if !icon_path.is_file() {
        return None;
    }
    let bytes = fs::read(&icon_path).ok()?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(bytes);
    Some(format!("data:image/png;base64,{b64}"))
}

/// 校验插件名,防止路径穿越。
fn validate_plugin_name(name: &str) -> Result<(), String> {
    if name.is_empty()
        || name == "."
        || name == ".."
        || name.contains('/')
        || name.contains('\\')
        || name.contains("..")
    {
        return Err("无效的插件名称".to_string());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::Engine;
    use std::sync::atomic::{AtomicU32, Ordering};

    static COUNTER: AtomicU32 = AtomicU32::new(0);

    fn temp_game() -> PathBuf {
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!("plugins_test_{}_{}", std::process::id(), n));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let plugins = dir.join("BepInEx").join("plugins");
        std::fs::create_dir_all(&plugins).unwrap();
        plugins
    }

    fn game_of(plugins: &Path) -> PathBuf {
        plugins.parent().unwrap().parent().unwrap().to_path_buf()
    }

    #[test]
    fn test_scan_merges_both_dirs() {
        let plugins = temp_game();
        let disabled = plugins.parent().unwrap().join(DISABLED_DIR_NAME);
        std::fs::create_dir_all(&disabled).unwrap();
        let game = game_of(&plugins);

        // 已启用文件夹插件(带 manifest + icon)
        let mod_a = plugins.join("ModA");
        std::fs::create_dir_all(&mod_a).unwrap();
        std::fs::write(
            mod_a.join("manifest.json"),
            r#"{"name":"Mod A","version_number":"1.2.3","description":"测试 Mod","author_name":"TestAuthor"}"#,
        )
        .unwrap();
        std::fs::write(mod_a.join("ModA.dll"), b"dll").unwrap();
        std::fs::write(mod_a.join("icon.png"), b"fake-icon-bytes").unwrap();

        // 已禁用文件夹插件(位于隔离区)
        let mod_b = disabled.join("ModB");
        std::fs::create_dir_all(&mod_b).unwrap();
        std::fs::write(mod_b.join("manifest.json"), r#"{"name":"Mod B"}"#).unwrap();

        // 单个 dll(启用 + 禁用)
        std::fs::write(plugins.join("Single.dll"), b"dll").unwrap();
        std::fs::write(disabled.join("Single2.dll"), b"dll").unwrap();
        // 无关文件应被忽略
        std::fs::write(plugins.join("README.txt"), b"readme").unwrap();

        let result = scan_plugins(game.to_string_lossy().into_owned()).unwrap();
        assert_eq!(result.len(), 4);

        let mod_a_info = result.iter().find(|m| m.folder_name == "ModA").unwrap();
        assert!(mod_a_info.enabled);
        assert!(mod_a_info.is_folder);
        assert_eq!(mod_a_info.name, "Mod A");
        assert_eq!(mod_a_info.version, "1.2.3");
        assert_eq!(mod_a_info.description, "测试 Mod");
        assert_eq!(mod_a_info.author, "TestAuthor");
        let icon = mod_a_info.icon_base64.as_ref().unwrap();
        assert!(icon.starts_with("data:image/png;base64,"));
        let decoded = base64::engine::general_purpose::STANDARD
            .decode(icon.trim_start_matches("data:image/png;base64,"))
            .unwrap();
        assert_eq!(decoded, b"fake-icon-bytes");

        let mod_b_info = result.iter().find(|m| m.folder_name == "ModB").unwrap();
        assert!(!mod_b_info.enabled);
        assert_eq!(mod_b_info.name, "Mod B");

        let single = result.iter().find(|m| m.folder_name == "Single.dll").unwrap();
        assert!(single.enabled);
        assert!(!single.is_folder);

        let single2 = result.iter().find(|m| m.folder_name == "Single2.dll").unwrap();
        assert!(!single2.enabled);
    }

    #[test]
    fn test_scan_creates_disabled_dir() {
        let plugins = temp_game();
        let game = game_of(&plugins);
        let result = scan_plugins(game.to_string_lossy().into_owned()).unwrap();
        assert!(result.is_empty());
        // 隔离区目录被自动创建
        assert!(plugins.parent().unwrap().join(DISABLED_DIR_NAME).is_dir());
    }

    #[test]
    fn test_scan_missing_bepinex_returns_empty() {
        let dir = std::env::temp_dir().join(format!("plugins_test_empty_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let result = scan_plugins(dir.to_string_lossy().into_owned()).unwrap();
        assert!(result.is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_toggle_moves_between_dirs() {
        let plugins = temp_game();
        let game = game_of(&plugins);
        let disabled = plugins.parent().unwrap().join(DISABLED_DIR_NAME);

        let mod_dir = plugins.join("ToggleMod");
        std::fs::create_dir_all(&mod_dir).unwrap();
        std::fs::write(plugins.join("Loose.dll"), b"dll").unwrap();

        // 禁用文件夹:移入隔离区
        toggle_plugin(
            game.to_string_lossy().into_owned(),
            "ToggleMod".to_string(),
            false,
        )
        .unwrap();
        assert!(disabled.join("ToggleMod").is_dir());
        assert!(!mod_dir.exists());

        // 启用文件夹:移回 plugins
        toggle_plugin(
            game.to_string_lossy().into_owned(),
            "ToggleMod".to_string(),
            true,
        )
        .unwrap();
        assert!(mod_dir.is_dir());
        assert!(!disabled.join("ToggleMod").exists());

        // 禁用/启用单个 dll
        toggle_plugin(
            game.to_string_lossy().into_owned(),
            "Loose.dll".to_string(),
            false,
        )
        .unwrap();
        assert!(disabled.join("Loose.dll").is_file());
        assert!(!plugins.join("Loose.dll").exists());
        toggle_plugin(
            game.to_string_lossy().into_owned(),
            "Loose.dll".to_string(),
            true,
        )
        .unwrap();
        assert!(plugins.join("Loose.dll").is_file());
    }

    #[test]
    fn test_toggle_is_idempotent() {
        let plugins = temp_game();
        let game = game_of(&plugins);
        let disabled = plugins.parent().unwrap().join(DISABLED_DIR_NAME);
        std::fs::create_dir_all(&disabled).unwrap();
        std::fs::create_dir_all(disabled.join("ModX")).unwrap();

        // 已禁用时再次禁用 → 成功(无操作)
        toggle_plugin(
            game.to_string_lossy().into_owned(),
            "ModX".to_string(),
            false,
        )
        .unwrap();
        assert!(disabled.join("ModX").is_dir());
    }

    #[test]
    fn test_toggle_invalid_name() {
        let plugins = temp_game();
        let game = game_of(&plugins);
        let err = toggle_plugin(
            game.to_string_lossy().into_owned(),
            "../escape".to_string(),
            false,
        )
        .unwrap_err();
        assert!(err.contains("无效"));
    }

    #[test]
    fn test_toggle_missing_plugin() {
        let plugins = temp_game();
        let game = game_of(&plugins);
        let err = toggle_plugin(
            game.to_string_lossy().into_owned(),
            "NoSuchMod".to_string(),
            false,
        )
        .unwrap_err();
        assert!(err.contains("未找到插件"));
    }

    #[test]
    fn test_delete_plugin_removes_from_both_dirs() {
        let plugins = temp_game();
        let game = game_of(&plugins);
        let disabled = plugins.parent().unwrap().join(DISABLED_DIR_NAME);
        std::fs::create_dir_all(&disabled).unwrap();

        std::fs::create_dir_all(plugins.join("FolderMod")).unwrap();
        std::fs::write(plugins.join("FolderMod").join("Mod.dll"), b"content").unwrap();
        std::fs::write(plugins.join("Loose.dll"), b"loose").unwrap();
        std::fs::write(disabled.join("Loose.dll"), b"duplicate-in-disabled").unwrap();

        let result = delete_plugin(
            game.to_string_lossy().into_owned(),
            "Loose.dll".to_string(),
        )
        .unwrap();
        assert_eq!(result.deleted_count, 2);
        assert!(!plugins.join("Loose.dll").exists());
        assert!(!disabled.join("Loose.dll").exists());

        let result = delete_plugin(
            game.to_string_lossy().into_owned(),
            "FolderMod".to_string(),
        )
        .unwrap();
        assert_eq!(result.deleted_count, 1);
        assert!(result.deleted_bytes > 0);
        assert!(!plugins.join("FolderMod").exists());
    }

    #[test]
    fn test_delete_plugin_missing_errors() {
        let plugins = temp_game();
        let game = game_of(&plugins);
        let err = delete_plugin(
            game.to_string_lossy().into_owned(),
            "NoSuchMod".to_string(),
        )
        .unwrap_err();
        assert!(err.contains("未找到插件"));
    }

    #[test]
    fn test_delete_plugin_invalid_name() {
        let plugins = temp_game();
        let game = game_of(&plugins);
        let err = delete_plugin(
            game.to_string_lossy().into_owned(),
            "..\\escape".to_string(),
        )
        .unwrap_err();
        assert!(err.contains("无效"));
    }

    #[test]
    fn test_toggle_all_moves_everything() {
        let plugins = temp_game();
        let game = game_of(&plugins);
        let disabled = plugins.parent().unwrap().join(DISABLED_DIR_NAME);
        std::fs::create_dir_all(&disabled).unwrap();

        std::fs::create_dir_all(plugins.join("Mod1")).unwrap();
        std::fs::create_dir_all(disabled.join("Mod2")).unwrap();
        std::fs::write(plugins.join("Loose.dll"), b"dll").unwrap();
        std::fs::write(disabled.join("Loose2.dll"), b"dll").unwrap();
        std::fs::write(plugins.join("note.txt"), b"x").unwrap();

        // 一键全部禁用
        toggle_all_plugins(game.to_string_lossy().into_owned(), false).unwrap();
        assert!(disabled.join("Mod1").is_dir());
        assert!(disabled.join("Loose.dll").is_file());
        assert!(!plugins.join("Mod1").exists());
        assert!(!plugins.join("Loose.dll").exists());
        // 原本已禁用的保持不变
        assert!(disabled.join("Mod2").is_dir());
        // 无关文件不受影响
        assert!(plugins.join("note.txt").is_file());

        // 一键全部启用
        toggle_all_plugins(game.to_string_lossy().into_owned(), true).unwrap();
        assert!(plugins.join("Mod1").is_dir());
        assert!(plugins.join("Mod2").is_dir());
        assert!(plugins.join("Loose.dll").is_file());
        assert!(plugins.join("Loose2.dll").is_file());
        assert!(!disabled.join("Mod1").exists());
    }
}