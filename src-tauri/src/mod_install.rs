use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

/// 已安装 Mod 的信息,同时持久化到 `./data/config.json` 的 `mods` 字段。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModInfo {
    pub id: String,
    pub name: String,
    pub version: String,
    /// "full" | "plugin" | "bundle"
    pub mod_type: String,
    /// 安装到游戏目录的文件列表(相对 game_path)
    pub files: Vec<String>,
    pub enabled: bool,
    pub installed_at: u64,
    /// 整合包模式下的子 Mod
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub children: Vec<ModInfo>,
}

/// 安装 Mod 压缩包。
///
/// `mode`: `"replace"` 时先删除游戏目录现有 BepInEx 再安装,`"merge"`(默认)合并覆盖。
/// 流程:解压到临时目录 → 智能分类(全量 / 单插件 / 整合包)→ 安装 →
/// 记录到 config.json → 清理临时文件。
#[tauri::command]
pub fn install_mod_zip(
    zip_path: String,
    game_path: String,
    mode: Option<String>,
) -> Result<ModInfo, String> {
    let zip_path = PathBuf::from(zip_path);
    let game_path = PathBuf::from(game_path);

    if !zip_path.is_file() {
        return Err("Mod 压缩包不存在".to_string());
    }
    if !game_path.join("REPO.exe").exists() {
        return Err("游戏目录无效:未找到 REPO.exe".to_string());
    }

    if mode.as_deref() == Some("replace") {
        remove_existing_bepinex(&game_path)?;
        clear_mod_records()?;
    }

    let result = install_archive(&zip_path, &game_path)?;
    cleanup_temp()?;
    Ok(result)
}

/// replace 模式:删除游戏目录现有的 BepInEx 目录。
fn remove_existing_bepinex(game_path: &Path) -> Result<(), String> {
    let bepinex = game_path.join("BepInEx");
    if bepinex.exists() {
        fs::remove_dir_all(&bepinex).map_err(|e| format!("删除旧 BepInEx 失败: {e}"))?;
    }
    Ok(())
}

/// 还原纯净游戏:删除 BepInEx 目录与全部引导前置文件,并清空已安装记录。
/// 返回删除的文件/目录数量。
#[tauri::command]
pub fn restore_clean_game(game_path: String) -> Result<u64, String> {
    let game_path = PathBuf::from(game_path);
    if !game_path.join("REPO.exe").exists() {
        return Err("游戏目录无效:未找到 REPO.exe".to_string());
    }

    let mut deleted = 0u64;
    let mut remove_path = |p: &Path| -> Result<(), String> {
        if !p.exists() {
            return Ok(());
        }
        let kind = if p.is_dir() { "目录" } else { "文件" };
        let res = if p.is_dir() {
            fs::remove_dir_all(p)
        } else {
            fs::remove_file(p)
        };
        res.map_err(|e| format!("删除{kind}失败 {}: {e}", p.display()))?;
        deleted += 1;
        Ok(())
    };

    remove_path(&game_path.join("BepInEx"))?;
    remove_path(&game_path.join(".doorstop_version"))?;
    remove_path(&game_path.join("doorstop_config.ini"))?;
    remove_path(&game_path.join("winhttp.dll"))?;
    clear_mod_records()?;
    Ok(deleted)
}

/// 清空 ./data/config.json 的 mods 已安装记录(replace 模式 / 还原纯净时调用)。
fn clear_mod_records() -> Result<(), String> {
    let mut config = crate::load_app_config()?;
    if !config.is_object() {
        return Ok(());
    }
    if config.get_mut("mods").is_some() {
        config["mods"] = Value::Object(serde_json::Map::new());
        crate::save_app_config(config)?;
    }
    Ok(())
}

/// 解压并安装单个压缩包,返回该 Mod 的信息(整合包内部递归调用)。
fn install_archive(zip_path: &Path, game_path: &Path) -> Result<ModInfo, String> {
    let work_dir = unique_work_dir()?;
    extract_zip(zip_path, &work_dir)?;

    // 若压缩包内含分类清单,同步恢复到游戏目录
    crate::modpack::restore_pack_manifest(&work_dir, game_path)?;

    let info = classify_and_install(&work_dir, game_path, zip_path)?;
    record_mod(&info)?;
    Ok(info)
}

