import React, { useCallback, useEffect, useState, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Power,
  PowerOff,
  Search,
  Layers,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Info,
  X,
  Tags,
  CheckSquare,
  MousePointerClick,
  UploadCloud,
  ArrowUpDown,
  LayoutGrid,
  List,
} from "lucide-react";
import type {
  ModCardInfo,
  PackManifest,
  ImportPreview,
  GameEnvStatus,
  SortOption,
  ViewMode,
  ActiveTab,
  ThunderstorePackage,
  ModUpdateInfo,
  ConflictReport,
} from "./types";
import { useFlipList } from "./hooks/useFlipList";
import Sidebar from "./components/Sidebar";
import DropZone from "./components/DropZone";
import ModCard from "./components/ModCard";
import CompactModRow from "./components/CompactModRow";
import ContextMenu, { ContextMenuPosition } from "./components/ContextMenu";
import CategoryTabs, { PRESET_CATEGORIES } from "./components/CategoryTabs";
import CommunityMarket from "./components/CommunityMarket";
import ConflictModal from "./components/ConflictModal";
import ExportModal from "./components/ExportModal";
import ImportModal from "./components/ImportModal";
import BatchActionBar from "./components/BatchActionBar";
import {
  playClickSound,
  playToggleSound,
  playSuccessSound,
  playLaunchSound,
} from "./utils/audio";

type InstallState = "idle" | "installing" | "success" | "error";

interface ToastInfo {
  id: number;
  type: "success" | "error" | "info";
  title: string;
  message?: string;
}

