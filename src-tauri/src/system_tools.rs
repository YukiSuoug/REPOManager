use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

/// 游戏环境与指纹信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameEnvStatus {
    /// 游戏可执行文件是否存在
    pub has_game_exe: bool,
    /// BepInEx 目录是否存在
    pub has_bepinex: bool,
    /// 引导文件 winhttp.dll 是否存在
    pub has_winhttp: bool,
    /// 引导配置文件 doorstop_config.ini 是否存在
    pub has_doorstop_config: bool,
    /// BepInEx 引导环境是否完整
    pub is_env_healthy: bool,
    /// 启用的插件数量
    pub enabled_mod_count: usize,
    /// 禁用的插件数量
    pub disabled_mod_count: usize,
    /// 插件与隔离区占用的总磁盘大小(字节)
    pub total_mods_bytes: u64,
    /// 联机指纹代码(例如 "REPO-8A3F")
    pub fingerprint: String,
}

/// 在 Windows 资源管理器中打开指定路径或选中指定文件。
#[cfg(windows)]
#[tauri::command]
pub fn open_path_in_explorer(path: String, select_file: Option<bool>) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err(format!("路径不存在: {path}"));
    }

    let canonical = dunce::canonicalize(&p).unwrap_or(p);
    let target = canonical.to_string_lossy();

    if select_file.unwrap_or(false) && canonical.is_file() {
        std::process::Command::new("explorer")
            .arg(format!("/select,\"{target}\""))
            .spawn()
            .map_err(|e| format!("打开文件管理器失败: {e}"))?;
    } else {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &target])
            .spawn()
            .map_err(|e| format!("打开目录失败: {e}"))?;
    }
    Ok(())
}

#[cfg(not(windows))]
#[tauri::command]
pub fn open_path_in_explorer(_path: String, _select_file: Option<bool>) -> Result<(), String> {
    Err("仅支持 Windows 系统".to_string())
}

/// 智能检索并打开与指定 Mod 关联的 `.cfg` 配置文件。
/// 若未找到专属 `.cfg` 则直接打开 `BepInEx/config` 目录。
#[cfg(windows)]
#[tauri::command]
pub fn open_mod_config(game_path: String, mod_name: String) -> Result<String, String> {
    let config_dir = PathBuf::from(&game_path).join("BepInEx").join("config");
    if !config_dir.is_dir() {
        fs::create_dir_all(&config_dir).map_err(|e| format!("创建配置目录失败: {e}"))?;
    }

    let matched_cfg = find_matching_cfg(&config_dir, &mod_name);
    if let Some(cfg_path) = matched_cfg {
        let canonical = dunce::canonicalize(&cfg_path).unwrap_or(cfg_path);
        let target = canonical.to_string_lossy();
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &target])
            .spawn()
            .map_err(|e| format!("打开配置文件失败: {e}"))?;
        Ok(canonical.file_name().unwrap_or_default().to_string_lossy().into_owned())
    } else {
        // 未找到具体 cfg，打开 config 目录
        let target = dunce::canonicalize(&config_dir).unwrap_or(config_dir).to_string_lossy().into_owned();
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &target])
            .spawn()
            .map_err(|e| format!("打开配置目录失败: {e}"))?;
        Ok("config_dir".to_string())
    }
}

#[cfg(not(windows))]
#[tauri::command]
pub fn open_mod_config(_game_path: String, _mod_name: String) -> Result<String, String> {
    Err("仅支持 Windows 系统".to_string())
}

/// 扫描游戏目录环境、统计体积并生成联机指纹。
#[tauri::command]
pub fn get_game_env_status(game_path: String) -> Result<GameEnvStatus, String> {
    let game = PathBuf::from(&game_path);
    let has_game_exe = game.join("REPO.exe").is_file();
    let bepinex = game.join("BepInEx");
    let has_bepinex = bepinex.is_dir();
    let has_winhttp = game.join("winhttp.dll").is_file();
    let has_doorstop_config = game.join("doorstop_config.ini").is_file();
    let is_env_healthy = has_game_exe && has_bepinex && has_winhttp && has_doorstop_config;

    let plugins_dir = bepinex.join("plugins");
    let disabled_dir = bepinex.join("disabled_plugins");

    let mut enabled_names = Vec::new();
    let mut enabled_count = 0;
    let mut disabled_count = 0;
    let mut total_bytes = 0u64;

    if plugins_dir.is_dir() {
        if let Ok(entries) = fs::read_dir(&plugins_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().into_owned();
                let is_dir = entry.file_type().is_ok_and(|t| t.is_dir());
                if is_dir || name.ends_with(".dll") {
                    enabled_names.push(name.clone());
                    enabled_count += 1;
                }
                total_bytes += calculate_path_bytes(&entry.path());
            }
        }
    }

    if disabled_dir.is_dir() {
        if let Ok(entries) = fs::read_dir(&disabled_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().into_owned();
                let is_dir = entry.file_type().is_ok_and(|t| t.is_dir());
                if is_dir || name.ends_with(".dll") {
                    disabled_count += 1;
                }
                total_bytes += calculate_path_bytes(&entry.path());
            }
        }
    }

    enabled_names.sort();
    let fingerprint = generate_fingerprint(&enabled_names);

    Ok(GameEnvStatus {
        has_game_exe,
        has_bepinex,
        has_winhttp,
        has_doorstop_config,
        is_env_healthy,
        enabled_mod_count: enabled_count,
        disabled_mod_count: disabled_count,
        total_mods_bytes: total_bytes,
        fingerprint,
    })
}

