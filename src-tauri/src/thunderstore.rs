use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::Path;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const THUNDERSTORE_REPO_API: &str = "https://thunderstore.io/c/repo/api/v1/package/";
const CACHE_MAX_AGE_SECS: u64 = 1800; // 缓存有效期 30 分钟

/// Thunderstore 单个版本的元数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThunderstoreVersionRaw {
    pub name: String,
    pub full_name: String,
    pub version_number: String,
    pub description: String,
    pub icon: String,
    pub dependencies: Vec<String>,
    pub download_url: String,
    pub downloads: u64,
    pub date_created: String,
    pub file_size: u64,
}

/// Thunderstore 官方返回的 Package 原始结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThunderstorePackageRaw {
    pub name: String,
    pub full_name: String,
    pub owner: String,
    pub package_url: String,
    #[serde(default)]
    pub is_pinned: bool,
    #[serde(default)]
    pub is_deprecated: bool,
    #[serde(default)]
    pub rating_score: i64,
    #[serde(default)]
    pub categories: Vec<String>,
    #[serde(default)]
    pub versions: Vec<ThunderstoreVersionRaw>,
}

/// 供前端渲染的 Mod 市场卡片结构
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThunderstorePackage {
    pub name: String,
    pub full_name: String,
    pub owner: String,
    pub package_url: String,
    pub is_pinned: bool,
    pub is_deprecated: bool,
    pub rating_score: i64,
    pub categories: Vec<String>,
    pub latest_version: Option<ThunderstoreVersionRaw>,
    pub total_downloads: u64,
}

/// 可更新 Mod 信息
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModUpdateInfo {
    pub folder_name: String,
    pub mod_name: String,
    pub current_version: String,
    pub latest_version: String,
    pub download_url: String,
    pub description: String,
    pub icon_url: String,
}

/// 获取 R.E.P.O. 社区全量 Mod 列表 (带 ./data/cache/ 本地缓存机制)。
#[tauri::command]
pub async fn fetch_community_mods(force_refresh: Option<bool>) -> Result<Vec<ThunderstorePackage>, String> {
    let cache_dir = crate::get_portable_data_dir().join("cache");
    let cache_file = cache_dir.join("community_mods.json");
    let force = force_refresh.unwrap_or(false);

    // 1. 如果不强制刷新且缓存存在且未过期，直接使用缓存
    if !force && cache_file.is_file() {
        if let Ok(metadata) = fs::metadata(&cache_file) {
            if let Ok(modified) = metadata.modified() {
                if let Ok(elapsed) = modified.elapsed() {
                    if elapsed.as_secs() < CACHE_MAX_AGE_SECS {
                        if let Ok(cached_content) = fs::read_to_string(&cache_file) {
                            if let Ok(raw_list) = serde_json::from_str::<Vec<ThunderstorePackageRaw>>(&cached_content) {
                                return Ok(convert_raw_packages(raw_list));
                            }
                        }
                    }
                }
            }
        }
    }

    // 2. 从 Thunderstore 官方 API 请求最新数据
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .user_agent("REPOModManager/1.3.0")
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {e}"))?;

    let response = client.get(THUNDERSTORE_REPO_API).send().await;

    match response {
        Ok(resp) => {
            if !resp.status().is_success() {
                return fallback_to_cache_or_err(&cache_file, format!("社区接口响应状态异常: {}", resp.status()));
            }
            let text = resp.text().await.map_err(|e| format!("读取社区响应数据失败: {e}"))?;
            let raw_list = serde_json::from_str::<Vec<ThunderstorePackageRaw>>(&text)
                .map_err(|e| format!("解析社区 Mod 清单 JSON 失败: {e}"))?;

            // 写入本地便携缓存
            let _ = fs::create_dir_all(&cache_dir);
            let _ = fs::write(&cache_file, &text);

            Ok(convert_raw_packages(raw_list))
        }
        Err(e) => fallback_to_cache_or_err(&cache_file, format!("连接 Thunderstore 失败: {e}")),
    }
}

/// 转换原始数据并提取最新版本与总下载量
fn convert_raw_packages(raw_list: Vec<ThunderstorePackageRaw>) -> Vec<ThunderstorePackage> {
    raw_list
        .into_iter()
        .map(|raw| {
            let total_downloads = raw.versions.iter().map(|v| v.downloads).sum();
            let latest = raw.versions.first().cloned();
            ThunderstorePackage {
                name: raw.name,
                full_name: raw.full_name,
                owner: raw.owner,
                package_url: raw.package_url,
                is_pinned: raw.is_pinned,
                is_deprecated: raw.is_deprecated,
                rating_score: raw.rating_score,
                categories: raw.categories,
                latest_version: latest,
                total_downloads,
            }
        })
        .collect()
}

/// 网络请求失败时降级读取既有缓存
fn fallback_to_cache_or_err(cache_file: &Path, original_err: String) -> Result<Vec<ThunderstorePackage>, String> {
    if cache_file.is_file() {
        if let Ok(content) = fs::read_to_string(cache_file) {
            if let Ok(raw_list) = serde_json::from_str::<Vec<ThunderstorePackageRaw>>(&content) {
                return Ok(convert_raw_packages(raw_list));
            }
        }
    }
    Err(original_err)
}

