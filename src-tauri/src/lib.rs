use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use tauri::Manager;

mod mod_install;
mod modpack;
mod plugins;
mod repo_detect;
mod sync_bepinex;
mod system_tools;
mod conflict_detector;
mod thunderstore;

/// 测试用锁:并发测试共用 data/ 目录(config.json、temp、backups),串行化相关测试。
#[cfg(test)]
pub(crate) static TEST_DATA_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

/// 便携数据根目录:可执行文件同级目录下的 `./data/`
///
/// 不依赖 AppData / LocalAppData,所有数据跟随程序本体存放。
/// 注意:开发模式下 `current_exe()` 位于 `target/debug/`,数据目录为
/// `target/debug/data/`;打包安装后可执行文件旁即为 `data/`。
pub fn get_portable_data_dir() -> PathBuf {
    let exe = std::env::current_exe().expect("无法获取当前可执行文件路径");
    exe.parent()
        .unwrap_or_else(|| Path::new("."))
        .join("data")
}

/// 配置文件路径:`./data/config.json`
pub fn get_config_path() -> PathBuf {
    get_portable_data_dir().join("config.json")
}

/// 临时解压目录:`./data/temp/`
pub fn get_temp_dir() -> PathBuf {
    get_portable_data_dir().join("temp")
}

/// 读取配置文件,文件不存在时返回空对象 `{}`。
#[tauri::command]
fn load_app_config() -> Result<Value, String> {
    let config_path = get_config_path();
    if !config_path.exists() {
        return Ok(json!({}));
    }
    let content =
        std::fs::read_to_string(&config_path).map_err(|e| format!("读取配置文件失败: {e}"))?;
    serde_json::from_str(&content).map_err(|e| format!("解析配置文件失败: {e}"))
}

/// 保存配置文件(自动创建数据目录,格式化写入以便人工阅读/修改)。
#[tauri::command]
fn save_app_config(config: Value) -> Result<(), String> {
    let data_dir = get_portable_data_dir();
    std::fs::create_dir_all(&data_dir).map_err(|e| format!("创建数据目录失败: {e}"))?;
    let content =
        serde_json::to_string_pretty(&config).map_err(|e| format!("序列化配置失败: {e}"))?;
    std::fs::write(get_config_path(), content).map_err(|e| format!("写入配置文件失败: {e}"))
}

/// 将便携数据目录暴露给前端展示(可选命令)。
#[tauri::command]
fn get_data_dir() -> String {
    get_portable_data_dir().to_string_lossy().into_owned()
}

/// 通过 Steam 协议唤起并启动 R.E.P.O.。
#[cfg(windows)]
#[tauri::command]
fn launch_game() -> Result<(), String> {
    std::process::Command::new("cmd")
        .args(["/C", "start", "", "steam://rungameid/3241660"])
        .spawn()
        .map_err(|e| format!("启动游戏失败: {e}"))?;
    Ok(())
}

#[cfg(not(windows))]
#[tauri::command]
fn launch_game() -> Result<(), String> {
    Err("仅支持 Windows 系统".to_string())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        // 单实例检测:重复启动时聚焦已有窗口并退出新实例
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .setup(|_app| {
            let data_dir = get_portable_data_dir();
            let temp_dir = get_temp_dir();
            std::fs::create_dir_all(&data_dir)?;
            std::fs::create_dir_all(&temp_dir)?;
            println!("便携数据目录: {}", data_dir.display());
            println!("临时目录: {}", temp_dir.display());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_data_dir,
            load_app_config,
            save_app_config,
            repo_detect::auto_detect_repo_path,
            mod_install::install_mod_zip,
            mod_install::restore_clean_game,
            sync_bepinex::sync_bepinex_pack,
            plugins::scan_plugins,
            plugins::toggle_plugin,
            plugins::toggle_all_plugins,
            plugins::delete_plugin,
            launch_game,
            modpack::get_pack_manifest,
            modpack::save_pack_manifest,
            modpack::scan_exportable_tree,
            modpack::export_modpack_zip,
            modpack::inspect_modpack,
            system_tools::open_path_in_explorer,
            system_tools::open_mod_config,
            system_tools::get_game_env_status,
            conflict_detector::diagnose_conflicts,
            thunderstore::fetch_community_mods,
            thunderstore::download_and_install_mod,
            thunderstore::check_installed_updates
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn clean_config() {
        let path = get_config_path();
        if path.exists() {
            std::fs::remove_file(&path).unwrap();
        }
    }

    #[test]
    fn test_load_missing_config_returns_empty() {
        let _guard = TEST_DATA_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        clean_config();
        assert_eq!(load_app_config().unwrap(), json!({}));
    }

    #[test]
    fn test_config_save_and_load_roundtrip() {
        let _guard = TEST_DATA_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        clean_config();
        let config = json!({
            "game_path": "D:\\Steam\\steamapps\\common\\REPO",
            "mods": {
                "example_mod": { "enabled": true, "version": "1.0.0" }
            }
        });
        save_app_config(config.clone()).unwrap();
        assert!(get_config_path().exists());
        assert_eq!(load_app_config().unwrap(), config);
        clean_config();
    }
}
