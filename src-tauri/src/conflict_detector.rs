use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

/// 缺失的依赖项详情
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MissingDependency {
    /// 触发此依赖的 Mod 显示名称
    pub mod_name: String,
    /// 触发此依赖的 Mod 文件夹名
    pub folder_name: String,
    /// 完整的依赖标识 (如 "BepInEx-HookGenPatcher-0.0.5")
    pub required_dependency: String,
    /// 解析出的依赖 Mod 名 (如 "HookGenPatcher")
    pub dependency_name: String,
    /// 要求的最低/指定版本号
    pub dependency_version: Option<String>,
}

/// 重复的 DLL 文件冲突
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateDll {
    /// 重复的 DLL 文件名 (如 "SomeLib.dll")
    pub dll_name: String,
    /// 出现该 DLL 的所有相对路径
    pub locations: Vec<String>,
}

/// Mod 冲突体检完整报告
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ConflictReport {
    /// 是否存在任何冲突或依赖缺失
    pub has_conflicts: bool,
    /// 缺失的前置依赖列表
    pub missing_dependencies: Vec<MissingDependency>,
    /// 重复冲突的 DLL 列表
    pub duplicate_dlls: Vec<DuplicateDll>,
}

/// 对游戏已启用的 Mod 进行全方位依赖缺失与重复 DLL 冲突体检。
#[tauri::command]
pub fn diagnose_conflicts(game_path: String) -> Result<ConflictReport, String> {
    let game = PathBuf::from(&game_path);
    let bepinex = game.join("BepInEx");
    let plugins = bepinex.join("plugins");

    if !plugins.is_dir() {
        return Ok(ConflictReport::default());
    }

    // 1. 收集所有已启用的 Mod 标识集合 (名称、文件夹名、manifest name)
    let installed_identifiers = collect_installed_identifiers(&plugins, &bepinex)?;

    // 2. 检查所有已启用 Mod 的 manifest.json dependencies
    let mut missing_dependencies = Vec::new();
    check_dependencies(&plugins, &installed_identifiers, &mut missing_dependencies)?;

    // 3. 检查 plugins 目录下所有递归存在的同名 DLL 重复冲突
    let mut dll_map: HashMap<String, Vec<String>> = HashMap::new();
    collect_dll_locations(&plugins, &game, &mut dll_map)?;

    let mut duplicate_dlls = Vec::new();
    for (dll_name, locations) in dll_map {
        if locations.len() > 1 {
            duplicate_dlls.push(DuplicateDll {
                dll_name,
                locations,
            });
        }
    }
    duplicate_dlls.sort_by(|a, b| a.dll_name.cmp(&b.dll_name));
    missing_dependencies.sort_by(|a, b| a.dependency_name.cmp(&b.dependency_name));

    let has_conflicts = !missing_dependencies.is_empty() || !duplicate_dlls.is_empty();

    Ok(ConflictReport {
        has_conflicts,
        missing_dependencies,
        duplicate_dlls,
    })
}

/// 收集所有已启用的 Mod 识别名集合 (用于依赖匹配，全小写化)
fn collect_installed_identifiers(
    plugins: &Path,
    bepinex: &Path,
) -> Result<HashSet<String>, String> {
    let mut set = HashSet::new();

    // 如果 BepInEx/core 存在，则满足 BepInExPack 核心前置
    if bepinex.join("core").is_dir() {
        set.insert("bepinex".to_string());
        set.insert("bepinexpack".to_string());
        set.insert("bepinex-bepinexpack".to_string());
    }

    if let Ok(entries) = fs::read_dir(plugins) {
        for entry in entries.flatten() {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_lowercase();
            let is_dir = entry.file_type().is_ok_and(|t| t.is_dir());

            if is_dir {
                set.insert(name.clone());
                // 拆分可能存在的 "Author-ModName"
                if let Some((_, mod_part)) = name.split_once('-') {
                    set.insert(mod_part.to_string());
                }
                // 读取子文件夹中的 manifest.json
                if let Ok(content) = fs::read_to_string(path.join("manifest.json")) {
                    if let Ok(manifest) = serde_json::from_str::<Value>(&content) {
                        if let Some(n) = manifest.get("name").and_then(|v| v.as_str()) {
                            set.insert(n.to_lowercase());
                        }
                    }
                }
            } else if name.ends_with(".dll") {
                let stem = name.trim_end_matches(".dll");
                set.insert(name.clone());
                set.insert(stem.to_string());
            }
        }
    }

    Ok(set)
}