/// 下载指定 URL 的 Mod 压缩包并自动安装到游戏目录。
#[tauri::command]
pub async fn download_and_install_mod(
    game_path: String,
    download_url: String,
) -> Result<crate::mod_install::ModInfo, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(60))
        .user_agent("REPOModManager/1.3.0")
        .build()
        .map_err(|e| format!("创建下载客户端失败: {e}"))?;

    let resp = client
        .get(&download_url)
        .send()
        .await
        .map_err(|e| format!("请求 Mod 下载失败: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("下载服务器返回错误状态: {}", resp.status()));
    }

    let bytes = resp.bytes().await.map_err(|e| format!("接收 Mod 数据流失败: {e}"))?;

    // 保存到临时目录
    let temp_dir = crate::get_temp_dir();
    fs::create_dir_all(&temp_dir).map_err(|e| format!("创建临时目录失败: {e}"))?;
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let temp_zip_path = temp_dir.join(format!("thunderstore_dl_{stamp}.zip"));

    {
        let mut file = fs::File::create(&temp_zip_path)
            .map_err(|e| format!("创建临时下载文件失败: {e}"))?;
        file.write_all(&bytes)
            .map_err(|e| format!("写入临时下载文件失败: {e}"))?;
    }

    // 调用已有的智能安装内核
    let zip_str = temp_zip_path.to_string_lossy().into_owned();
    let install_result = crate::mod_install::install_mod_zip(zip_str, game_path, None);

    // 清理临时下载文件
    let _ = fs::remove_file(&temp_zip_path);

    install_result
}

/// 检测本地已安装的 Mod 是否存在更新。
#[tauri::command]
pub fn check_installed_updates(
    game_path: String,
    community_mods: Vec<ThunderstorePackage>,
) -> Result<Vec<ModUpdateInfo>, String> {
    let local_mods = crate::plugins::scan_plugins(game_path)?;
    let mut updates = Vec::new();

    // 建立远程索引: 支持 full_name ("Author-ModName") 与 name ("ModName") 检索
    for local in &local_mods {
        if local.version.is_empty() {
            continue;
        }

        let matched = community_mods.iter().find(|remote| {
            remote.full_name.eq_ignore_ascii_case(&local.folder_name)
                || remote.name.eq_ignore_ascii_case(&local.name)
                || remote.name.eq_ignore_ascii_case(&local.folder_name)
        });

        if let Some(remote) = matched {
            if let Some(latest) = &remote.latest_version {
                if is_newer_version(&latest.version_number, &local.version) {
                    updates.push(ModUpdateInfo {
                        folder_name: local.folder_name.clone(),
                        mod_name: local.name.clone(),
                        current_version: local.version.clone(),
                        latest_version: latest.version_number.clone(),
                        download_url: latest.download_url.clone(),
                        description: latest.description.clone(),
                        icon_url: latest.icon.clone(),
                    });
                }
            }
        }
    }

    Ok(updates)
}

/// 语义化版本比对: 判断 remote 是否高于 local
fn is_newer_version(remote: &str, local: &str) -> bool {
    let parse_semver = |s: &str| -> Option<semver::Version> {
        let clean = s.trim_start_matches('v').trim();
        semver::Version::parse(clean)
            .or_else(|_| {
                let parts: Vec<&str> = clean.split('.').collect();
                if parts.len() == 2 {
                    semver::Version::parse(&format!("{clean}.0"))
                } else if parts.len() == 1 {
                    semver::Version::parse(&format!("{clean}.0.0"))
                } else {
                    semver::Version::parse("0.0.0")
                }
            })
            .ok()
    };

    match (parse_semver(remote), parse_semver(local)) {
        (Some(rem_v), Some(loc_v)) => rem_v > loc_v,
        _ => remote != local && !local.is_empty(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_newer_version_semver() {
        assert!(is_newer_version("1.2.0", "1.1.0"));
        assert!(is_newer_version("2.0.0", "1.9.9"));
        assert!(is_newer_version("1.0.1", "1.0.0"));
        assert!(!is_newer_version("1.0.0", "1.0.0"));
        assert!(!is_newer_version("1.0.0", "1.2.0"));
        assert!(is_newer_version("v1.5.0", "1.4.0"));
    }

    #[test]
    fn test_convert_raw_packages() {
        let raw = vec![ThunderstorePackageRaw {
            name: "ExampleMod".to_string(),
            full_name: "Author-ExampleMod".to_string(),
            owner: "Author".to_string(),
            package_url: "https://thunderstore.io/package/Author/ExampleMod/".to_string(),
            is_pinned: false,
            is_deprecated: false,
            rating_score: 42,
            categories: vec!["Gameplay".to_string()],
            versions: vec![
                ThunderstoreVersionRaw {
                    name: "ExampleMod".to_string(),
                    full_name: "Author-ExampleMod-1.2.0".to_string(),
                    version_number: "1.2.0".to_string(),
                    description: "desc".to_string(),
                    icon: "icon.png".to_string(),
                    dependencies: vec![],
                    download_url: "https://example.com/dl.zip".to_string(),
                    downloads: 100,
                    date_created: "2026-08-01".to_string(),
                    file_size: 1024,
                },
                ThunderstoreVersionRaw {
                    name: "ExampleMod".to_string(),
                    full_name: "Author-ExampleMod-1.0.0".to_string(),
                    version_number: "1.0.0".to_string(),
                    description: "desc".to_string(),
                    icon: "icon.png".to_string(),
                    dependencies: vec![],
                    download_url: "https://example.com/dl1.zip".to_string(),
                    downloads: 50,
                    date_created: "2026-07-01".to_string(),
                    file_size: 1024,
                },
            ],
        }];

        let pkgs = convert_raw_packages(raw);
        assert_eq!(pkgs.len(), 1);
        assert_eq!(pkgs[0].name, "ExampleMod");
        assert_eq!(pkgs[0].total_downloads, 150);
        assert_eq!(pkgs[0].latest_version.as_ref().unwrap().version_number, "1.2.0");
    }
}
