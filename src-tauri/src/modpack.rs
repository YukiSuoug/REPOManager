use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

/// 分类清单文件名(存放于 BepInEx/ 下)
pub(crate) const MANIFEST_FILE_NAME: &str = "repo_pack_manifest.json";

/// 推荐的引导文件(导出时默认勾选)
pub(crate) const RECOMMENDED_BOOTSTRAP_FILES: &[&str] =
    &["winhttp.dll", "doorstop_config.ini", ".doorstop_version"];

/// 整合包元数据(分类配置),持久化于 `BepInEx/repo_pack_manifest.json`。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct PackManifest {
    pub pack_name: String,
    pub author: String,
    pub version: String,
    pub description: String,
    pub categories: Vec<String>,
    pub mod_categories: HashMap<String, String>,
}

impl Default for PackManifest {
    fn default() -> Self {
        Self {
            pack_name: "默认整合包".to_string(),
            author: String::new(),
            version: "1.0.0".to_string(),
            description: String::new(),
            categories: vec![
                "全部".to_string(),
                "核心前置".to_string(),
                "怪物与玩法".to_string(),
                "道具与装备".to_string(),
                "汉化与优化".to_string(),
                "未分类".to_string(),
            ],
            mod_categories: HashMap::new(),
        }
    }
}

/// 可导出节点,供前端展示导出树。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportNode {
    pub relative_path: String,
    pub name: String,
    pub is_dir: bool,
    /// 目录为递归总大小(字节)
    pub size: u64,
    /// 引导文件与 BepInEx 整体为推荐项
    pub is_recommended: bool,
}

/// 读取整合包分类清单,文件不存在时返回默认配置。
#[tauri::command]
pub fn get_pack_manifest(game_path: String) -> Result<PackManifest, String> {
    let path = manifest_path(&PathBuf::from(game_path));
    if !path.exists() {
        return Ok(PackManifest::default());
    }
    let content = fs::read_to_string(&path).map_err(|e| format!("读取分类清单失败: {e}"))?;
    serde_json::from_str(&content).map_err(|e| format!("解析分类清单失败: {e}"))
}

/// 保存整合包分类清单。
#[tauri::command]
pub fn save_pack_manifest(game_path: String, manifest: PackManifest) -> Result<(), String> {
    let path = manifest_path(&PathBuf::from(game_path));
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {e}"))?;
    }
    let content = serde_json::to_string_pretty(&manifest)
        .map_err(|e| format!("序列化分类清单失败: {e}"))?;
    fs::write(&path, content).map_err(|e| format!("保存分类清单失败: {e}"))
}

/// 扫描游戏根目录下的可导出项。
///
/// 扫描游戏根目录下所有可导出内容,构建完整文件树(扁平节点列表,含任意深度)。
/// 顶层 `BepInEx` 目录与三个引导文件标记为推荐项(简单模式默认勾选)。
#[tauri::command]
pub fn scan_exportable_tree(game_path: String) -> Result<Vec<ExportNode>, String> {
    let game = PathBuf::from(game_path);
    let mut nodes = Vec::new();
    scan_tree(&game, "", true, &mut nodes)?;
    Ok(nodes)
}

/// 递归扫描目录,生成扁平节点列表;返回该目录总大小(文件字节数之和)。
/// 单次遍历完成,避免对目录重复求和。
fn scan_tree(
    dir: &Path,
    prefix: &str,
    is_top: bool,
    nodes: &mut Vec<ExportNode>,
) -> Result<u64, String> {
    let mut total = 0u64;
    let mut entries: Vec<_> = fs::read_dir(dir)
        .map_err(|e| format!("读取目录失败 {}: {e}", dir.display()))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("读取目录条目失败 {}: {e}", dir.display()))?;
    entries.sort_by_key(|e| e.file_name());

    for entry in entries {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        let rel = if prefix.is_empty() {
            name.clone()
        } else {
            format!("{prefix}/{name}")
        };
        let is_dir = path.is_dir();
        let recommended = is_top
            && ((is_dir && name == "BepInEx") || RECOMMENDED_BOOTSTRAP_FILES.contains(&name.as_str()));
        let size = if is_dir {
            scan_tree(&path, &rel, false, nodes)?
        } else {
            path.metadata().map(|m| m.len()).unwrap_or(0)
        };
        nodes.push(ExportNode {
            relative_path: rel,
            name,
            is_dir,
            size,
            is_recommended: recommended,
        });
        total += size;
    }
    Ok(total)
}

