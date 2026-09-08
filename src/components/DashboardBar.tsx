import { useState } from "react";
import {
  Folder,
  Puzzle,
  Settings,
  ArchiveRestore,
  Copy,
  Check,
  HardDrive,
  CheckCircle2,
  AlertTriangle,
  LayoutGrid,
  List,
  Volume2,
  VolumeX,
  Share2,
  Sparkles,
} from "lucide-react";
import type { GameEnvStatus, ViewMode, ConflictReport } from "../types";
import { isAudioMuted, setAudioMuted, playClickSound } from "../utils/audio";

interface DashboardBarProps {
  gamePath: string;
  envStatus: GameEnvStatus | null;
  conflictReport?: ConflictReport | null;
  updateCount?: number;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onOpenFolder: (subpath?: string) => void;
  onCopyTeamList: () => void;
  onOpenConflictModal?: () => void;
  onViewUpdates?: () => void;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "0 KB";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function DashboardBar({
  gamePath,
  envStatus,
  conflictReport,
  updateCount = 0,
  viewMode,
  onViewModeChange,
  onOpenFolder,
  onCopyTeamList,
  onOpenConflictModal,
  onViewUpdates,
}: DashboardBarProps) {
  const [copiedFp, setCopiedFp] = useState(false);
  const [copiedList, setCopiedList] = useState(false);
  const [muted, setMuted] = useState(isAudioMuted());

  const fingerprint = envStatus?.fingerprint || "REPO-READY";

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
    <div className="relative mb-4 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-black/30 p-3.5 backdrop-blur-xl shadow-xl shadow-black/40">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* 左侧:联机指纹 + 状态指标 */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* 开黑联机指纹胶囊 */}
          <div
            title="开黑时发给队友对齐配置，一致即可无缝联机"
            className="group flex items-center gap-1.5 rounded-xl border border-cyan-500/30 bg-cyan-950/40 py-1 pl-2.5 pr-1.5 shadow-[0_0_15px_rgba(6,182,212,0.12)] transition hover:border-cyan-400/60 hover:bg-cyan-950/60"
          >
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500" />
            </span>
            <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-400/80">
              联机指纹
            </span>
            <span className="font-mono text-xs font-black tracking-wider text-cyan-300">
              {fingerprint}
            </span>
            <button
              type="button"
              onClick={copyFingerprint}
              className="flex h-6 w-6 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400 transition hover:bg-cyan-400/20 active:scale-90"
              title="复制指纹代码"
            >
              {copiedFp ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3 w-3" />}
            </button>
          </div>

          {/* 一键复制开黑配置清单 */}
          <button
            type="button"
            onClick={handleCopyTeamList}
            disabled={!gamePath}
            title="一键复制当前启用的 Mod 清单文本，方便发到微信/QQ群"
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition-all active:scale-95 disabled:opacity-30 ${
              copiedList
                ? "border-emerald-400/50 bg-emerald-500/20 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.25)]"
                : "border-emerald-400/30 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/20 hover:border-emerald-400/50"
            }`}
          >
            {copiedList ? <Check className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5" />}
            {copiedList ? "已复制清单！" : "复制开黑配置"}
          </button>

          {/* 占用存储体积 */}
          <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.02] px-2.5 py-1 text-xs text-zinc-400">
            <HardDrive className="h-3.5 w-3.5 text-zinc-500" />
            <span>Mod 占用:</span>
            <span className="font-mono font-bold text-zinc-200">
              {formatBytes(envStatus?.totalModsBytes ?? 0)}
            </span>
          </div>

          {/* 环境健康状态指示 */}
          {envStatus && (
            <div
              className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-[11px] font-medium ${
                envStatus.isEnvHealthy
                  ? "border-emerald-500/20 bg-emerald-500/[0.05] text-emerald-300"
                  : "border-amber-500/30 bg-amber-500/[0.08] text-amber-300"
              }`}
            >
              {envStatus.isEnvHealthy ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  <span>BepInEx 正常注入</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 animate-pulse" />
                  <span>
                    {!envStatus.hasWinhttp ? "未检测到 winhttp.dll 引导" : "前置环境待完善"}
                  </span>
                </>
              )}
            </div>
          )}

          {/* 冲突与依赖诊断指示按钮 */}
          {conflictReport && (
            <button
              type="button"
              onClick={() => {
                playClickSound();
                onOpenConflictModal?.();
              }}
              title="点击查看 Mod 依赖与文件冲突体检详情"
              className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1 text-[11px] font-bold transition active:scale-95 ${
                conflictReport.hasConflicts
                  ? "border-amber-500/40 bg-amber-500/15 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.2)] hover:bg-amber-500/25 animate-pulse"
                  : "border-emerald-500/20 bg-emerald-500/[0.04] text-emerald-300 hover:bg-emerald-500/10"
              }`}
            >
              {conflictReport.hasConflicts ? (
                <>
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                  <span>
                    {conflictReport.missingDependencies.length + conflictReport.duplicateDlls.length} 处异常诊断
                  </span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  <span>依赖完整</span>
                </>
              )}
            </button>
          )}

          {/* 可更新 Mod 提示按钮 */}
          {updateCount > 0 && (
            <button
              type="button"
              onClick={() => {
                playClickSound();
                onViewUpdates?.();
              }}
              title="点击查看可更新 Mod"
              className="flex items-center gap-1.5 rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-bold text-emerald-300 shadow-[0_0_12px_rgba(52,211,153,0.2)] transition hover:bg-emerald-500/25 active:scale-95 animate-pulse"
            >
              <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
              <span>{updateCount} 个 Mod 可更新</span>
            </button>
          )}
        </div>

        {/* 右侧:常用目录一键直达 + 视图切换 + 音效开关 */}
        <div className="flex items-center gap-2">
          {/* 常用目录直达按钮群 */}
          <div className="flex items-center rounded-xl border border-white/10 bg-black/40 p-1">
            <button
              type="button"
              onClick={() => {
                playClickSound();
                onOpenFolder();
              }}
              disabled={!gamePath}
              title="打开游戏根目录"
              className="flex h-7 items-center gap-1.5 rounded-lg px-2 text-[11px] font-medium text-zinc-400 transition hover:bg-white/10 hover:text-cyan-300 active:scale-95 disabled:opacity-30"
            >
              <Folder className="h-3.5 w-3.5 text-cyan-400" />
              根目录
            </button>
            <div className="h-3.5 w-px bg-white/10 mx-0.5" />
            <button
              type="button"
              onClick={() => {
                playClickSound();
                onOpenFolder("BepInEx/plugins");
              }}
              disabled={!gamePath}
              title="打开 BepInEx/plugins 插件目录"
              className="flex h-7 items-center gap-1.5 rounded-lg px-2 text-[11px] font-medium text-zinc-400 transition hover:bg-white/10 hover:text-emerald-300 active:scale-95 disabled:opacity-30"
            >
              <Puzzle className="h-3.5 w-3.5 text-emerald-400" />
              Plugins
            </button>
            <div className="h-3.5 w-px bg-white/10 mx-0.5" />
            <button
              type="button"
              onClick={() => {
                playClickSound();
                onOpenFolder("BepInEx/config");
              }}
              disabled={!gamePath}
              title="打开 BepInEx/config 配置文件目录"
              className="flex h-7 items-center gap-1.5 rounded-lg px-2 text-[11px] font-medium text-zinc-400 transition hover:bg-white/10 hover:text-amber-300 active:scale-95 disabled:opacity-30"
            >
              <Settings className="h-3.5 w-3.5 text-amber-400" />
              Config
            </button>
            <div className="h-3.5 w-px bg-white/10 mx-0.5" />
            <button
              type="button"
              onClick={() => {
                playClickSound();
                onOpenFolder("__BACKUPS__");
              }}
              title="打开管理器便携备份目录"
              className="flex h-7 items-center gap-1.5 rounded-lg px-2 text-[11px] font-medium text-zinc-400 transition hover:bg-white/10 hover:text-violet-300 active:scale-95"
            >
              <ArchiveRestore className="h-3.5 w-3.5 text-violet-400" />
              备份
            </button>
          </div>

          {/* 视图模式切换 */}
          <div className="flex items-center rounded-xl border border-white/10 bg-black/40 p-1">
            <button
              type="button"
              onClick={() => {
                playClickSound();
                onViewModeChange("card");
              }}
              title="网格卡片视图"
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
                onViewModeChange("compact");
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

          {/* 音效开关 */}
          <button
            type="button"
            onClick={toggleMute}
            title={muted ? "开启触感音效" : "静音"}
            className={`flex h-8 w-8 items-center justify-center rounded-xl border transition active:scale-90 ${
              muted
                ? "border-white/10 bg-white/[0.02] text-zinc-600 hover:text-zinc-300"
                : "border-cyan-500/30 bg-cyan-500/10 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.15)]"
            }`}
          >
            {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