/// 智能分类并安装解压后的内容。
fn classify_and_install(
    extract_dir: &Path,
    game_path: &Path,
    zip_path: &Path,
) -> Result<ModInfo, String> {
    let now = now_millis();

    // 情况 1:全量结构(BepInEx 文件夹递归合并覆盖到游戏目录)
    if let Some(src) = find_bepinex_dir(extract_dir) {
        let mut files = Vec::new();
        copy_dir_recursively(&src, &game_path.join("BepInEx"), &mut files, game_path)?;
        // 同步复制压缩包根目录的引导前置文件(winhttp.dll 等),纯净游戏导入才能启动
        copy_bootstrap_files(extract_dir, game_path, &mut files)?;
        return Ok(ModInfo {
            id: sanitize_id(&mod_id_from_zip(zip_path)),
            name: mod_id_from_zip(zip_path),
            version: "unknown".to_string(),
            mod_type: "full".to_string(),
            files,
            enabled: true,
            installed_at: now,
            children: Vec::new(),
        });
    }

    let root = mod_root_dir(extract_dir);

    // 情况 2:单 Mod 插件(根目录含 .dll / .repobundle)
    if has_plugin_files(&root) {
        let manifest = read_manifest(&root).ok().flatten();
        let id = manifest
            .as_ref()
            .and_then(|m| m.get("name"))
            .and_then(|n| n.as_str())
            .map(sanitize_id)
            .unwrap_or_else(|| sanitize_id(&mod_id_from_zip(zip_path)));
        let name = manifest
            .as_ref()
            .and_then(|m| m.get("name"))
            .and_then(|n| n.as_str())
            .unwrap_or(&id)
            .to_string();
        let version = manifest
            .as_ref()
            .map(manifest_version)
            .unwrap_or_else(|| "unknown".to_string());

        let dest = game_path.join("BepInEx").join("plugins").join(&id);
        let mut files = Vec::new();
        copy_dir_recursively(&root, &dest, &mut files, game_path)?;
        return Ok(ModInfo {
            id,
            name,
            version,
            mod_type: "plugin".to_string(),
            files,
            enabled: true,
            installed_at: now,
            children: Vec::new(),
        });
    }

    // 情况 3:整合大包(包含多个子 zip,逐个递归安装)
    let child_zips = first_level_zips(extract_dir);
    if !child_zips.is_empty() {
        let mut children = Vec::new();
        let mut files = Vec::new();
        for child in child_zips {
            let info = install_archive(&child, game_path)?;
            files.extend(info.files.clone());
            children.push(info);
        }
        return Ok(ModInfo {
            id: sanitize_id(&mod_id_from_zip(zip_path)),
            name: mod_id_from_zip(zip_path),
            version: "bundle".to_string(),
            mod_type: "bundle".to_string(),
            files,
            enabled: true,
            installed_at: now,
            children,
        });
    }

    Err("无法识别的 Mod 压缩包结构(未找到 BepInEx、插件文件或子压缩包)".to_string())
}

/// 查找全量结构的 BepInEx 目录(直接位于根目录或第一层包裹目录内)。
fn find_bepinex_dir(extract_dir: &Path) -> Option<PathBuf> {
    let direct = extract_dir.join("BepInEx");
    if direct.is_dir() {
        return Some(direct);
    }
    single_subdir(extract_dir)
        .map(|inner| inner.join("BepInEx"))
        .filter(|p| p.is_dir())
}

/// 插件场景下的实际内容根目录(剥掉单层包裹目录)。
fn mod_root_dir(extract_dir: &Path) -> PathBuf {
    single_subdir(extract_dir).unwrap_or_else(|| extract_dir.to_path_buf())
}

/// 若目录下只有一个条目且为目录,返回之。
fn single_subdir(dir: &Path) -> Option<PathBuf> {
    let mut entries = fs::read_dir(dir).ok()?;
    let first = entries.next()?.ok()?;
    let path = first.path();
    if entries.next().is_none() && path.is_dir() {
        Some(path)
    } else {
        None
    }
}