/// 导出整合包 Zip。
///
/// 将分类清单写入 Zip 内的 `BepInEx/repo_pack_manifest.json`,并递归打包
/// 所有选中的相对路径,保留目录层级。
#[tauri::command]
pub fn export_modpack_zip(
    game_path: String,
    save_zip_path: String,
    selected_relative_paths: Vec<String>,
    manifest: PackManifest,
) -> Result<(), String> {
    let game = PathBuf::from(game_path);
    if selected_relative_paths.is_empty() {
        return Err("未选择任何导出项".to_string());
    }

    // 收集所有待打包文件
    let mut files: Vec<(PathBuf, String)> = Vec::new();
    for rel in &selected_relative_paths {
        validate_relative_path(rel)?;
        let src = game.join(rel);
        if !src.exists() {
            return Err(format!("导出项不存在: {rel}"));
        }
        collect_export_files(&src, &game, &mut files)?;
    }

    let f = fs::File::create(&save_zip_path).map_err(|e| format!("创建导出文件失败: {e}"))?;
    let mut w = zip::ZipWriter::new(f);
    let options = zip::write::SimpleFileOptions::default();

    // 写入分类清单
    let manifest_json = serde_json::to_string_pretty(&manifest)
        .map_err(|e| format!("序列化分类清单失败: {e}"))?;
    w.start_file(format!("BepInEx/{MANIFEST_FILE_NAME}"), options)
        .map_err(|e| format!("写入分类清单失败: {e}"))?;
    w.write_all(manifest_json.as_bytes())
        .map_err(|e| format!("写入分类清单失败: {e}"))?;

    // 打包选中文件
    for (src, rel) in &files {
        w.start_file(rel, options)
            .map_err(|e| format!("写入导出条目失败 {rel}: {e}"))?;
        let bytes =
            fs::read(src).map_err(|e| format!("读取导出文件失败 {}: {e}", src.display()))?;
        w.write_all(&bytes)
            .map_err(|e| format!("写入导出内容失败 {rel}: {e}"))?;
    }
    w.finish().map_err(|e| format!("导出文件写入失败: {e}"))?;
    Ok(())
}

/// 分类清单的完整路径。
fn manifest_path(game: &Path) -> PathBuf {
    game.join("BepInEx").join(MANIFEST_FILE_NAME)
}

/// 递归收集文件,zip 内路径为相对 game_path 的正斜杠路径。
fn collect_export_files(
    path: &Path,
    game: &Path,
    out: &mut Vec<(PathBuf, String)>,
) -> Result<(), String> {
    let rel = path
        .strip_prefix(game)
        .map_err(|_| format!("路径解析失败: {}", path.display()))?;
    let rel_str = rel.to_string_lossy().replace('\\', "/");

    if path.is_dir() {
        for entry in fs::read_dir(path)
            .map_err(|e| format!("读取目录失败 {}: {e}", path.display()))?
        {
            let entry = entry.map_err(|e| format!("读取目录条目失败: {e}"))?;
            collect_export_files(&entry.path(), game, out)?;
        }
    } else {
        // 跳过分类清单:zip 中已自动写入,避免 Duplicate filename
        if rel_str != format!("BepInEx/{MANIFEST_FILE_NAME}") {
            out.push((path.to_path_buf(), rel_str));
        }
    }
    Ok(())
}