/// 在 config 目录下智能匹配与 Mod 相关的 .cfg 文件。
pub(crate) fn find_matching_cfg(config_dir: &Path, mod_name: &str) -> Option<PathBuf> {
    let entries = fs::read_dir(config_dir).ok()?;
    let mut candidates = Vec::new();

    let clean_target = mod_name.to_lowercase().replace(|c: char| !c.is_alphanumeric(), "");
    let pure_stem = mod_name
        .trim_end_matches(".dll")
        .split('-')
        .next_back()
        .unwrap_or(mod_name)
        .to_lowercase();

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");
        if !ext.eq_ignore_ascii_case("cfg") {
            continue;
        }

        let stem = path.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
        let stem_lower = stem.to_lowercase();
        let clean_stem = stem_lower.replace(|c: char| !c.is_alphanumeric(), "");

        // 1. 完全相同或包含 (如 "Magic_Wesley-Wesleys_Enemies" 匹配 "Magic_Wesley.Wesleys_Enemies.cfg")
        if stem_lower == mod_name.to_lowercase() || clean_stem == clean_target {
            return Some(path);
        }

        // 2. 包含 pure_stem (如 "Wesleys_Enemies")
        if !pure_stem.is_empty() && (stem_lower.contains(&pure_stem) || clean_stem.contains(&pure_stem)) {
            candidates.push((1, path));
            continue;
        }

        // 3. 子串匹配
        if !clean_target.is_empty() && (clean_stem.contains(&clean_target) || clean_target.contains(&clean_stem)) {
            candidates.push((2, path));
        }
    }

    candidates.sort_by_key(|(score, _)| *score);
    candidates.into_iter().next().map(|(_, p)| p)
}

/// 递归计算路径总大小。
fn calculate_path_bytes(path: &Path) -> u64 {
    if path.is_file() {
        return path.metadata().map(|m| m.len()).unwrap_or(0);
    }
    if path.is_dir() {
        if let Ok(entries) = fs::read_dir(path) {
            return entries
                .flatten()
                .map(|e| calculate_path_bytes(&e.path()))
                .sum();
        }
    }
    0
}

/// 基于已启用的 Mod 列表生成唯一的 6 位联机指纹代码 (格式: REPO-XXXX)。
pub(crate) fn generate_fingerprint(mods: &[String]) -> String {
    if mods.is_empty() {
        return "REPO-NONE".to_string();
    }
    let mut hash = 0x811c9dc5u32; // FNV-1a 32-bit offset basis
    for m in mods {
        for b in m.as_bytes() {
            hash ^= *b as u32;
            hash = hash.wrapping_mul(0x01000193); // FNV prime
        }
        hash ^= b';' as u32;
        hash = hash.wrapping_mul(0x01000193);
    }
    format!("REPO-{:04X}", hash & 0xFFFF)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    static COUNTER: AtomicU32 = AtomicU32::new(0);

    fn temp_dir() -> PathBuf {
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!("system_tools_test_{}_{}", std::process::id(), n));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn test_generate_fingerprint_deterministic() {
        let mods_a = vec!["ModA".to_string(), "ModB".to_string()];
        let mods_b = vec!["ModA".to_string(), "ModB".to_string()];
        let mods_c = vec!["ModA".to_string(), "ModC".to_string()];

        let fp_a = generate_fingerprint(&mods_a);
        let fp_b = generate_fingerprint(&mods_b);
        let fp_c = generate_fingerprint(&mods_c);

        assert_eq!(fp_a, fp_b);
        assert_ne!(fp_a, fp_c);
        assert!(fp_a.starts_with("REPO-"));
        assert_eq!(fp_a.len(), 9); // "REPO-XXXX"
    }

    #[test]
    fn test_find_matching_cfg() {
        let dir = temp_dir();
        let cfg1 = dir.join("Magic_Wesley.Wesleys_Enemies.cfg");
        let cfg2 = dir.join("com.bepis.bepinexpack.cfg");
        std::fs::write(&cfg1, b"cfg1").unwrap();
        std::fs::write(&cfg2, b"cfg2").unwrap();

        let found = find_matching_cfg(&dir, "Magic_Wesley-Wesleys_Enemies");
        assert_eq!(found, Some(cfg1));

        let found_exact = find_matching_cfg(&dir, "com.bepis.bepinexpack");
        assert_eq!(found_exact, Some(cfg2));

        let none = find_matching_cfg(&dir, "UnknownMod");
        assert_eq!(none, None);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_get_game_env_status() {
        let dir = temp_dir();
        std::fs::write(dir.join("REPO.exe"), b"exe").unwrap();
        std::fs::write(dir.join("winhttp.dll"), b"dll").unwrap();
        std::fs::write(dir.join("doorstop_config.ini"), b"ini").unwrap();
        let plugins = dir.join("BepInEx").join("plugins");
        let disabled = dir.join("BepInEx").join("disabled_plugins");
        std::fs::create_dir_all(&plugins).unwrap();
        std::fs::create_dir_all(&disabled).unwrap();

        std::fs::write(plugins.join("ModA.dll"), b"12345").unwrap();
        std::fs::write(disabled.join("ModB.dll"), b"67890").unwrap();

        let status = get_game_env_status(dir.to_string_lossy().into_owned()).unwrap();
        assert!(status.has_game_exe);
        assert!(status.has_bepinex);
        assert!(status.has_winhttp);
        assert!(status.has_doorstop_config);
        assert!(status.is_env_healthy);
        assert_eq!(status.enabled_mod_count, 1);
        assert_eq!(status.disabled_mod_count, 1);
        assert_eq!(status.total_mods_bytes, 10);
        assert!(status.fingerprint.starts_with("REPO-"));

        let _ = std::fs::remove_dir_all(&dir);
    }
}