/// 根目录第一层是否包含 .dll 或 .repobundle 文件。
fn has_plugin_files(dir: &Path) -> bool {
    fs::read_dir(dir).ok().is_some_and(|entries| {
        entries.filter_map(|e| e.ok()).any(|e| {
            if !e.file_type().is_ok_and(|t| t.is_file()) {
                return false;
            }
            let path = e.path();
            let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");
            ext.eq_ignore_ascii_case("dll") || ext.eq_ignore_ascii_case("repobundle")
        })
    })
}

/// 收集第一层(仅顶层)的 .zip 子文件。
fn first_level_zips(dir: &Path) -> Vec<PathBuf> {
    fs::read_dir(dir).ok().map_or(Vec::new(), |entries| {
        entries
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| {
                p.is_file()
                    && p.extension()
                        .and_then(|s| s.to_str())
                        .is_some_and(|ext| ext.eq_ignore_ascii_case("zip"))
            })
            .collect()
    })
}

/// 读取 mod 根目录下的 manifest.json。
fn read_manifest(root: &Path) -> Result<Option<Value>, String> {
    let path = root.join("manifest.json");
    if !path.exists() {
        return Ok(None);
    }
    let content = fs::read_to_string(&path).map_err(|e| format!("读取 manifest.json 失败: {e}"))?;
    serde_json::from_str(&content)
        .map(Some)
        .map_err(|e| format!("解析 manifest.json 失败: {e}"))
}

/// 从 manifest 中提取版本号(优先 version_number,兼容 version 字段)。
fn manifest_version(manifest: &Value) -> String {
    manifest
        .get("version_number")
        .or_else(|| manifest.get("version"))
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string()
}

/// 以 zip 文件名(去扩展名)作为 mod_id 兜底。
fn mod_id_from_zip(zip_path: &Path) -> String {
    zip_path
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "mod".to_string())
}

/// 清理 mod_id 中的非法文件名字符。
fn sanitize_id(s: &str) -> String {
    let mut out = String::new();
    for c in s.chars() {
        let ok = !matches!(c, ':' | '\\' | '/' | '*' | '?' | '"' | '<' | '>' | '|')
            && !c.is_control();
        if ok {
            out.push(c);
        } else {
            out.push('_');
        }
    }
    let trimmed = out.trim_matches(|c: char| c == ' ' || c == '.').to_string();
    if trimmed.is_empty() {
        "mod".to_string()
    } else {
        trimmed
    }
}

/// 解压 zip 到目标目录(带 zip-slip 防护)。
pub(crate) fn extract_zip(zip_path: &Path, dest: &Path) -> Result<(), String> {
    let file = fs::File::open(zip_path).map_err(|e| format!("打开压缩包失败: {e}"))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("读取压缩包失败: {e}"))?;

    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| format!("读取压缩包条目失败: {e}"))?;
        let name = entry.name().to_string();
        // 拒绝 ../ 等危险路径
        let Some(rel) = entry.enclosed_name().map(|p| p.to_path_buf()) else {
            continue;
        };
        let out_path = dest.join(&rel);

        if entry.is_dir() {
            fs::create_dir_all(&out_path).map_err(|e| format!("创建目录失败 {name}: {e}"))?;
        } else {
            if let Some(parent) = out_path.parent() {
                fs::create_dir_all(parent).map_err(|e| format!("创建目录失败 {name}: {e}"))?;
            }
            let mut out =
                fs::File::create(&out_path).map_err(|e| format!("创建文件失败 {name}: {e}"))?;
            std::io::copy(&mut entry, &mut out).map_err(|e| format!("解压文件失败 {name}: {e}"))?;
        }
    }
    Ok(())
}

/// 递归复制目录,并将目标文件(相对 game_path)记录到 files。
fn copy_dir_recursively(
    src: &Path,
    dst: &Path,
    files: &mut Vec<String>,
    game_path: &Path,
) -> Result<(), String> {
    let entries = fs::read_dir(src).map_err(|e| format!("读取目录失败 {}: {e}", src.display()))?;
    for entry in entries {
        let entry = entry.map_err(|e| format!("读取目录条目失败: {e}"))?;
        let from = entry.path();
        let rel = from
            .strip_prefix(src)
            .map_err(|_| format!("路径解析失败: {}", from.display()))?;
        let to = dst.join(rel);

        if entry.file_type().map_err(|e| e.to_string())?.is_dir() {
            fs::create_dir_all(&to).map_err(|e| format!("创建目录失败 {}: {e}", to.display()))?;
            copy_dir_recursively(&from, &to, files, game_path)?;
        } else {
            if let Some(parent) = to.parent() {
                fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {e}"))?;
            }
            fs::copy(&from, &to).map_err(|e| format!("复制文件失败 {}: {e}", from.display()))?;
            let rel_to_game = to.strip_prefix(game_path).unwrap_or(&to);
            files.push(rel_to_game.to_string_lossy().into_owned());
        }
    }
    Ok(())
}