/// 校验相对路径,防止路径穿越。
fn validate_relative_path(rel: &str) -> Result<(), String> {
    use std::path::Component;

    if rel.is_empty() {
        return Err("导出路径为空".to_string());
    }
    let p = Path::new(rel);
    if p.is_absolute() {
        return Err(format!("导出路径必须为相对路径: {rel}"));
    }
    if p.components().any(|c| {
        matches!(
            c,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        )
    }) {
        return Err(format!("无效的导出路径: {rel}"));
    }
    Ok(())
}

/// 从解压内容中找回分类清单并覆盖到游戏目录(导入时自动恢复分类)。
///
/// 支持三种布局:BepInEx 直接位于根目录、单层包裹目录内的 BepInEx、
/// 顶层直接放置 manifest。
pub(crate) fn restore_pack_manifest(extract_dir: &Path, game_path: &Path) -> Result<(), String> {
    let mut candidates = Vec::new();

    let direct = extract_dir.join("BepInEx");
    if direct.is_dir() {
        candidates.push(direct.join(MANIFEST_FILE_NAME));
    }
    if let Some(inner) = single_subdir(extract_dir) {
        if inner.join("BepInEx").is_dir() {
            candidates.push(inner.join("BepInEx").join(MANIFEST_FILE_NAME));
        }
    }
    candidates.push(extract_dir.join(MANIFEST_FILE_NAME));

    for candidate in candidates {
        if candidate.is_file() {
            let dst = manifest_path(game_path);
            if let Some(parent) = dst.parent() {
                fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {e}"))?;
            }
            fs::copy(&candidate, &dst).map_err(|e| format!("恢复分类清单失败: {e}"))?;
            return Ok(());
        }
    }
    Ok(())
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

/// 导入预览:压缩包内的包信息与 Mod 列表(导入确认弹窗使用)。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPreview {
    pub pack_name: String,
    pub author: String,
    pub version: String,
    pub description: String,
    pub categories: Vec<String>,
    pub mods: Vec<ImportModEntry>,
    pub total_files: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportModEntry {
    pub name: String,
    pub is_folder: bool,
}

/// 读取压缩包内容生成导入预览(只读,不写入游戏目录)。
#[tauri::command]
pub fn inspect_modpack(zip_path: String) -> Result<ImportPreview, String> {
    let zip_path = PathBuf::from(zip_path);
    if !zip_path.is_file() {
        return Err("Mod 压缩包不存在".to_string());
    }
    let work_dir = crate::mod_install::unique_work_dir()?;
    let result = inspect_archive(&zip_path, &work_dir);
    let _ = fs::remove_dir_all(&work_dir);
    result
}

fn inspect_archive(zip_path: &Path, work_dir: &Path) -> Result<ImportPreview, String> {
    crate::mod_install::extract_zip(zip_path, work_dir)?;

    // 1. 包信息:zip 内分类清单(manifest)
    let mut manifest = PackManifest::default();
    for candidate in manifest_candidates(work_dir) {
        if candidate.is_file() {
            if let Ok(content) = fs::read_to_string(&candidate) {
                if let Ok(m) = serde_json::from_str::<PackManifest>(&content) {
                    manifest = m;
                }
            }
            break;
        }
    }

    // 2. Mod 列表:plugins 目录下的子项
    let mut mods = Vec::new();
    let plugins = pack_root(work_dir).join("BepInEx").join("plugins");
    if plugins.is_dir() {
        if let Ok(entries) = fs::read_dir(&plugins) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().into_owned();
                let is_folder = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
                if is_folder || name.ends_with(".dll") {
                    mods.push(ImportModEntry { name, is_folder });
                }
            }
        }
    }

    // 3. 文件总数
    let total_files = count_files(work_dir);

    Ok(ImportPreview {
        pack_name: manifest.pack_name,
        author: manifest.author,
        version: manifest.version,
        description: manifest.description,
        categories: manifest.categories,
        mods,
        total_files,
    })
}

