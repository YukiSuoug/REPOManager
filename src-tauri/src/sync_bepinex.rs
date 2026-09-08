use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

use crate::mod_install::{cleanup_temp, extract_zip, unique_work_dir};

/// BepInEx 的标准内部子目录
const BEPINEX_SUBDIRS: &[&str] = &["plugins", "config", "core", "patchers"];

/// Doorstop 引导文件(压缩包顶层出现即覆盖到游戏根目录)
const DOORSTOP_FILES: &[&str] = &["winhttp.dll", "doorstop_config.ini", ".doorstop_version"];

/// 同步结果。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncResult {
    /// 备份文件路径(游戏目录无既有 BepInEx/引导文件时为 None)
    pub backup_path: Option<String>,
    /// 已同步的 BepInEx 子目录(plugins/config/core/patchers 子集)
    pub synced_dirs: Vec<String>,
    /// 已同步到游戏根目录的引导文件
    pub synced_files: Vec<String>,
    /// 同步后 plugins 下的 Mod 文件夹数量
    pub mod_folder_count: usize,
}

/// 同步 BepInEx 整合包到游戏目录。
///
/// `mode`: `"replace"` 时先删除游戏目录现有 BepInEx 再同步,`"merge"`(默认)合并覆盖。
/// 流程:备份既有内容 → 解压到临时目录 → 智能分发 → 清理临时文件。
#[tauri::command]
pub fn sync_bepinex_pack(
    zip_path: String,
    game_path: String,
    mode: Option<String>,
) -> Result<SyncResult, String> {
    let zip_path = PathBuf::from(zip_path);
    let game_path = PathBuf::from(game_path);

    if !zip_path.is_file() {
        return Err("压缩包不存在".to_string());
    }
    if !game_path.join("REPO.exe").exists() {
        return Err("游戏目录无效:未找到 REPO.exe".to_string());
    }

    if mode.as_deref() == Some("replace") {
        let bepinex = game_path.join("BepInEx");
        if bepinex.exists() {
            fs::remove_dir_all(&bepinex).map_err(|e| format!("删除旧 BepInEx 失败: {e}"))?;
        }
    }

    let backup_path = backup_game_artifacts(&game_path)?;

    let work_dir = unique_work_dir()?;
    extract_zip(&zip_path, &work_dir)?;

    // 若压缩包内含分类清单,同步恢复到游戏目录
    crate::modpack::restore_pack_manifest(&work_dir, &game_path)?;

    let mut result = deploy(&work_dir, &game_path)?;
    result.backup_path = backup_path;
    cleanup_temp()?;
    Ok(result)
}

/// 智能分发解压内容到游戏根目录。
fn deploy(extract_dir: &Path, game_path: &Path) -> Result<SyncResult, String> {
    let mut synced_dirs = Vec::new();
    let mut synced_files = Vec::new();

    // 情况 1:顶层直接是 BepInEx 文件夹 → 整体递归合并覆盖
    let bepinex_src = extract_dir.join("BepInEx");
    if bepinex_src.is_dir() {
        copy_merge(&bepinex_src, &game_path.join("BepInEx"))?;
        for sub in BEPINEX_SUBDIRS {
            if bepinex_src.join(sub).is_dir() {
                synced_dirs.push((*sub).to_string());
            }
        }
    } else {
        // 情况 2:顶层直接是 BepInEx 内部子目录(plugins/config/core/patchers)
        for sub in BEPINEX_SUBDIRS {
            let src = extract_dir.join(sub);
            if src.is_dir() {
                copy_merge(&src, &game_path.join("BepInEx").join(sub))?;
                synced_dirs.push((*sub).to_string());
            }
        }
    }

    // 情况 3:引导文件覆盖到游戏根目录
    for name in DOORSTOP_FILES {
        let src = extract_dir.join(name);
        if src.is_file() {
            fs::copy(&src, game_path.join(name))
                .map_err(|e| format!("复制引导文件失败 {name}: {e}"))?;
            synced_files.push((*name).to_string());
        }
    }

    let mod_folder_count = count_subdirs(&game_path.join("BepInEx").join("plugins"));

    Ok(SyncResult {
        backup_path: None,
        synced_dirs,
        synced_files,
        mod_folder_count,
    })
}