/// 将压缩包根目录(或单层包裹目录内)的引导前置文件复制到游戏根目录。
fn copy_bootstrap_files(
    extract_dir: &Path,
    game_path: &Path,
    files: &mut Vec<String>,
) -> Result<(), String> {
    let root = mod_root_dir(extract_dir);
    for name in crate::modpack::RECOMMENDED_BOOTSTRAP_FILES {
        let src = root.join(name);
        if src.is_file() {
            let dst = game_path.join(name);
            if let Some(parent) = dst.parent() {
                fs::create_dir_all(parent).map_err(|e| format!("创建目录失败 {parent:?}: {e}"))?;
            }
            fs::copy(&src, &dst).map_err(|e| format!("复制引导文件失败 {name}: {e}"))?;
            files.push(name.to_string());
        }
    }
    Ok(())
}

/// 将 Mod 信息写入 ./data/config.json 的 mods 字段。
fn record_mod(info: &ModInfo) -> Result<(), String> {
    let mut config = crate::load_app_config()?;
    if !config.is_object() {
        config = serde_json::json!({});
    }
    let entry = serde_json::to_value(info).map_err(|e| format!("序列化 Mod 信息失败: {e}"))?;
    match config.get_mut("mods") {
        Some(Value::Object(map)) => {
            map.insert(info.id.clone(), entry);
        }
        _ => {
            let mut map = serde_json::Map::new();
            map.insert(info.id.clone(), entry);
            config["mods"] = Value::Object(map);
        }
    }
    crate::save_app_config(config)
}

/// 在临时目录下创建唯一工作子目录。
pub(crate) fn unique_work_dir() -> Result<PathBuf, String> {
    let temp = crate::get_temp_dir();
    let dir = temp.join(format!("extract_{}_{}", std::process::id(), now_millis()));
    fs::create_dir_all(&dir).map_err(|e| format!("创建临时目录失败: {e}"))?;
    Ok(dir)
}

/// 清空 ./data/temp/ 临时目录。
pub(crate) fn cleanup_temp() -> Result<(), String> {
    let temp = crate::get_temp_dir();
    if !temp.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(&temp).map_err(|e| format!("读取临时目录失败: {e}"))? {
        let entry = entry.map_err(|e| format!("读取临时目录条目失败: {e}"))?;
        let path = entry.path();
        if path.is_dir() {
            fs::remove_dir_all(&path).map_err(|e| format!("清理临时文件失败: {e}"))?;
        } else {
            fs::remove_file(&path).map_err(|e| format!("清理临时文件失败: {e}"))?;
        }
    }
    Ok(())
}