/// 候选 manifest 位置(与 restore_pack_manifest 一致)。
fn manifest_candidates(extract_dir: &Path) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    let direct = extract_dir.join("BepInEx");
    if direct.is_dir() {
        candidates.push(direct.join(MANIFEST_FILE_NAME));
    }
    if let Some(inner) = single_subdir(extract_dir) {
        if inner.join("BepInEx").is_dir() {
            candidates.push(inner.join("BepInEx").join(MANIFEST_FILE_NAME));
        }
    }
    candidates.push(extract_dir.join(MANIFEST_FILE_NAME));
    candidates
}

/// 解压内容的实际内容根(剥掉单层包裹目录)。
fn pack_root(extract_dir: &Path) -> PathBuf {
    single_subdir(extract_dir).unwrap_or_else(|| extract_dir.to_path_buf())
}

/// 递归统计目录内文件数量。
fn count_files(dir: &Path) -> usize {
    fs::read_dir(dir).ok().map_or(0, |entries| {
        entries.filter_map(|e| e.ok()).fold(0, |acc, e| {
            let path = e.path();
            if e.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                acc + count_files(&path)
            } else {
                acc + 1
            }
        })
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;
    use std::sync::atomic::{AtomicU32, Ordering};

    static COUNTER: AtomicU32 = AtomicU32::new(0);

    fn temp_dir() -> PathBuf {
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!(
            "modpack_test_{}_{}",
            std::process::id(),
            n
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn setup_game() -> (PathBuf, PathBuf) {
        let base = temp_dir();
        let game = base.join("game");
        std::fs::create_dir_all(game.join("BepInEx/plugins/ModA")).unwrap();
        std::fs::create_dir_all(game.join("BepInEx/config")).unwrap();
        std::fs::write(game.join("REPO.exe"), b"x").unwrap();
        std::fs::write(game.join("winhttp.dll"), b"bootstrap").unwrap();
        std::fs::write(game.join("doorstop_config.ini"), b"ini").unwrap();
        std::fs::write(game.join(".doorstop_version"), b"3.5.1").unwrap();
        std::fs::write(game.join("note.txt"), b"note").unwrap();
        std::fs::write(game.join("BepInEx/plugins/ModA/ModA.dll"), b"dll-a").unwrap();
        std::fs::write(game.join("BepInEx/plugins/Loose.dll"), b"loose").unwrap();
        std::fs::write(game.join("BepInEx/config/settings.cfg"), b"cfg").unwrap();
        (base, game)
    }

    #[test]
    fn test_get_default_manifest() {
        let (base, game) = setup_game();
        let manifest = get_pack_manifest(game.to_string_lossy().into_owned()).unwrap();
        assert_eq!(manifest.pack_name, "默认整合包");
        assert_eq!(manifest.categories.len(), 6);
        assert!(manifest.categories.contains(&"核心前置".to_string()));
        assert!(manifest.mod_categories.is_empty());
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn test_save_and_get_roundtrip() {
        let (base, game) = setup_game();
        let mut manifest = PackManifest {
            pack_name: "我的整合包".to_string(),
            author: "房主".to_string(),
            version: "2.0.0".to_string(),
            description: "测试整合".to_string(),
            categories: vec!["全部".to_string(), "怪物与玩法".to_string()],
            mod_categories: HashMap::new(),
        };
        manifest
            .mod_categories
            .insert("Magic_Wesley-Wesleys_Enemies".to_string(), "怪物与玩法".to_string());

        save_pack_manifest(game.to_string_lossy().into_owned(), manifest.clone()).unwrap();
        let loaded = get_pack_manifest(game.to_string_lossy().into_owned()).unwrap();
        assert_eq!(loaded.pack_name, "我的整合包");
        assert_eq!(loaded.author, "房主");
        assert_eq!(loaded.version, "2.0.0");
        assert_eq!(
            loaded.mod_categories.get("Magic_Wesley-Wesleys_Enemies"),
            Some(&"怪物与玩法".to_string())
        );
        // 磁盘文件存在
        assert!(game.join("BepInEx").join(MANIFEST_FILE_NAME).is_file());
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn test_scan_exportable_tree() {
        let (base, game) = setup_game();
        let nodes = scan_exportable_tree(game.to_string_lossy().into_owned()).unwrap();

        let recommended: Vec<&ExportNode> = nodes.iter().filter(|n| n.is_recommended).collect();
        let recommended_paths: Vec<&str> = recommended
            .iter()
            .map(|n| n.relative_path.as_str())
            .collect();
        assert!(recommended_paths.contains(&"winhttp.dll"));
        assert!(recommended_paths.contains(&"doorstop_config.ini"));
        assert!(recommended_paths.contains(&".doorstop_version"));
        assert!(recommended_paths.contains(&"BepInEx"));

        let mod_a = nodes.iter().find(|n| n.relative_path == "BepInEx/plugins/ModA").unwrap();
        assert!(mod_a.is_dir);
        assert!(!mod_a.is_recommended);
        assert!(mod_a.size > 0);

        assert!(nodes.iter().any(|n| n.relative_path == "BepInEx/plugins/Loose.dll"));
        assert!(nodes.iter().any(|n| n.relative_path == "BepInEx/config"));
        // 全量扫描:游戏根目录下所有内容都会出现,但非推荐
        let bepinex = nodes.iter().find(|n| n.relative_path == "BepInEx").unwrap();
        assert!(bepinex.size > 0);
        assert!(nodes.iter().any(|n| n.relative_path == "REPO.exe"));
        let note = nodes.iter().find(|n| n.relative_path == "note.txt").unwrap();
        assert!(!note.is_recommended);
        let loose = nodes.iter().find(|n| n.relative_path == "BepInEx/plugins/Loose.dll").unwrap();
        assert!(loose.size == 5);
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn test_export_modpack_zip() {
        let (base, game) = setup_game();
        let out = base.join("exported.zip");
        let manifest = PackManifest {
            pack_name: "导出整合包".to_string(),
            ..PackManifest::default()
        };

        export_modpack_zip(
            game.to_string_lossy().into_owned(),
            out.to_string_lossy().into_owned(),
            vec![
                "winhttp.dll".to_string(),
                "BepInEx/plugins/ModA".to_string(),
                "BepInEx/config".to_string(),
            ],
            manifest,
        )
        .unwrap();

        let f = std::fs::File::open(&out).unwrap();
        let mut archive = zip::ZipArchive::new(f).unwrap();
        let names: Vec<String> = (0..archive.len())
            .map(|i| archive.by_index(i).unwrap().name().to_string())
            .collect();

        assert!(names.contains(&"BepInEx/repo_pack_manifest.json".to_string()));
        assert!(names.contains(&"winhttp.dll".to_string()));
        assert!(names.contains(&"BepInEx/plugins/ModA/ModA.dll".to_string()));
        assert!(names.contains(&"BepInEx/config/settings.cfg".to_string()));
        // 未选中的不应出现
        assert!(!names.contains(&"doorstop_config.ini".to_string()));
        assert!(!names.contains(&"note.txt".to_string()));

        // 验证 manifest 内容
        let mut mf = archive
            .by_name("BepInEx/repo_pack_manifest.json")
            .unwrap();
        let mut content = String::new();
        mf.read_to_string(&mut content).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&content).unwrap();
        assert_eq!(parsed["packName"], "导出整合包");
        assert_eq!(parsed["categories"][0], "全部");
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn test_export_bepinex_whole_no_duplicate_manifest() {
        let (base, game) = setup_game();
        let out = base.join("whole.zip");
        // 勾选 BepInEx 整体:清单文件会同时被目录递归收集,不应重复写入
        export_modpack_zip(
            game.to_string_lossy().into_owned(),
            out.to_string_lossy().into_owned(),
            vec!["BepInEx".to_string()],
            PackManifest::default(),
        )
        .unwrap();

        let f = std::fs::File::open(&out).unwrap();
        let mut archive = zip::ZipArchive::new(f).unwrap();
        let count = (0..archive.len())
            .filter(|i| archive.by_index(*i).unwrap().name() == "BepInEx/repo_pack_manifest.json")
            .count();
        assert_eq!(count, 1, "清单文件应恰好写入一次");
        assert!(archive.by_name("BepInEx/plugins/Loose.dll").is_ok());
        assert!(archive.by_name("BepInEx/plugins/ModA/ModA.dll").is_ok());
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn test_export_rejects_path_traversal() {
        let (base, game) = setup_game();
        let out = base.join("bad.zip");
        let err = export_modpack_zip(
            game.to_string_lossy().into_owned(),
            out.to_string_lossy().into_owned(),
            vec!["../secret.txt".to_string()],
            PackManifest::default(),
        )
        .unwrap_err();
        assert!(err.contains("无效的导出路径"));
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn test_export_empty_selection() {
        let (base, game) = setup_game();
        let out = base.join("empty.zip");
        let err = export_modpack_zip(
            game.to_string_lossy().into_owned(),
            out.to_string_lossy().into_owned(),
            Vec::new(),
            PackManifest::default(),
        )
        .unwrap_err();
        assert!(err.contains("未选择"));
        let _ = std::fs::remove_dir_all(&base);
    }

    fn make_zip(path: &Path, files: &[(&str, &[u8])]) {
        use std::io::Write;
        let f = std::fs::File::create(path).unwrap();
        let mut w = zip::ZipWriter::new(f);
        for (name, content) in files {
            w.start_file(*name, zip::write::SimpleFileOptions::default())
                .unwrap();
            w.write_all(content).unwrap();
        }
        w.finish().unwrap();
    }

    #[test]
    fn test_inspect_modpack() {
        let _lock = crate::TEST_DATA_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let base = temp_dir();
        let zip = base.join("pack.zip");
        make_zip(
            &zip,
            &[
                (
                    "pack/BepInEx/repo_pack_manifest.json",
                    r#"{"packName":"房主整合包","author":"房主","version":"2.0.0","description":"开黑高难包","categories":["全部","怪物与玩法"]}"#
                        .as_bytes(),
                ),
                ("pack/BepInEx/plugins/ModA/ModA.dll", b"a"),
                ("pack/BepInEx/plugins/Loose.dll", b"loose"),
            ],
        );

        let preview = inspect_modpack(zip.to_string_lossy().into_owned()).unwrap();
        assert_eq!(preview.pack_name, "房主整合包");
        assert_eq!(preview.author, "房主");
        assert_eq!(preview.version, "2.0.0");
        assert_eq!(preview.description, "开黑高难包");
        assert_eq!(
            preview.categories,
            vec!["全部".to_string(), "怪物与玩法".to_string()]
        );
        assert!(preview.mods.iter().any(|m| m.name == "ModA" && m.is_folder));
        assert!(
            preview
                .mods
                .iter()
                .any(|m| m.name == "Loose.dll" && !m.is_folder)
        );
        assert_eq!(preview.total_files, 3);
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn test_inspect_modpack_without_manifest() {
        let _lock = crate::TEST_DATA_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let base = temp_dir();
        let zip = base.join("plain.zip");
        make_zip(
            &zip,
            &[("pack/BepInEx/plugins/SomeMod/SomeMod.dll", b"x")],
        );

        let preview = inspect_modpack(zip.to_string_lossy().into_owned()).unwrap();
        // 无 manifest:返回默认信息
        assert_eq!(preview.pack_name, PackManifest::default().pack_name);
        assert!(preview.mods.iter().any(|m| m.name == "SomeMod"));
        assert_eq!(preview.total_files, 1);
        let _ = std::fs::remove_dir_all(&base);
    }
}