/// 递归合并复制目录到目标位置(覆盖同名文件)。
fn copy_merge(src: &Path, dst: &Path) -> Result<(), String> {
    let entries = fs::read_dir(src).map_err(|e| format!("读取目录失败 {}: {e}", src.display()))?;
    for entry in entries {
        let entry = entry.map_err(|e| format!("读取目录条目失败: {e}"))?;
        let from = entry.path();
        let to = dst.join(entry.file_name());

        if entry.file_type().map_err(|e| e.to_string())?.is_dir() {
            fs::create_dir_all(&to).map_err(|e| format!("创建目录失败 {}: {e}", to.display()))?;
            copy_merge(&from, &to)?;
        } else {
            if let Some(parent) = to.parent() {
                fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {e}"))?;
            }
            fs::copy(&from, &to).map_err(|e| format!("复制文件失败 {}: {e}", from.display()))?;
        }
    }
    Ok(())
}

/// 统计目录下的子文件夹数量。
fn count_subdirs(dir: &Path) -> usize {
    fs::read_dir(dir).ok().map_or(0, |entries| {
        entries
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_ok_and(|t| t.is_dir()))
            .count()
    })
}

/// 备份游戏目录原有的 BepInEx/ 与引导文件为时间戳 zip。
/// 无既有内容时返回 Ok(None)。
fn backup_game_artifacts(game_path: &Path) -> Result<Option<String>, String> {
    let mut files: Vec<(PathBuf, String)> = Vec::new();

    let bepinex = game_path.join("BepInEx");
    if bepinex.is_dir() {
        collect_files(&bepinex, "BepInEx", &mut files)?;
    }
    for name in DOORSTOP_FILES {
        let p = game_path.join(name);
        if p.is_file() {
            files.push((p, (*name).to_string()));
        }
    }

    if files.is_empty() {
        return Ok(None);
    }

    let backups_dir = crate::get_portable_data_dir().join("backups");
    fs::create_dir_all(&backups_dir)
        .map_err(|e| format!("创建备份目录失败: {e}"))?;
    let name = unique_backup_name(&backups_dir)?;
    let path = backups_dir.join(&name);
    write_backup_zip(&path, &files)?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

/// 递归收集目录下所有文件,zip 内相对路径为 `prefix/...`。
fn collect_files(
    dir: &Path,
    prefix: &str,
    out: &mut Vec<(PathBuf, String)>,
) -> Result<(), String> {
    let entries = fs::read_dir(dir).map_err(|e| format!("读取目录失败 {}: {e}", dir.display()))?;
    for entry in entries {
        let entry = entry.map_err(|e| format!("读取目录条目失败: {e}"))?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        let rel = format!("{prefix}/{}", name);

        if entry.file_type().map_err(|e| e.to_string())?.is_dir() {
            collect_files(&path, &rel, out)?;
        } else {
            out.push((path, rel));
        }
    }
    Ok(())
}

/// 生成 `backup_yyyyMMdd_HHmmss.zip` 且不冲突的文件名。
fn unique_backup_name(dir: &Path) -> Result<String, String> {
    let stamp = backup_timestamp();
    for n in 0..1000 {
        let name = if n == 0 {
            format!("backup_{stamp}.zip")
        } else {
            format!("backup_{stamp}_{n}.zip")
        };
        if !dir.join(&name).exists() {
            return Ok(name);
        }
    }
    Err("无法生成备份文件名".to_string())
}

/// 将收集到的文件打包为 zip。
fn write_backup_zip(path: &Path, files: &[(PathBuf, String)]) -> Result<(), String> {
    use std::io::Write;

    let f = fs::File::create(path).map_err(|e| format!("创建备份文件失败: {e}"))?;
    let mut w = zip::ZipWriter::new(f);
    let options = zip::write::SimpleFileOptions::default();

    for (src, rel) in files {
        w.start_file(rel, options)
            .map_err(|e| format!("写入备份条目失败 {rel}: {e}"))?;
        let bytes = fs::read(src).map_err(|e| format!("读取备份文件失败 {}: {e}", src.display()))?;
        w.write_all(&bytes)
            .map_err(|e| format!("写入备份内容失败 {rel}: {e}"))?;
    }
    w.finish().map_err(|e| format!("备份文件写入失败: {e}"))?;
    Ok(())
}

/// 当前 UTC 时间的 `yyyyMMdd_HHmmss` 字符串。
fn backup_timestamp() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let days = secs / 86400;
    let rem = secs % 86400;
    let (h, m, s) = (rem / 3600, (rem % 3600) / 60, rem % 60);
    let (y, mo, d) = civil_from_days(days as i64);
    format!("{y:04}{mo:02}{d:02}_{h:02}{m:02}{s:02}")
}