export default function App() {
  const [gamePath, setGamePath] = useState("");
  const [mods, setMods] = useState<ModCardInfo[]>([]);
  const [envStatus, setEnvStatus] = useState<GameEnvStatus | null>(null);
  const [installState, setInstallState] = useState<InstallState>("idle");
  const [installMessage, setInstallMessage] = useState("");

  // 主导航 Tab: 本地工作站 vs 社区在线市场
  const [activeTab, setActiveTab] = useState<ActiveTab>("local");

  // 社区市场与更新检测
  const [communityMods, setCommunityMods] = useState<ThunderstorePackage[]>([]);
  const [marketLoading, setMarketLoading] = useState(false);
  const [updates, setUpdates] = useState<ModUpdateInfo[]>([]);
  const [marketSearchQuery, setMarketSearchQuery] = useState("");

  // 冲突诊断
  const [conflictReport, setConflictReport] = useState<ConflictReport | null>(null);
  const [conflictModalOpen, setConflictModalOpen] = useState(false);

  // 视图与排序
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      return (localStorage.getItem("repo_view_mode") as ViewMode) || "card";
    } catch {
      return "card";
    }
  });
  const [sortOption, setSortOption] = useState<SortOption>("default");

  // 右键菜单
  const [contextMenu, setContextMenu] = useState<{
    mod: ModCardInfo;
    category: string;
    position: ContextMenuPosition;
  } | null>(null);

  // 分类清单与筛选
  const [manifest, setManifest] = useState<PackManifest>({
    packName: "默认整合包",
    author: "",
    version: "1.0.0",
    description: "",
    categories: ["全部", "核心前置", "怪物与玩法", "道具与装备", "汉化与优化", "未分类"],
    modCategories: {},
  });
  const [selectedCategory, setSelectedCategory] = useState("全部");
  const [exportOpen, setExportOpen] = useState(false);

  // 批量选择模式
  const [batchMode, setBatchMode] = useState(false);
  const [selectedMods, setSelectedMods] = useState<Set<string>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const lastSelectedRef = useRef<string | null>(null);

  // 搜索与防抖
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // 状态锁
  const [togglingFolders, setTogglingFolders] = useState<Set<string>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [toasts, setToasts] = useState<ToastInfo[]>([]);
  const [dropOver, setDropOver] = useState(false);
  const [launching, setLaunching] = useState(false);

  // 导入确认弹窗
  const [importOpen, setImportOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importZipPath, setImportZipPath] = useState("");

  // 还原纯净游戏(二次确认)
  const [cleanConfirm, setCleanConfirm] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const cleanTimer = useRef<number | null>(null);

  // 搜索防抖 200ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchInput);
    }, 200);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // 视图模式持久化
  function handleViewModeChange(mode: ViewMode) {
    setViewMode(mode);
    try {
      localStorage.setItem("repo_view_mode", mode);
    } catch {
      /* 忽略 */
    }
  }

  // Tauri 2 原生文件拖放
  const startImportFlowRef = useRef(startImportFlow);
  useEffect(() => {
    startImportFlowRef.current = startImportFlow;
  });

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    try {
      getCurrentWebview()
        .onDragDropEvent((event) => {
          if (event.payload.type === "over") {
            setDropOver(true);
          } else if (event.payload.type === "leave") {
            setDropOver(false);
          } else if (event.payload.type === "drop") {
            setDropOver(false);
            const p = event.payload.paths[0];
            if (p && p.toLowerCase().endsWith(".zip")) {
              void startImportFlowRef.current(p);
            } else if (p) {
              setInstallState("error");
              setInstallMessage("仅支持 .zip 格式的压缩包");
              showToast("error", "格式错误", "仅支持放入 .zip 格式的 Mod 压缩包");
            }
          }
        })
        .then((fn) => {
          unlisten = fn;
        });
    } catch {
      /* 非 Tauri 环境时忽略 */
    }
    return () => {
      unlisten?.();
    };
  }, []);

  // 全局 Toast 提示函数
  const showToast = useCallback((type: "success" | "error" | "info", title: string, message?: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, type, title, message }]);
  }, []);

  const removeToast = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const toastFlipRef = useFlipList(toasts, (t) => String(t.id));

  // 冲突体检与诊断
  const loadConflicts = useCallback(async (path: string) => {
    if (!path) return;
    try {
      const report = await invoke<ConflictReport>("diagnose_conflicts", { gamePath: path });
      setConflictReport(report);
    } catch {
      setConflictReport(null);
    }
  }, []);

  // 扫描环境与 Mod 列表
  const loadEnvStatus = useCallback(async (path: string) => {
    if (!path) return;
    try {
      const status = await invoke<GameEnvStatus>("get_game_env_status", { gamePath: path });
      setEnvStatus(status);
    } catch {
      setEnvStatus(null);
    }
  }, []);

  // 检查更新
  const checkUpdates = useCallback(
    async (path: string, list: ThunderstorePackage[]) => {
      if (!path || list.length === 0) return;
      try {
        const found = await invoke<ModUpdateInfo[]>("check_installed_updates", {
          gamePath: path,
          communityMods: list,
        });
        setUpdates(found);
      } catch {
        /* 忽略 */
      }
    },
    []
  );

  // 加载社区市场
  const loadCommunityMods = useCallback(
    async (forceRefresh = false) => {
      setMarketLoading(true);
      try {
        const pkgs = await invoke<ThunderstorePackage[]>("fetch_community_mods", { forceRefresh });
        setCommunityMods(pkgs);
        if (gamePath) {
          void checkUpdates(gamePath, pkgs);
        }
      } catch (e) {
        showToast("error", "连接社区市场失败", String(e));
      } finally {
        setMarketLoading(false);
      }
    },
    [gamePath, checkUpdates, showToast]
  );

  const scan = useCallback(
    async (path: string, silent = false) => {
      if (!path) return;
      setIsRefreshing(true);
      try {
        const list = await invoke<ModCardInfo[]>("scan_plugins", { gamePath: path });
        setMods(list);
        await loadEnvStatus(path);
        await loadConflicts(path);
        if (communityMods.length > 0) {
          void checkUpdates(path, communityMods);
        }
        if (!silent) {
          showToast("info", "Mod 列表已刷新", `共扫描到 ${list.length} 个插件`);
        }
      } catch (e) {
        setMods([]);
        showToast("error", "扫描失败", String(e));
      } finally {
        setIsRefreshing(false);
      }
    },
    [showToast, loadEnvStatus, loadConflicts, communityMods, checkUpdates]
  );

  const loadManifest = useCallback(async (path: string) => {
    try {
      const m = await invoke<PackManifest>("get_pack_manifest", { gamePath: path });
      setManifest(m);
    } catch {
      /* 使用默认清单 */
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const config = await invoke<Record<string, unknown>>("load_app_config");
        const saved = config.gamePath as string | undefined;
        if (saved) {
          setGamePath(saved);
          await loadManifest(saved);
          await scan(saved, true);
          void loadCommunityMods();
          return;
        }
      } catch {
        /* 忽略 */
      }
      try {
        const detected = await invoke<string>("auto_detect_repo_path");
        setGamePath(detected);
        await saveGamePath(detected);
        await loadManifest(detected);
        await scan(detected, true);
        void loadCommunityMods();
        showToast("success", "已自动识别 Steam 游戏目录", detected);
      } catch {
        void loadCommunityMods();
      }
    })();
  }, [scan, showToast, loadManifest, loadCommunityMods]);

  async function saveGamePath(path: string) {
    try {
      const config = await invoke<Record<string, unknown>>("load_app_config");
      config.gamePath = path;
      await invoke("save_app_config", { config });
    } catch {
      /* 忽略 */
    }
  }

  async function pickFolder() {
    playClickSound();
    const dir = await open({ directory: true, multiple: false });
    if (typeof dir === "string") {
      setGamePath(dir);
      await saveGamePath(dir);
      await scan(dir);
      showToast("success", "已切换游戏目录");
    }
  }

  async function pickZip() {
    playClickSound();
    const file = await open({
      multiple: false,
      filters: [{ name: "Zip 压缩包", extensions: ["zip"] }],
    });
    if (typeof file === "string") await startImportFlow(file);
  }

  // 常用目录一键打开
  async function handleOpenFolder(subpath?: string) {
    if (!gamePath && subpath !== "__BACKUPS__") return;
    try {
      if (subpath === "__BACKUPS__") {
        const dataDir = await invoke<string>("get_data_dir");
        await invoke("open_path_in_explorer", { path: `${dataDir}/backups` });
      } else {
        const target = subpath ? `${gamePath}/${subpath}` : gamePath;
        await invoke("open_path_in_explorer", { path: target });
      }
    } catch (e) {
      showToast("error", "打开文件夹失败", String(e));
    }
  }

  // Mod 在文件管理器中定位
  async function handleOpenModFolder(mod: ModCardInfo) {
    if (!gamePath) return;
    try {
      const base = mod.enabled ? "BepInEx/plugins" : "BepInEx/disabled_plugins";
      const target = `${gamePath}/${base}/${mod.folderName}`;
      await invoke("open_path_in_explorer", { path: target, selectFile: !mod.isFolder });
      showToast("info", "已定位 Mod 文件", mod.folderName);
    } catch (e) {
      showToast("error", "定位失败", String(e));
    }
  }

  // 打开 Mod 配置文件
  async function handleOpenModConfig(mod: ModCardInfo) {
    if (!gamePath) return;
    try {
      const result = await invoke<string>("open_mod_config", {
        gamePath,
        modName: mod.folderName,
      });
      if (result === "config_dir") {
        showToast("info", "已打开配置目录", "该 Mod 尚未生成专属 .cfg 配置文件");
      } else {
        showToast("success", "已打开配置文件", result);
      }
    } catch (e) {
      showToast("error", "打开配置失败", String(e));
    }
  }

  // 从社区市场一键安装 Mod
  async function handleInstallFromMarket(pkg: ThunderstorePackage) {
    if (!gamePath) {
      showToast("error", "安装失败", "请先选择游戏目录");
      return;
    }
    const dlUrl = pkg.latestVersion?.downloadUrl;
    if (!dlUrl) {
      showToast("error", "安装失败", "未找到有效的下载地址");
      return;
    }

    try {
      await invoke("download_and_install_mod", { gamePath, downloadUrl: dlUrl });
      showToast("success", `已成功安装 ${pkg.name}`, `版本 v${pkg.latestVersion?.versionNumber || ""}`);
      await scan(gamePath, true);
    } catch (e) {
      showToast("error", `安装 ${pkg.name} 失败`, String(e));
    }
  }

  // 一键更新本地 Mod
  async function handleUpdateMod(mod: ModCardInfo, update: ModUpdateInfo) {
    if (!gamePath) return;
    playClickSound();
    try {
      await invoke("download_and_install_mod", { gamePath, downloadUrl: update.downloadUrl });
      playSuccessSound();
      showToast("success", `已将 ${mod.name} 升级至 v${update.latestVersion}`);
      await scan(gamePath, true);
    } catch (e) {
      showToast("error", `升级 ${mod.name} 失败`, String(e));
    }
  }

  // 在社区市场中搜索依赖
  function handleSearchInMarket(depName: string) {
    setMarketSearchQuery(depName);
    setActiveTab("market");
    if (communityMods.length === 0) {
      void loadCommunityMods();
    }
  }

  // 一键复制开黑 Mod 清单
  function handleCopyTeamList() {
    const enabledMods = mods.filter((m) => m.enabled);
    const fingerprint = envStatus?.fingerprint || "REPO-READY";
    const text = [
      `🎮 【R.E.P.O. 开黑 Mod 配置清单】`,
      `🔑 联机指纹: ${fingerprint}`,
      `📦 已启用: ${enabledMods.length} 个 Mod (共 ${mods.length} 个)`,
      `📋 插件列表:`,
      ...enabledMods.map(
        (m, idx) => `  ${idx + 1}. ${m.name}${m.version ? ` (v${m.version})` : ""}`
      ),
      `\n💡 提示: 请确保所有队员联机指纹一致以保证联机顺畅！`,
    ].join("\n");

    void navigator.clipboard.writeText(text);
    playSuccessSound();
    showToast("success", "已复制开黑配置清单", `共 ${enabledMods.length} 个 Mod，可直接发到群聊`);
  }

  // 导入前置流程
  async function startImportFlow(zipPath: string) {
    if (importOpen || installState === "installing") return;
    if (!gamePath) {
      setInstallState("error");
      setInstallMessage("请先选择游戏目录");
      showToast("error", "操作失败", "请先选择或定位游戏安装目录");
      return;
    }
    setInstallState("installing");
    setInstallMessage("正在读取压缩包信息...");
    try {
      const preview = await invoke<ImportPreview>("inspect_modpack", { zipPath });
      setImportPreview(preview);
      setImportZipPath(zipPath);
      setImportOpen(true);
      setInstallState("idle");
      setInstallMessage("");
    } catch {
      setInstallState("idle");
      setInstallMessage("");
      await installZip(zipPath);
    }
  }

  async function confirmImport(mode: "merge" | "replace") {
    setImportOpen(false);
    await installZip(importZipPath, mode);
  }

  async function installZip(zipPath: string, mode: "merge" | "replace" = "merge") {
    if (!gamePath) {
      setInstallState("error");
      setInstallMessage("请先选择游戏目录");
      showToast("error", "操作失败", "请先选择或定位游戏安装目录");
      return;
    }
    if (installState === "installing") return;
    setInstallState("installing");
    setInstallMessage("");
    try {
      try {
        await invoke("install_mod_zip", { zipPath, gamePath, mode });
      } catch {
        await invoke("sync_bepinex_pack", { zipPath, gamePath, mode });
      }
      setInstallState("success");
      setInstallMessage("Mod 同步部署完成！");
      playSuccessSound();
      showToast("success", "安装成功", "Mod 压缩包已完成智能分流解压");
      await scan(gamePath, true);
    } catch (e) {
      setInstallState("error");
      setInstallMessage(String(e));
      showToast("error", "部署出错", String(e));
    }
  }

  function handleFile(file: File) {
    const path = (file as File & { path?: string }).path;
    if (!path) return;
    if (!file.name.toLowerCase().endsWith(".zip")) {
      setInstallState("error");
      setInstallMessage("仅支持 .zip 格式的压缩包");
      showToast("error", "格式错误", "仅支持放入 .zip 格式的 Mod 压缩包");
      return;
    }
    void startImportFlow(path);
  }

  async function deleteMod(mod: ModCardInfo) {
    playClickSound();
    try {
      const result = await invoke<{ deletedCount: number; deletedBytes: number }>(
        "delete_plugin",
        { gamePath, folderName: mod.folderName }
      );
      const mb = (result.deletedBytes / 1024 / 1024).toFixed(2);
      showToast("success", `已删除 ${mod.name}`, `清理 ${result.deletedCount} 项, 释放 ${mb} MB`);
      await scan(gamePath, true);
    } catch (e) {
      showToast("error", "删除失败", String(e));
    }
  }

  async function restoreClean() {
    if (!gamePath || restoring) return;
    if (cleanTimer.current) window.clearTimeout(cleanTimer.current);
    setCleanConfirm(false);
    setRestoring(true);
    playClickSound();
    try {
      const deleted = await invoke<number>("restore_clean_game", { gamePath });
      setMods([]);
      setManifest({
        packName: "默认整合包",
        author: "",
        version: "1.0.0",
        description: "",
        categories: ["全部", "核心前置", "怪物与玩法", "道具与装备", "汉化与优化", "未分类"],
        modCategories: {},
      });
      setSelectedMods(new Set());
      setSelectedCategory("全部");
      await scan(gamePath, true);
      playSuccessSound();
      showToast(
        "success",
        "已还原纯净游戏",
        deleted > 0 ? `移除了 ${deleted} 项 Mod 相关文件` : "游戏目录已是纯净状态"
      );
    } catch (e) {
      showToast("error", "还原失败", String(e));
    } finally {
      setRestoring(false);
    }
  }

  async function toggleMod(mod: ModCardInfo) {
    if (togglingFolders.has(mod.folderName)) return;
    const targetState = !mod.enabled;
    playToggleSound(targetState);

    try {
      await invoke("toggle_plugin", {
        gamePath,
        folderName: mod.folderName,
        enable: targetState,
      });

      setMods((prev) =>
        prev.map((m) => (m.folderName === mod.folderName ? { ...m, enabled: targetState } : m))
      );
      await loadEnvStatus(gamePath);
      await loadConflicts(gamePath);
      showToast("info", targetState ? `已启用 ${mod.name}` : `已禁用 ${mod.name}`);
    } catch (e) {
      showToast("error", "切换失败", String(e));
    } finally {
      setTogglingFolders((prev) => {
        const next = new Set(prev);
        next.delete(mod.folderName);
        return next;
      });
    }
  }

  async function toggleAll(enable: boolean) {
    playToggleSound(enable);
    try {
      await invoke("toggle_all_plugins", { gamePath, enable });
      setMods((prev) => prev.map((m) => ({ ...m, enabled: enable })));
      await loadEnvStatus(gamePath);
      await loadConflicts(gamePath);
      showToast("success", enable ? "已一键全部启用" : "已一键全部禁用");
    } catch (e) {
      showToast("error", "批量操作失败", String(e));
    }
  }

  function categoryOf(mod: ModCardInfo): string {
    return manifest.modCategories[mod.folderName] ?? "未分类";
  }

  const customCategories = useMemo(
    () => manifest.categories.filter((c) => !PRESET_CATEGORIES.includes(c)),
    [manifest.categories]
  );

  async function changeCategory(mod: ModCardInfo, category: string) {
    playClickSound();
    const next: PackManifest = {
      ...manifest,
      modCategories: { ...manifest.modCategories },
    };
    if (category === "未分类") {
      delete next.modCategories[mod.folderName];
    } else {
      next.modCategories[mod.folderName] = category;
    }
    setManifest(next);
    try {
      await invoke("save_pack_manifest", { gamePath, manifest: next });
    } catch (e) {
      showToast("error", "保存分类失败", String(e));
    }
  }

  async function addCategory(name: string) {
    playClickSound();
    if (customCategories.includes(name) || PRESET_CATEGORIES.includes(name)) {
      showToast("error", "分类已存在");
      return;
    }
    const next: PackManifest = { ...manifest, categories: [...manifest.categories, name] };
    setManifest(next);
    try {
      await invoke("save_pack_manifest", { gamePath, manifest: next });
      showToast("success", `已新建分类「${name}」`);
    } catch (e) {
      showToast("error", "保存分类失败", String(e));
    }
  }

  async function renameCategory(oldName: string, newName: string) {
    playClickSound();
    const name = newName.trim();
    if (!name || name === oldName) return;
    if (customCategories.some((c) => c === name)) {
      showToast("error", "分类名已存在");
      return;
    }
    const next: PackManifest = {
      ...manifest,
      categories: manifest.categories.map((c) => (c === oldName ? name : c)),
      modCategories: { ...manifest.modCategories },
    };
    for (const [k, v] of Object.entries(next.modCategories)) {
      if (v === oldName) next.modCategories[k] = name;
    }
    setManifest(next);
    if (selectedCategory === oldName) setSelectedCategory(name);
    try {
      await invoke("save_pack_manifest", { gamePath, manifest: next });
      showToast("success", `已重命名为「${name}」`);
    } catch (e) {
      showToast("error", "保存分类失败", String(e));
    }
  }

  async function deleteCategory(name: string) {
    playClickSound();
    const next: PackManifest = {
      ...manifest,
      categories: manifest.categories.filter((c) => c !== name),
      modCategories: { ...manifest.modCategories },
    };
    for (const k of Object.keys(next.modCategories)) {
      if (next.modCategories[k] === name) delete next.modCategories[k];
    }
    setManifest(next);
    if (selectedCategory === name) setSelectedCategory("全部");
    try {
      await invoke("save_pack_manifest", { gamePath, manifest: next });
      showToast("success", `已删除分类「${name}」`);
    } catch (e) {
      showToast("error", "保存分类失败", String(e));
    }
  }

  function toggleSelect(folderName: string, shift: boolean) {
    playClickSound();
    setSelectedMods((prev) => {
      const next = new Set(prev);
      if (shift && lastSelectedRef.current) {
        const idx = filteredMods.findIndex((m) => m.folderName === folderName);
        const lastIdx = filteredMods.findIndex((m) => m.folderName === lastSelectedRef.current);
        if (idx >= 0 && lastIdx >= 0) {
          const [a, b] = idx < lastIdx ? [idx, lastIdx] : [lastIdx, idx];
          for (let i = a; i <= b; i++) next.add(filteredMods[i].folderName);
          return next;
        }
      }
      if (next.has(folderName)) next.delete(folderName);
      else next.add(folderName);
      lastSelectedRef.current = folderName;
      return next;
    });
  }

  function dragSelect(folderName: string) {
    if (!dragging) return;
    setSelectedMods((prev) => {
      const next = new Set(prev);
      next.add(folderName);
      return next;
    });
  }

  function exitBatch() {
    playClickSound();
    setBatchMode(false);
    setSelectedMods(new Set());
    setDragging(false);
    lastSelectedRef.current = null;
  }

  function selectAll() {
    playClickSound();
    setSelectedMods((prev) => {
      const next = new Set(prev);
      const allSelected =
        filteredMods.length > 0 && filteredMods.every((m) => prev.has(m.folderName));
      filteredMods.forEach((m) => {
        if (allSelected) next.delete(m.folderName);
        else next.add(m.folderName);
      });
      return next;
    });
  }

  async function batchSetEnabled(enable: boolean) {
    if (batchBusy) return;
    playToggleSound(enable);
    setBatchBusy(true);
    const targets = [...selectedMods];
    let failed = 0;
    for (const f of targets) {
      try {
        await invoke("toggle_plugin", { gamePath, folderName: f, enable });
      } catch {
        failed++;
      }
    }
    setMods((prev) =>
      prev.map((m) => (selectedMods.has(m.folderName) ? { ...m, enabled: enable } : m))
    );
    await loadEnvStatus(gamePath);
    await loadConflicts(gamePath);
    setBatchBusy(false);
    if (failed) showToast("error", "批量操作部分失败", `${failed}/${targets.length} 项失败`);
    else showToast("success", enable ? `已批量启用 ${targets.length} 项` : `已批量禁用 ${targets.length} 项`);
  }

  async function batchMoveToCategory(category: string) {
    playClickSound();
    const targets = [...selectedMods];
    const next: PackManifest = {
      ...manifest,
      modCategories: { ...manifest.modCategories },
    };
    for (const f of targets) {
      if (category === "未分类") delete next.modCategories[f];
      else next.modCategories[f] = category;
    }
    setManifest(next);
    try {
      await invoke("save_pack_manifest", { gamePath, manifest: next });
      showToast("success", `已将 ${targets.length} 项归入「${category}」`);
    } catch (e) {
      showToast("error", "保存分类失败", String(e));
    }
    setSelectedMods(new Set());
  }

  async function batchDelete() {
    if (batchBusy) return;
    playClickSound();
    setBatchBusy(true);
    const targets = [...selectedMods];
    const count = targets.length;
    let failed = 0;
    for (const f of targets) {
      try {
        await invoke("delete_plugin", { gamePath, folderName: f });
      } catch {
        failed++;
      }
    }
    const next: PackManifest = {
      ...manifest,
      modCategories: { ...manifest.modCategories },
    };
    for (const f of targets) delete next.modCategories[f];
    setManifest(next);
    try {
      await invoke("save_pack_manifest", { gamePath, manifest: next });
    } catch {
      /* 忽略 */
    }
    await scan(gamePath, true);
    setSelectedMods(new Set());
    setBatchBusy(false);
    if (failed) showToast("error", "批量删除部分失败", `${failed}/${count} 项删除失败`);
    else showToast("success", `已从硬盘删除 ${count} 项`);
  }

  async function launchGame() {
    if (launching) return;
    setLaunching(true);
    playLaunchSound();
    try {
      await invoke("launch_game");
      showToast("success", "正在启动 R.E.P.O.", "已向 Steam 发送唤起指令");
    } catch (e) {
      showToast("error", "启动失败", String(e));
    } finally {
      setLaunching(false);
    }
  }

  function handleContextMenu(e: React.MouseEvent, mod: ModCardInfo) {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      mod,
      category: categoryOf(mod),
      position: { x: e.clientX, y: e.clientY },
    });
  }

  // 建立更新与冲突 Map 供 Mod 卡片快速索引
  const updatesMap = useMemo(() => {
    const map = new Map<string, ModUpdateInfo>();
    updates.forEach((u) => {
      map.set(u.folderName.toLowerCase(), u);
      map.set(u.modName.toLowerCase(), u);
    });
    return map;
  }, [updates]);

  const conflictsMap = useMemo(() => {
    const map = new Map<string, string>();
    if (!conflictReport) return map;
    conflictReport.missingDependencies.forEach((m) => {
      map.set(m.folderName.toLowerCase(), `缺少依赖: ${m.dependencyName}`);
    });
    return map;
  }, [conflictReport]);

  const filteredMods = useMemo(() => {
    const q = debouncedQuery.toLowerCase();
    let result = mods.filter((m) => {
      const matchesCategory =
        selectedCategory === "全部"
          ? true
          : selectedCategory === "已启用"
          ? m.enabled
          : selectedCategory === "已禁用"
          ? !m.enabled
          : categoryOf(m) === selectedCategory;
      const matchesSearch =
        !q ||
        m.name.toLowerCase().includes(q) ||
        m.author.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });

    // 多维排序
    result = [...result].sort((a, b) => {
      switch (sortOption) {
        case "name-asc":
          return a.name.localeCompare(b.name, "zh-CN");
        case "name-desc":
          return b.name.localeCompare(a.name, "zh-CN");
        case "size-desc":
          return (b.size || 0) - (a.size || 0);
        case "status":
          return Number(b.enabled) - Number(a.enabled);
        case "category":
          return categoryOf(a).localeCompare(categoryOf(b), "zh-CN");
        default:
          return 0;
      }
    });

    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mods, debouncedQuery, selectedCategory, manifest, sortOption]);

  const enabledCount = mods.filter((m) => m.enabled).length;

  return (
    <div
      className="flex h-screen w-screen overflow-hidden bg-black text-slate-100 selection:bg-cyan-500/30 selection:text-cyan-200"
      onClick={() => contextMenu && setContextMenu(null)}
    >
      {/* 战术光晕背景 (GPU 分层隔离, 不影响滚动帧率) */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden z-0">
        <div className="absolute -left-40 -top-40 h-96 w-96 rounded-full bg-cyan-500/10 blur-[90px] transform-gpu" />
        <div className="absolute right-1/4 top-1/4 h-96 w-96 rounded-full bg-emerald-500/10 blur-[90px] transform-gpu" />
      </div>

      {/* 拖入文件时全屏高亮遮罩 */}
      {dropOver && (
        <div className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bar-in flex flex-col items-center rounded-2xl border-2 border-dashed border-cyan-400/60 bg-cyan-950/30 px-10 py-8 text-cyan-300 shadow-[0_0_40px_rgba(6,182,212,0.25)]">
            <UploadCloud className="h-10 w-10 drop-shadow-[0_0_10px_rgba(6,182,212,0.6)]" />
            <p className="mt-3 text-sm font-bold">松开鼠标以安装 Mod 压缩包</p>
            <p className="mt-1 text-xs text-cyan-400/70">仅支持 .zip 格式</p>
          </div>
        </div>
      )}

      {/* 全局 Toast 通知容器 (右上角) */}
      <div className="fixed right-6 top-6 z-[60] flex flex-col gap-2.5 pointer-events-none">
        {toasts.map((toast) => (
          <div key={toast.id} ref={toastFlipRef(String(toast.id))}>
            <ToastItem toast={toast} onClose={() => removeToast(toast.id)} />
          </div>
        ))}
      </div>

      {/* 左侧全能侧边栏 */}
      <Sidebar
        gamePath={gamePath}
        onPickFolder={pickFolder}
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          if (tab === "market" && communityMods.length === 0) {
            void loadCommunityMods();
          }
        }}
        modsCount={mods.length}
        enabledCount={enabledCount}
        updateCount={updates.length}
        conflictReport={conflictReport}
        onOpenConflictModal={() => setConflictModalOpen(true)}
        envStatus={envStatus}
        onOpenFolder={handleOpenFolder}
        onCopyTeamList={handleCopyTeamList}
        onLaunchGame={() => void launchGame()}
        launching={launching}
        onExportPack={() => setExportOpen(true)}
        onRestoreClean={() => {
          if (cleanConfirm) {
            void restoreClean();
          } else {
            playClickSound();
            setCleanConfirm(true);
            if (cleanTimer.current) window.clearTimeout(cleanTimer.current);
            cleanTimer.current = window.setTimeout(() => setCleanConfirm(false), 3000);
          }
        }}
        cleanConfirm={cleanConfirm}
        restoring={restoring}
      />

      {/* 右侧主视窗内容区 (弹性自适应 + 独立滚动) */}
      <main className="relative flex-1 h-screen overflow-y-auto p-6 z-10 scrollbar-thin">
        {/* TAB 1: 本地 Mod 工作站 */}
        {activeTab === "local" ? (
          <div className="max-w-7xl mx-auto space-y-5 pb-12">
            {/* 顶部工具栏: 搜索 + 排序 + 视图切换 + 批量 + 全开全关 */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
              {/* 搜索框 */}
              <div className="relative min-w-[240px] max-w-md flex-1">
                <Search className="absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  placeholder="搜索已安装 Mod 名称 / 作者 / 描述..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-2 pl-9 pr-4 text-xs text-slate-100 placeholder-zinc-500 outline-none backdrop-blur-md transition focus:border-cyan-400/50 focus:bg-white/[0.06]"
                />
              </div>

              <div className="flex items-center gap-2">
                {/* 多维排序下拉 */}
                <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs text-zinc-400">
                  <ArrowUpDown className="h-3 w-3 text-cyan-400" />
                  <select
                    value={sortOption}
                    onChange={(e) => {
                      playClickSound();
                      setSortOption(e.target.value as SortOption);
                    }}
                    className="bg-transparent text-xs text-zinc-200 outline-none cursor-pointer"
                  >
                    <option value="default" className="bg-[#0a0f1d]">默认顺序</option>
                    <option value="name-asc" className="bg-[#0a0f1d]">名称 A-Z</option>
                    <option value="name-desc" className="bg-[#0a0f1d]">名称 Z-A</option>
                    <option value="size-desc" className="bg-[#0a0f1d]">文件体积</option>
                    <option value="status" className="bg-[#0a0f1d]">已启用优先</option>
                    <option value="category" className="bg-[#0a0f1d]">按分类归类</option>
                  </select>
                </div>

                {/* 视图模式切换 */}
                <div className="flex items-center rounded-xl border border-white/10 bg-black/40 p-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      playClickSound();
                      handleViewModeChange("card");
                    }}
                    title="卡片网格视图"
                    className={`flex h-7 w-7 items-center justify-center rounded-lg transition active:scale-95 ${
                      viewMode === "card"
                        ? "bg-cyan-500/20 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.25)]"
                        : "text-zinc-500 hover:text-zinc-200"
                    }`}
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      playClickSound();
                      handleViewModeChange("compact");
                    }}
                    title="紧凑表格视图"
                    className={`flex h-7 w-7 items-center justify-center rounded-lg transition active:scale-95 ${
                      viewMode === "compact"
                        ? "bg-cyan-500/20 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.25)]"
                        : "text-zinc-500 hover:text-zinc-200"
                    }`}
                  >
                    <List className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* 批量模式 */}
                <button
                  type="button"
                  onClick={() => {
                    playClickSound();
                    if (batchMode) exitBatch();
                    else {
                      setBatchMode(true);
                      setDragging(false);
                    }
                  }}
                  disabled={mods.length === 0}
                  title={batchMode ? "退出批量模式" : "进入批量管理"}
                  className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition active:scale-95 disabled:opacity-30 ${
                    batchMode
                      ? "border-cyan-400/50 bg-cyan-400/15 text-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.25)]"
                      : "border-white/10 bg-white/[0.03] text-zinc-300 hover:border-cyan-400/40 hover:text-cyan-300"
                  }`}
                >
                  {batchMode ? <MousePointerClick className="h-3.5 w-3.5" /> : <CheckSquare className="h-3.5 w-3.5" />}
                  {batchMode ? "退出批量" : "批量"}
                </button>

                {/* 刷新 */}
                <button
                  type="button"
                  onClick={() => {
                    playClickSound();
                    void scan(gamePath);
                  }}
                  title="刷新列表"
                  disabled={!gamePath || isRefreshing}
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-zinc-400 transition hover:bg-white/10 hover:text-white active:scale-95 disabled:opacity-40"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin text-cyan-400" : ""}`} />
                </button>

                {/* 全开 / 全关 */}
                <button
                  type="button"
                  onClick={() => void toggleAll(true)}
                  disabled={!gamePath || mods.length === 0}
                  className="flex items-center gap-1 rounded-xl border border-emerald-900/40 bg-emerald-950/30 px-2.5 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-900/50 transition active:scale-95 disabled:opacity-30"
                >
                  <Power className="h-3.5 w-3.5" />
                  全开
                </button>
                <button
                  type="button"
                  onClick={() => void toggleAll(false)}
                  disabled={!gamePath || mods.length === 0}
                  className="flex items-center gap-1 rounded-xl border border-rose-900/40 bg-rose-950/30 px-2.5 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-900/50 transition active:scale-95 disabled:opacity-30"
                >
                  <PowerOff className="h-3.5 w-3.5" />
                  全关
                </button>
              </div>
            </div>

            {/* 分类筛选横条 */}
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-zinc-500">
                <Tags className="h-3.5 w-3.5 text-cyan-400" />
                分类筛选
              </div>
              <CategoryTabs
                presets={PRESET_CATEGORIES}
                customCategories={customCategories}
                selected={selectedCategory}
                onSelect={(c) => {
                  playClickSound();
                  setSelectedCategory(c);
                }}
                onAdd={(name) => void addCategory(name)}
                onRename={(o, n) => void renameCategory(o, n)}
                onDelete={(name) => void deleteCategory(name)}
              />
            </div>

            {/* 拖拽上传区 */}
            <DropZone
              state={installState}
              message={installMessage}
              onFile={handleFile}
              onPickZip={pickZip}
            />

            {/* Mod 列表展示区 */}
            {mods.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] py-20 text-center backdrop-blur-sm">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.04] text-zinc-600 mb-2.5">
                  <Layers className="h-6 w-6" />
                </div>
                <p className="text-xs font-medium text-zinc-400">当前没有检测到已安装的 Mod</p>
                <p className="text-[11px] text-zinc-600 mt-1">
                  点击左侧「社区在线市场」浏览安装海量 Mod，或将 Zip 压缩包拖入上方区域
                </p>
              </div>
            ) : filteredMods.length === 0 ? (
              <div className="py-12 text-center text-xs text-zinc-500">
                {selectedCategory !== "全部"
                  ? `「${selectedCategory}」分类下暂无 Mod`
                  : `没有找到匹配 " ${debouncedQuery} " 的 Mod`}
              </div>
            ) : (
              <div
                className={
                  viewMode === "card"
                    ? "grid gap-3 grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3"
                    : "grid gap-1.5"
                }
                onMouseDown={() => batchMode && setDragging(true)}
                onMouseUp={() => setDragging(false)}
                onMouseLeave={() => setDragging(false)}
              >
                {filteredMods.map((mod) => {
                  const updateInfo = updatesMap.get(mod.folderName.toLowerCase()) || updatesMap.get(mod.name.toLowerCase());
                  const conflictWarning = conflictsMap.get(mod.folderName.toLowerCase());

                  return viewMode === "card" ? (
                    <ModCard
                      key={mod.folderName}
                      mod={mod}
                      category={categoryOf(mod)}
                      categories={customCategories}
                      isToggling={togglingFolders.has(mod.folderName)}
                      selectionMode={batchMode}
                      selected={selectedMods.has(mod.folderName)}
                      updateInfo={updateInfo}
                      conflictWarning={conflictWarning}
                      onToggle={(m) => void toggleMod(m)}
                      onCategoryChange={(m, c) => void changeCategory(m, c)}
                      onSelect={(m, shift) => toggleSelect(m.folderName, shift)}
                      onDragHover={(m) => dragSelect(m.folderName)}
                      onOpenFolder={(m) => void handleOpenModFolder(m)}
                      onOpenConfig={(m) => void handleOpenModConfig(m)}
                      onDelete={(m) => void deleteMod(m)}
                      onUpdate={(m, u) => void handleUpdateMod(m, u)}
                      onContextMenu={handleContextMenu}
                    />
                  ) : (
                    <CompactModRow
                      key={mod.folderName}
                      mod={mod}
                      category={categoryOf(mod)}
                      isToggling={togglingFolders.has(mod.folderName)}
                      selectionMode={batchMode}
                      selected={selectedMods.has(mod.folderName)}
                      updateInfo={updateInfo}
                      conflictWarning={conflictWarning}
                      onToggle={(m) => void toggleMod(m)}
                      onSelect={(m, shift) => toggleSelect(m.folderName, shift)}
                      onDragHover={(m) => dragSelect(m.folderName)}
                      onOpenFolder={(m) => void handleOpenModFolder(m)}
                      onOpenConfig={(m) => void handleOpenModConfig(m)}
                      onDelete={(m) => void deleteMod(m)}
                      onUpdate={(m, u) => void handleUpdateMod(m, u)}
                      onContextMenu={handleContextMenu}
                    />
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* TAB 2: 社区在线市场 (带高性能分页) */
          <div className="max-w-7xl mx-auto">
            <CommunityMarket
              packages={communityMods}
              installedMods={mods}
              updates={updates}
              isLoading={marketLoading}
              onRefresh={() => void loadCommunityMods(true)}
              onInstall={handleInstallFromMarket}
              initialSearchQuery={marketSearchQuery}
            />
          </div>
        )}
      </main>

      {/* 导出整合包弹窗 */}
      {exportOpen && gamePath && (
        <ExportModal
          gamePath={gamePath}
          initialManifest={manifest}
          onClose={() => setExportOpen(false)}
        />
      )}

      {/* 导入确认弹窗 */}
      {importOpen && importPreview && (
        <ImportModal
          preview={importPreview}
          zipName={importZipPath.split(/[\\/]/).pop() || "压缩包"}
          existingPackName={manifest?.packName || undefined}
          onCancel={() => setImportOpen(false)}
          onConfirm={(mode) => void confirmImport(mode)}
        />
      )}

      {/* 冲突与依赖诊断弹窗 */}
      {conflictModalOpen && conflictReport && (
        <ConflictModal
          report={conflictReport}
          onClose={() => setConflictModalOpen(false)}
          onSearchInMarket={handleSearchInMarket}
          onOpenFolder={(relPath) => void handleOpenFolder(relPath)}
        />
      )}

      {/* 右键上下文菜单 */}
      {contextMenu && (
        <ContextMenu
          mod={contextMenu.mod}
          category={contextMenu.category}
          categories={customCategories}
          position={contextMenu.position}
          onClose={() => setContextMenu(null)}
          onToggle={(m) => void toggleMod(m)}
          onOpenFolder={(m) => void handleOpenModFolder(m)}
          onOpenConfig={(m) => void handleOpenModConfig(m)}
          onCategoryChange={(m, c) => void changeCategory(m, c)}
          onCopyName={(m) => {
            void navigator.clipboard.writeText(m.name);
            showToast("info", "已复制 Mod 名称", m.name);
          }}
          onDelete={(m) => void deleteMod(m)}
        />
      )}

      {/* 批量操作悬浮栏 */}
      {batchMode && selectedMods.size > 0 && (
        <BatchActionBar
          count={selectedMods.size}
          total={filteredMods.length}
          busy={batchBusy}
          categories={["未分类", ...customCategories]}
          onSelectAll={selectAll}
          onSetEnabled={(e) => void batchSetEnabled(e)}
          onMoveToCategory={(c) => void batchMoveToCategory(c)}
          onDelete={() => void batchDelete()}
          onExit={exitBatch}
        />
      )}
    </div>
  );
}

/** 全局提示卡片 */
function ToastItem({ toast, onClose }: { toast: ToastInfo; onClose: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const t1 = window.setTimeout(() => setLeaving(true), 3200);
    const t2 = window.setTimeout(() => onCloseRef.current(), 3600);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  const styles =
    toast.type === "success"
      ? "border-emerald-500/40 bg-emerald-950/85 text-emerald-100 shadow-[0_0_24px_rgba(16,185,129,0.25)]"
      : toast.type === "error"
      ? "border-rose-500/40 bg-rose-950/85 text-rose-100 shadow-[0_0_24px_rgba(244,63,94,0.25)]"
      : "border-cyan-500/40 bg-[#06121f]/90 text-cyan-100 shadow-[0_0_24px_rgba(6,182,212,0.25)]";

  return (
    <div
      className={`pointer-events-auto relative flex min-w-[300px] max-w-sm items-start gap-3 overflow-hidden rounded-xl border p-3.5 shadow-2xl backdrop-blur-xl ${
        leaving ? "toast-out" : "toast-in"
      } ${styles}`}
    >
      <div className="icon-pop mt-0.5 shrink-0">
        {toast.type === "success" && <CheckCircle2 className="h-5 w-5 text-emerald-400" />}
        {toast.type === "error" && <AlertCircle className="h-5 w-5 text-rose-400" />}
        {toast.type === "info" && <Info className="h-5 w-5 text-cyan-400" />}
      </div>
      <div className="min-w-0 flex-1">
        <h4 className="text-xs font-bold">{toast.title}</h4>
        {toast.message && <p className="mt-0.5 truncate text-[11px] opacity-80">{toast.message}</p>}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="shrink-0 text-zinc-500 transition hover:text-zinc-200 active:scale-90"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <div
        className={`absolute bottom-0 left-0 h-[2px] rounded-full ${
          toast.type === "success"
            ? "bg-emerald-400/80"
            : toast.type === "error"
            ? "bg-rose-400/80"
            : "bg-cyan-400/80"
        }`}
        style={{ animation: "toast-progress 3.2s linear forwards" }}
      />
    </div>
  );
}