/// 检查已启用的 Mod 依赖
fn check_dependencies(
    plugins: &Path,
    installed: &HashSet<String>,
    out: &mut Vec<MissingDependency>,
) -> Result<(), String> {
    let entries = fs::read_dir(plugins).map_err(|e| format!("读取插件目录失败: {e}"))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if !entry.file_type().is_ok_and(|t| t.is_dir()) {
            continue;
        }

        let folder_name = entry.file_name().to_string_lossy().into_owned();
        let manifest_path = path.join("manifest.json");
        if !manifest_path.is_file() {
            continue;
        }

        let Ok(content) = fs::read_to_string(&manifest_path) else {
            continue;
        };
        let Ok(manifest) = serde_json::from_str::<Value>(&content) else {
            continue;
        };

        let mod_name = manifest
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or(&folder_name)
            .to_string();

        let Some(deps) = manifest.get("dependencies").and_then(|v| v.as_array()) else {
            continue;
        };

        for dep_val in deps {
            let Some(dep_str) = dep_val.as_str() else {
                continue;
            };

            // Thunderstore 依赖格式: "Author-ModName-Version" (如 "BepInEx-BepInExPack-5.4.2100")
            let parts: Vec<&str> = dep_str.split('-').collect();
            let (dep_name, dep_version) = if parts.len() >= 3 {
                (parts[1].to_string(), Some(parts[2..].join("-")))
            } else if parts.len() == 2 {
                (parts[1].to_string(), None)
            } else {
                (dep_str.to_string(), None)
            };

            let clean_full = dep_str.to_lowercase();
            let clean_name = dep_name.to_lowercase();
            let clean_no_ver = if parts.len() >= 2 {
                format!("{}-{}", parts[0].to_lowercase(), parts[1].to_lowercase())
            } else {
                clean_full.clone()
            };

            // 判断是否已满足依赖
            let is_satisfied = installed.contains(&clean_full)
                || installed.contains(&clean_name)
                || installed.contains(&clean_no_ver)
                || (clean_name == "bepinexpack" && installed.contains("bepinexpack"));

            if !is_satisfied {
                out.push(MissingDependency {
                    mod_name: mod_name.clone(),
                    folder_name: folder_name.clone(),
                    required_dependency: dep_str.to_string(),
                    dependency_name: dep_name,
                    dependency_version: dep_version,
                });
            }
        }
    }

    Ok(())
}

/// 递归收集 plugins 目录下所有 DLL 的出现位置 (按小写文件名聚合)
fn collect_dll_locations(
    dir: &Path,
    game: &Path,
    map: &mut HashMap<String, Vec<String>>,
) -> Result<(), String> {
    let entries = fs::read_dir(dir).map_err(|e| format!("读取目录失败: {e}"))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if entry.file_type().is_ok_and(|t| t.is_dir()) {
            collect_dll_locations(&path, game, map)?;
        } else if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
            if ext.eq_ignore_ascii_case("dll") {
                let file_name = entry.file_name().to_string_lossy().into_owned();
                let rel = path
                    .strip_prefix(game)
                    .unwrap_or(&path)
                    .to_string_lossy()
                    .replace('\\', "/");
                map.entry(file_name).or_default().push(rel);
            }
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    static COUNTER: AtomicU32 = AtomicU32::new(0);

    fn temp_dir() -> PathBuf {
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!("conflict_test_{}_{}", std::process::id(), n));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn test_detect_missing_dependency() {
        let root = temp_dir();
        let bepinex = root.join("BepInEx");
        let plugins = bepinex.join("plugins");
        std::fs::create_dir_all(&plugins).unwrap();
        std::fs::create_dir_all(bepinex.join("core")).unwrap();

        // 安装 ModA，依赖 ModB 与 HookGenPatcher
        let mod_a = plugins.join("ModA");
        std::fs::create_dir_all(&mod_a).unwrap();
        std::fs::write(
            mod_a.join("manifest.json"),
            r#"{
                "name": "ModA",
                "version_number": "1.0.0",
                "dependencies": [
                    "BepInEx-BepInExPack-5.4.2100",
                    "Author-ModB-1.0.0",
                    "BepInEx-HookGenPatcher-0.0.5"
                ]
            }"#,
        )
        .unwrap();

        // 仅安装 ModB
        let mod_b = plugins.join("Author-ModB");
        std::fs::create_dir_all(&mod_b).unwrap();
        std::fs::write(
            mod_b.join("manifest.json"),
            r#"{"name": "ModB", "version_number": "1.0.0", "dependencies": []}"#,
        )
        .unwrap();

        let report = diagnose_conflicts(root.to_string_lossy().into_owned()).unwrap();
        assert!(report.has_conflicts);
        // BepInExPack (core存在) 与 ModB (已安装) 满足，仅 HookGenPatcher 缺失
        assert_eq!(report.missing_dependencies.len(), 1);
        assert_eq!(report.missing_dependencies[0].dependency_name, "HookGenPatcher");

        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn test_detect_duplicate_dll() {
        let root = temp_dir();
        let plugins = root.join("BepInEx").join("plugins");
        std::fs::create_dir_all(plugins.join("ModA")).unwrap();
        std::fs::create_dir_all(plugins.join("ModB")).unwrap();

        // 在不同文件夹中放入同名 DLL
        std::fs::write(plugins.join("ModA").join("SharedLib.dll"), b"v1").unwrap();
        std::fs::write(plugins.join("ModB").join("SharedLib.dll"), b"v2").unwrap();

        let report = diagnose_conflicts(root.to_string_lossy().into_owned()).unwrap();
        assert!(report.has_conflicts);
        assert_eq!(report.duplicate_dlls.len(), 1);
        assert_eq!(report.duplicate_dlls[0].dll_name, "SharedLib.dll");
        assert_eq!(report.duplicate_dlls[0].locations.len(), 2);

        let _ = std::fs::remove_dir_all(&root);
    }
}