/// 天数(自 1970-01-01)转公历日期(Howard Hinnant 算法)。
fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719468;
    let era = z.div_euclid(146097);
    let doe = (z - era * 146097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::sync::atomic::{AtomicU32, Ordering};

    static COUNTER: AtomicU32 = AtomicU32::new(0);

    fn temp_dir() -> PathBuf {
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!(
            "sync_bepinex_test_{}_{}",
            std::process::id(),
            n
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn make_zip(path: &Path, files: &[(&str, &[u8])]) {
        let f = std::fs::File::create(path).unwrap();
        let mut w = zip::ZipWriter::new(f);
        for (name, content) in files {
            w.start_file(*name, zip::write::SimpleFileOptions::default())
                .unwrap();
            w.write_all(content).unwrap();
        }
        w.finish().unwrap();
    }

    fn setup_game() -> (PathBuf, PathBuf) {
        let base = temp_dir();
        let game = base.join("game");
        std::fs::create_dir_all(game.join("BepInEx").join("plugins")).unwrap();
        std::fs::write(game.join("REPO.exe"), b"x").unwrap();
        (base, game)
    }

    fn sync(zip: &Path, game: &Path) -> SyncResult {
        sync_bepinex_pack(
            zip.to_string_lossy().into_owned(),
            game.to_string_lossy().into_owned(),
            None,
        )
        .unwrap()
    }

    #[test]
    fn test_sync_full_pack_with_backup() {
        let _lock = crate::TEST_DATA_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let (base, game) = setup_game();
        // 游戏目录既有内容
        std::fs::write(game.join("BepInEx/plugins/OldMod.dll"), b"old").unwrap();

        let zip = base.join("BepInExPack.zip");
        make_zip(
            &zip,
            &[
                ("BepInEx/plugins/NewMod.dll", b"new"),
                ("BepInEx/config/settings.cfg", b"cfg"),
                ("BepInEx/core/SomeCore.dll", b"core"),
                ("winhttp.dll", b"bootstrap"),
                ("doorstop_config.ini", b"ini"),
                (".doorstop_version", b"3.5.1"),
            ],
        );

        let result = sync(&zip, &game);

        // 分发结果
        assert!(game.join("BepInEx/plugins/NewMod.dll").exists());
        assert!(game.join("BepInEx/config/settings.cfg").exists());
        assert!(game.join("BepInEx/core/SomeCore.dll").exists());
        assert!(game.join("winhttp.dll").exists());
        assert!(game.join("doorstop_config.ini").exists());
        assert!(game.join(".doorstop_version").exists());
        assert!(result.synced_dirs.contains(&"plugins".to_string()));
        assert!(result.synced_dirs.contains(&"config".to_string()));
        assert!(result.synced_files.contains(&"winhttp.dll".to_string()));

        // 备份存在且包含旧内容
        let backup = result.backup_path.expect("应有备份");
        assert!(Path::new(&backup).is_file());
        let f = std::fs::File::open(&backup).unwrap();
        let mut archive = zip::ZipArchive::new(f).unwrap();
        let names: Vec<String> = (0..archive.len())
            .map(|i| archive.by_index(i).unwrap().name().to_string())
            .collect();
        assert!(names.iter().any(|n| n == "BepInEx/plugins/OldMod.dll"));

        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn test_sync_inner_contents() {
        let _lock = crate::TEST_DATA_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let (base, game) = setup_game();
        let zip = base.join("InnerPack.zip");
        make_zip(
            &zip,
            &[
                ("plugins/ModA.dll", b"a"),
                ("config/settings.cfg", b"cfg"),
            ],
        );

        let result = sync(&zip, &game);
        assert!(game.join("BepInEx/plugins/ModA.dll").exists());
        assert!(game.join("BepInEx/config/settings.cfg").exists());
        assert!(result.synced_dirs.contains(&"plugins".to_string()));
        assert_eq!(result.mod_folder_count, 0);

        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn test_sync_bootstrapper_only() {
        let _lock = crate::TEST_DATA_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let (base, game) = setup_game();
        let zip = base.join("DoorstopOnly.zip");
        make_zip(
            &zip,
            &[
                ("winhttp.dll", b"bootstrap"),
                ("doorstop_config.ini", b"ini"),
            ],
        );

        let result = sync(&zip, &game);
        assert!(game.join("winhttp.dll").exists());
        assert!(game.join("doorstop_config.ini").exists());
        assert!(result.synced_dirs.is_empty());
        assert_eq!(result.synced_files.len(), 2);

        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn test_sync_no_backup_when_clean() {
        let _lock = crate::TEST_DATA_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let (base, game) = setup_game();
        let zip = base.join("CleanPack.zip");
        make_zip(&zip, &[("BepInEx/plugins/ModX.dll", b"x")]);

        let result = sync(&zip, &game);
        assert!(result.backup_path.is_none());
        assert!(game.join("BepInEx/plugins/ModX.dll").exists());

        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn test_sync_mod_folder_count() {
        let _lock = crate::TEST_DATA_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let (base, game) = setup_game();
        let zip = base.join("Mods.zip");
        make_zip(
            &zip,
            &[
                ("BepInEx/plugins/ModA/ModA.dll", b"a"),
                ("BepInEx/plugins/ModB/ModB.dll", b"b"),
                ("BepInEx/plugins/loose.dll", b"loose"),
            ],
        );

        let result = sync(&zip, &game);
        assert_eq!(result.mod_folder_count, 2);

        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn test_civil_from_days_known_date() {
        // 2026-08-20 应为 20685 天(1970-01-01 起)
        assert_eq!(civil_from_days(20685), (2026, 8, 20));
    }

    #[test]
    fn test_sync_restores_pack_manifest() {
        let _lock = crate::TEST_DATA_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let (base, game) = setup_game();
        let zip = base.join("PackWithManifest.zip");
        make_zip(
            &zip,
            &[
                ("BepInEx/plugins/NewMod.dll", b"new"),
                (
                    "BepInEx/repo_pack_manifest.json",
                    r#"{"packName":"同步整合包","categories":["全部"]}"#.as_bytes(),
                ),
            ],
        );

        let _ = sync(&zip, &game);
        let manifest_path = game.join("BepInEx").join("repo_pack_manifest.json");
        assert!(manifest_path.exists());
        let content = std::fs::read_to_string(&manifest_path).unwrap();
        assert!(content.contains("同步整合包"));

        let _ = std::fs::remove_dir_all(&base);
    }
}