import { useState } from "react";
import {
  Gamepad2,
  Building2,
  ShoppingBag,
  AlertTriangle,
  CheckCircle2,
  Folder,
  Puzzle,
  Settings,
  ArchiveRestore,
  Copy,
  Check,
  HardDrive,
  Play,
  Volume2,
  VolumeX,
  Share2,
  Sparkles,
  Loader2,
  FolderOpen,
  Archive,
  Trash2,
} from "lucide-react";
import type { ActiveTab, GameEnvStatus, ConflictReport } from "../types";
import { isAudioMuted, setAudioMuted, playClickSound } from "../utils/audio";

interface SidebarProps {
  gamePath: string;
  onPickFolder: () => void;
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  modsCount: number;
  enabledCount: number;
  updateCount: number;
  conflictReport: ConflictReport | null;
  onOpenConflictModal: () => void;
  envStatus: GameEnvStatus | null;
  onOpenFolder: (subpath?: string) => void;
  onCopyTeamList: () => void;
  onLaunchGame: () => void;
  launching: boolean;
  onExportPack: () => void;
  onRestoreClean: () => void;
  cleanConfirm: boolean;
  restoring: boolean;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 KB";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function Sidebar({
  gamePath,
  onPickFolder,
  activeTab,
  onTabChange,
  modsCount,
  enabledCount,
  updateCount,
  conflictReport,
  onOpenConflictModal,
  envStatus,
  onOpenFolder,
  onCopyTeamList,
  onLaunchGame,
  launching,
  onExportPack,
  onRestoreClean,
  cleanConfirm,
  restoring,
}: SidebarProps) {
  const [copiedFp, setCopiedFp] = useState(false);
  const [copiedList, setCopiedList] = useState(false);
  const [muted, setMuted] = useState(isAudioMuted());

  const fingerprint = envStatus?.fingerprint || "REPO-READY";
  const conflictCount = conflictReport
    ? conflictReport.missingDependencies.length + conflictReport.duplicateDlls.length
    : 0;

  function copyFingerprint() {
    playClickSound();
    void navigator.clipboard.writeText(fingerprint);
    setCopiedFp(true);
    setTimeout(() => setCopiedFp(false), 2000);
  }

  function handleCopyTeamList() {
    playClickSound();
    onCopyTeamList();
    setCopiedList(true);
    setTimeout(() => setCopiedList(false), 2500);
  }

  function toggleMute() {
    const next = !muted;
    setAudioMuted(next);
    setMuted(next);
    if (!next) playClickSound();
  }

  return (
    <aside className="relative flex h-screen w-72 shrink-0 flex-col justify-between border-r border-white/10 bg-[#070b14]/90 p-4 backdrop-blur-2xl select-none z-20">
      {/* 顶部品牌与路径 */}
      <div className="space-y-4">
        {/* App 标题 Logo */}
        <div className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/25 to-emerald-500/15 border border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.2)]">
            <Gamepad2 className="h-5 w-5 text-cyan-400" />
            <span className="absolute -bottom-0.5 -right-0.5 flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h1 className="text-sm font-black tracking-wider text-slate-100 uppercase truncate">
                R.E.P.O. <span className="text-cyan-400 font-medium text-xs">Mod Station</span>
              </h1>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="rounded bg-cyan-950/80 border border-cyan-500/30 px-1 py-0.1 font-mono text-[9px] font-bold text-cyan-300">
                PORTABLE
              </span>
              <span className="font-mono text-[10px] text-zinc-500">v{__APP_VERSION__}</span>
            </div>
          </div>
        </div>

        {/* 游戏安装路径紧凑栏 */}
        <div
          onClick={() => {
            playClickSound();
            onPickFolder();
          }}
          title={gamePath ? `当前游戏目录: ${gamePath} (点击切换)` : "点击选择游戏安装目录"}
          className="group flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-2.5 cursor-pointer transition hover:border-cyan-500/40 hover:bg-white/[0.04]"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 text-[10px] font-medium text-zinc-500">
              <FolderOpen className="h-3 w-3 text-cyan-400" />
              游戏目录
            </div>
            <p className="truncate font-mono text-[11px] text-zinc-300 mt-0.5">
              {gamePath ? gamePath.replace(/\\/g, "/") : "未指定目录 (点击选择)"}
            </p>
          </div>
          <span className="shrink-0 rounded border border-white/10 bg-white/5 px-1.5 py-1 text-[10px] text-zinc-400 group-hover:text-cyan-300">
            切换
          </span>
        </div>

        {/* 主导航菜单项 */}
        <nav className="space-y-1.5 pt-1">
          {/* 本地 Mod 工作站 */}
          <button
            type="button"
            onClick={() => {
              playClickSound();
              onTabChange("local");
            }}
            className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-xs font-bold transition-all active:scale-[0.98] ${
              activeTab === "local"
                ? "bg-gradient-to-r from-cyan-500/20 to-emerald-500/10 text-cyan-300 border border-cyan-500/40 shadow-[0_0_18px_rgba(6,182,212,0.15)]"
                : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200 border border-transparent"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Building2 className="h-4 w-4 text-cyan-400" />
              <span>本地 Mod 工作站</span>
            </div>
            <span className="rounded-full bg-white/10 px-2 py-0.5 font-mono text-[10px] text-zinc-300">
              {enabledCount}/{modsCount}
            </span>
          </button>

          {/* 社区在线市场 */}
          <button
            type="button"
            onClick={() => {
              playClickSound();
              onTabChange("market");
            }}
            className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-xs font-bold transition-all active:scale-[0.98] ${
              activeTab === "market"
                ? "bg-gradient-to-r from-cyan-500/20 to-emerald-500/10 text-cyan-300 border border-cyan-500/40 shadow-[0_0_18px_rgba(6,182,212,0.15)]"
                : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200 border border-transparent"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <ShoppingBag className="h-4 w-4 text-emerald-400" />
              <span>社区在线市场</span>
            </div>
            {updateCount > 0 ? (
              <span className="flex items-center gap-1 rounded-full bg-emerald-400/20 border border-emerald-400/40 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-300 animate-pulse">
                <Sparkles className="h-2.5 w-2.5" />
                {updateCount} 可更新
              </span>
            ) : (
              <span className="rounded-full bg-emerald-500/10 text-emerald-400/80 px-2 py-0.5 font-mono text-[10px]">
                HOT
              </span>
            )}
          </button>

          {/* 冲突与依赖体检 */}
          <button
            type="button"
            onClick={() => {
              playClickSound();
              onOpenConflictModal();
            }}
            className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-xs font-bold transition-all active:scale-[0.98] ${
              conflictCount > 0
                ? "border border-amber-500/40 bg-amber-500/15 text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.2)] animate-pulse"
                : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200 border border-transparent"
            }`}
          >
            <div className="flex items-center gap-2.5">
              {conflictCount > 0 ? (
                <AlertTriangle className="h-4 w-4 text-amber-400" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              )}
              <span>冲突与依赖体检</span>
            </div>
            {conflictCount > 0 ? (
              <span className="rounded-full bg-amber-400/20 px-2 py-0.5 font-mono text-[10px] text-amber-300">
                {conflictCount} 异常
              </span>
            ) : (
              <span className="text-[10px] text-emerald-400/80 font-mono">健康</span>
            )}
          </button>
        </nav>
      </div>

      {/* 中间/底部: 状态小部件 + 操作区 */}
      <div className="space-y-3 pt-2">
        {/* 开黑指纹与环境小部件 */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 space-y-2.5">
          {/* 指纹代码 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
              <span className="text-[10px] font-mono text-zinc-400 uppercase">联机指纹</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="font-mono text-xs font-black tracking-wider text-cyan-300">
                {fingerprint}
              </span>
              <button
                type="button"
                onClick={copyFingerprint}
                title="复制指纹代码"
                className="flex h-5 w-5 items-center justify-center rounded bg-white/5 text-cyan-400 hover:bg-white/10"
              >
                {copiedFp ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-2.5 w-2.5" />}
              </button>
            </div>
          </div>

          {/* 复制开黑配置按钮 */}
          <button
            type="button"
            onClick={handleCopyTeamList}
            disabled={!gamePath}
            title="复制已启用的 Mod 清单文本发送给队友"
            className={`flex w-full items-center justify-center gap-1.5 rounded-lg border py-1.5 text-[11px] font-bold transition active:scale-95 disabled:opacity-30 ${
              copiedList
                ? "border-emerald-400/50 bg-emerald-500/20 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.25)]"
                : "border-emerald-400/30 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/20"
            }`}
          >
            {copiedList ? <Check className="h-3 w-3" /> : <Share2 className="h-3 w-3" />}
            {copiedList ? "已复制开黑清单！" : "复制开黑配置清单"}
          </button>

          {/* 占用存储 & BepInEx 状态 */}
          <div className="flex items-center justify-between text-[10px] font-mono border-t border-white/5 pt-2 text-zinc-400">
            <span className="flex items-center gap-1">
              <HardDrive className="h-3 w-3 text-zinc-500" />
              {formatBytes(envStatus?.totalModsBytes ?? 0)}
            </span>
            <span
              className={
                envStatus?.isEnvHealthy ? "text-emerald-400" : "text-amber-400"
              }
            >
              {envStatus?.isEnvHealthy ? "● BepInEx 正常" : "● 前置待补齐"}
            </span>
          </div>
        </div>

        {/* 常用目录与整合包工具 */}
        <div className="grid grid-cols-4 gap-1.5">
          <button
            type="button"
            onClick={() => {
              playClickSound();
              onOpenFolder();
            }}
            disabled={!gamePath}
            title="打开游戏根目录"
            className="flex h-8 items-center justify-center rounded-xl border border-white/10 bg-white/[0.02] text-zinc-400 hover:border-cyan-500/40 hover:bg-white/[0.05] hover:text-cyan-300 transition active:scale-90 disabled:opacity-30"
          >
            <Folder className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              playClickSound();
              onOpenFolder("BepInEx/plugins");
            }}
            disabled={!gamePath}
            title="打开 plugins 插件目录"
            className="flex h-8 items-center justify-center rounded-xl border border-white/10 bg-white/[0.02] text-zinc-400 hover:border-emerald-500/40 hover:bg-white/[0.05] hover:text-emerald-300 transition active:scale-90 disabled:opacity-30"
          >
            <Puzzle className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              playClickSound();
              onOpenFolder("BepInEx/config");
            }}
            disabled={!gamePath}
            title="打开 config 配置文件目录"
            className="flex h-8 items-center justify-center rounded-xl border border-white/10 bg-white/[0.02] text-zinc-400 hover:border-amber-500/40 hover:bg-white/[0.05] hover:text-amber-300 transition active:scale-90 disabled:opacity-30"
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              playClickSound();
              onOpenFolder("__BACKUPS__");
            }}
            title="打开管理器便携备份目录"
            className="flex h-8 items-center justify-center rounded-xl border border-white/10 bg-white/[0.02] text-zinc-400 hover:border-violet-500/40 hover:bg-white/[0.05] hover:text-violet-300 transition active:scale-90"
          >
            <ArchiveRestore className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* 导出 & 纯净还原 & 音效开关 */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              playClickSound();
              onExportPack();
            }}
            disabled={!gamePath}
            title="导出整合包 Zip"
            className="flex-1 flex h-8 items-center justify-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-xs font-bold text-emerald-300 hover:bg-emerald-500/20 transition active:scale-95 disabled:opacity-30"
          >
            <Archive className="h-3.5 w-3.5" />
            导出
          </button>

          <button
            type="button"
            onClick={() => {
              playClickSound();
              onRestoreClean();
            }}
            disabled={!gamePath || restoring}
            title="删除 BepInEx 还原纯净游戏"
            className={`flex-1 flex h-8 items-center justify-center gap-1.5 rounded-xl border text-xs font-bold transition active:scale-95 disabled:opacity-30 ${
              cleanConfirm
                ? "border-rose-400/60 bg-rose-500/20 text-rose-300 animate-pulse"
                : "border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"
            }`}
          >
            {restoring ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            {restoring ? "还原中" : cleanConfirm ? "确认?" : "还原"}
          </button>

          <button
            type="button"
            onClick={toggleMute}
            title={muted ? "开启触感微音效" : "静音"}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border transition active:scale-90 ${
              muted
                ? "border-white/10 bg-white/[0.02] text-zinc-600 hover:text-zinc-300"
                : "border-cyan-500/30 bg-cyan-500/10 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.15)]"
            }`}
          >
            {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          </button>
        </div>

        {/* 战术启动游戏大按钮 */}
        <button
          type="button"
          onClick={() => {
            if (launching) return;
            onLaunchGame();
          }}
          disabled={launching}
          className="group relative flex w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-cyan-400 to-emerald-400 py-3 text-sm font-black text-zinc-950 shadow-[0_0_20px_rgba(6,182,212,0.3)] transition duration-150 hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(6,182,212,0.5)] active:scale-95 disabled:opacity-40"
        >
          {launching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4 fill-zinc-950 transition-transform group-hover:scale-110" />
          )}
          <span>{launching ? "正在唤起游戏..." : "启动 R.E.P.O."}</span>
        </button>
      </div>
    </aside>
  );
}