fn now_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
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
            "mod_install_test_{}_{}",
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
        std::fs::create_dir_all(game.join("BepInEx")).unwrap();
        std::fs::write(game.join("REPO.exe"), b"x").unwrap();
        (base, game)
    }

    fn install(zip: &Path, game: &Path) -> ModInfo {
        install_mod_zip(
            zip.to_string_lossy().into_owned(),
            game.to_string_lossy().into_owned(),
            None,
        )
        .unwrap()
    }

    #[test]
    fn test_install_plugin_mod() {
        let _lock = crate::TEST_DATA_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let (base, game) = setup_game();
        let zip = base.join("ExampleMod-1.0.0.zip");
        make_zip(
            &zip,
            &[
                (
                    "ExampleMod/manifest.json",
                    br#"{"name":"ExampleMod","version_number":"1.0.0"}"#,
                ),
                ("ExampleMod/ExampleMod.dll", b"dll-content"),
                ("ExampleMod/icon.png", b"png-content"),
            ],
        );

        let info = install(&zip, &game);
        assert_eq!(info.mod_type, "plugin");
        assert_eq!(info.id, "ExampleMod");
        assert_eq!(info.version, "1.0.0");
        assert!(game.join("BepInEx/plugins/ExampleMod/ExampleMod.dll").exists());
        assert!(game.join("BepInEx/plugins/ExampleMod/manifest.json").exists());
        assert!(game.join("BepInEx/plugins/ExampleMod/icon.png").exists());

        let cfg = crate::load_app_config().unwrap();
        assert_eq!(cfg["mods"]["ExampleMod"]["enabled"], serde_json::json!(true));
        assert!(cfg["mods"]["ExampleMod"]["files"].is_array());

        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn test_install_full_bepinex() {
        let _lock = crate::TEST_DATA_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let (base, game) = setup_game();
        let zip = base.join("FullPack.zip");
        make_zip(
            &zip,
            &[
                ("pack/BepInEx/plugins/SomeLib.dll", b"lib-content"),
                ("pack/BepInEx/config/some.cfg", b"cfg-content"),
            ],
        );

        let info = install(&zip, &game);
        assert_eq!(info.mod_type, "full");
        assert!(game.join("BepInEx/plugins/SomeLib.dll").exists());
        assert!(game.join("BepInEx/config/some.cfg").exists());
        assert!(info
            .files
            .iter()
            .any(|f| f.replace('\\', "/").ends_with("BepInEx/plugins/SomeLib.dll")));

        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn test_install_full_bepinex_installs_bootstrap_files() {
        let _lock = crate::TEST_DATA_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let (base, game) = setup_game();
        let zip = base.join("FullPackWithBootstrap.zip");
        make_zip(
            &zip,
            &[
                ("pack/BepInEx/plugins/SomeLib.dll", b"lib-content"),
                ("pack/winhttp.dll", b"bootstrap-dll"),
                ("pack/doorstop_config.ini", b"ini-content"),
                ("pack/.doorstop_version", b"3.5.1"),
            ],
        );

        let info = install(&zip, &game);
        assert_eq!(info.mod_type, "full");
        assert!(game.join("BepInEx/plugins/SomeLib.dll").exists());
        // 引导前置文件应同步安装到游戏根目录
        assert!(game.join("winhttp.dll").exists());
        assert!(game.join("doorstop_config.ini").exists());
        assert!(game.join(".doorstop_version").exists());
        assert!(info
            .files
            .iter()
            .any(|f| f.replace('\\', "/") == "winhttp.dll"));

        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn test_install_bundle() {
        let _lock = crate::TEST_DATA_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let (base, game) = setup_game();

        let inner_a = base.join("ModA.zip");
        make_zip(
            &inner_a,
            &[
                (
                    "ModA/manifest.json",
                    br#"{"name":"ModA","version_number":"1.0.0"}"#,
                ),
                ("ModA/ModA.dll", b"dll-a"),
            ],
        );
        let inner_b = base.join("ModB.zip");
        make_zip(
            &inner_b,
            &[
                (
                    "ModB/manifest.json",
                    br#"{"name":"ModB","version_number":"2.0.0"}"#,
                ),
                ("ModB/ModB.repobundle", b"bundle-b"),
            ],
        );

        let a_bytes = std::fs::read(&inner_a).unwrap();
        let b_bytes = std::fs::read(&inner_b).unwrap();
        let bundle = base.join("BundlePack.zip");
        make_zip(
            &bundle,
            &[
                ("ModA.zip", a_bytes.as_slice()),
                ("ModB.zip", b_bytes.as_slice()),
            ],
        );

        let info = install(&bundle, &game);
        assert_eq!(info.mod_type, "bundle");
        assert_eq!(info.children.len(), 2);
        assert!(game.join("BepInEx/plugins/ModA/ModA.dll").exists());
        assert!(game.join("BepInEx/plugins/ModB/ModB.repobundle").exists());

        let cfg = crate::load_app_config().unwrap();
        assert!(cfg["mods"]["ModA"].is_object());
        assert!(cfg["mods"]["ModB"].is_object());

        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn test_install_replace_mode_removes_old_bepinex() {
        let _lock = crate::TEST_DATA_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let (base, game) = setup_game();
        // 游戏目录已有旧 BepInEx 内容
        let old_plugins = game.join("BepInEx/plugins");
        std::fs::create_dir_all(&old_plugins).unwrap();
        std::fs::write(old_plugins.join("OldMod.dll"), b"old").unwrap();
        // config 已有旧安装记录
        let config_path = crate::get_config_path();
        std::fs::create_dir_all(config_path.parent().unwrap()).unwrap();
        std::fs::write(
            &config_path,
            r#"{"gamePath":"","mods":{"OldMod":{"id":"OldMod","name":"OldMod"}}}"#,
        )
        .unwrap();

        let zip = base.join("ReplacePack.zip");
        make_zip(&zip, &[("pack/BepInEx/plugins/NewMod.dll", b"new")]);

        let info = install_mod_zip(
            zip.to_string_lossy().into_owned(),
            game.to_string_lossy().into_owned(),
            Some("replace".to_string()),
        )
        .unwrap();
        assert_eq!(info.mod_type, "full");
        assert!(game.join("BepInEx/plugins/NewMod.dll").exists());
        assert!(
            !game.join("BepInEx/plugins/OldMod.dll").exists(),
            "replace 模式应删除旧 BepInEx 内容"
        );
        // 旧 config 记录被清空,只保留新包记录
        let cfg: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&config_path).unwrap()).unwrap();
        assert!(cfg["mods"]["OldMod"].is_null(), "旧记录应被清空");
        assert!(cfg["mods"][info.id].is_object());
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn test_restore_clean_game() {
        let _lock = crate::TEST_DATA_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let (base, game) = setup_game();
        // 伪造已安装状态:引导文件 + BepInEx 内容 + config 记录
        std::fs::create_dir_all(game.join("BepInEx/plugins")).unwrap();
        std::fs::write(game.join("BepInEx/plugins/X.dll"), b"x").unwrap();
        std::fs::write(game.join("winhttp.dll"), b"w").unwrap();
        std::fs::write(game.join("doorstop_config.ini"), b"d").unwrap();
        std::fs::write(game.join(".doorstop_version"), b"v").unwrap();
        let config_path = crate::get_config_path();
        std::fs::create_dir_all(config_path.parent().unwrap()).unwrap();
        std::fs::write(
            &config_path,
            r#"{"gamePath":"","mods":{"M":{"id":"M"}}}"#,
        )
        .unwrap();

        let deleted = restore_clean_game(game.to_string_lossy().into_owned()).unwrap();
        assert_eq!(deleted, 4);
        assert!(!game.join("BepInEx").exists());
        assert!(!game.join("winhttp.dll").exists());
        assert!(!game.join("doorstop_config.ini").exists());
        assert!(!game.join(".doorstop_version").exists());
        let cfg: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&config_path).unwrap()).unwrap();
        assert!(cfg["mods"].as_object().map(|m| m.is_empty()).unwrap_or(false));
        // 幂等:再次还原返回 0
        assert_eq!(
            restore_clean_game(game.to_string_lossy().into_owned()).unwrap(),
            0
        );
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn test_unrecognized_structure() {
        let _lock = crate::TEST_DATA_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let (base, game) = setup_game();
        let zip = base.join("Unknown.zip");
        make_zip(&zip, &[("random.txt", b"hello")]);

        let err = install_mod_zip(
            zip.to_string_lossy().into_owned(),
            game.to_string_lossy().into_owned(),
            None,
        )
        .unwrap_err();
        assert!(err.contains("无法识别"));

        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn test_install_restores_pack_manifest() {
        let _lock = crate::TEST_DATA_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let (base, game) = setup_game();
        let zip = base.join("PackWithManifest.zip");
        make_zip(
            &zip,
            &[
                ("pack/BepInEx/plugins/SomeLib.dll", b"lib"),
                (
                    "pack/BepInEx/repo_pack_manifest.json",
                    r#"{"packName":"房主整合包","categories":["全部","怪物与玩法"]}"#.as_bytes(),
                ),
            ],
        );

        let info = install(&zip, &game);
        assert_eq!(info.mod_type, "full");
        let manifest_path = game.join("BepInEx").join("repo_pack_manifest.json");
        assert!(manifest_path.exists());
        let content = std::fs::read_to_string(&manifest_path).unwrap();
        assert!(content.contains("房主整合包"));

        let _ = std::fs::remove_dir_all(&base);
    }
}