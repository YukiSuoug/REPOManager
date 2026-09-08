import React, { useState } from "react";
import {
  Check,
  FolderArchive,
  Package,
  FolderOpen,
  FileCode2,
  Trash2,
  AlertTriangle,
  Loader2,
  Sparkles,
} from "lucide-react";
import type { ModCardInfo, ModUpdateInfo } from "../types";
import { categoryColor } from "../colors";

interface CompactModRowProps {
  mod: ModCardInfo;
  category: string;
  isToggling?: boolean;
  selectionMode?: boolean;
  selected?: boolean;
  updateInfo?: ModUpdateInfo;
  conflictWarning?: string;
  onToggle: (mod: ModCardInfo) => void;
  onSelect?: (mod: ModCardInfo, shift: boolean) => void;
  onDragHover?: (mod: ModCardInfo) => void;
  onOpenFolder: (mod: ModCardInfo) => void;
  onOpenConfig: (mod: ModCardInfo) => void;
  onDelete?: (mod: ModCardInfo) => void;
  onUpdate?: (mod: ModCardInfo, update: ModUpdateInfo) => void;
  onContextMenu: (e: React.MouseEvent, mod: ModCardInfo) => void;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes === 0) return "--";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function CompactModRow({
  mod,
  category,
  isToggling = false,
  selectionMode = false,
  selected = false,
  updateInfo,
  conflictWarning,
  onToggle,
  onSelect,
  onDragHover,
  onOpenFolder,
  onOpenConfig,
  onDelete,
  onUpdate,
  onContextMenu,
}: CompactModRowProps) {
  const isEnabled = mod.enabled;
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const color = categoryColor(category);

  return (
    <div
      onContextMenu={(e) => onContextMenu(e, mod)}
      onClick={selectionMode ? (e) => onSelect?.(mod, e.shiftKey) : undefined}
      onMouseEnter={selectionMode ? () => onDragHover?.(mod) : undefined}
      className={`group flex items-center justify-between gap-3 rounded-xl border px-3 py-2 transition-all duration-150 ${
        selectionMode && selected
          ? "border-emerald-400/50 bg-emerald-400/[0.07] shadow-[0_0_15px_rgba(52,211,153,0.12)]"
          : isEnabled
          ? "border-white/10 bg-white/[0.02] hover:border-emerald-400/30 hover:bg-white/[0.04]"
          : "border-white/5 bg-black/20 opacity-45 grayscale hover:opacity-70"
      } ${selectionMode ? "cursor-pointer" : ""}`}
    >
      {/* 左侧:复选框 + 图标 + 名称 + 版本 */}
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        {selectionMode && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelect?.(mod, e.shiftKey);
            }}
            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-all active:scale-90 ${
              selected
                ? "border-emerald-400 bg-emerald-400 text-zinc-950 shadow-[0_0_8px_rgba(52,211,153,0.5)]"
                : "border-white/30 hover:border-emerald-400/70"
            }`}
          >
            {selected && <Check className="h-3 w-3 animate-[checkpop_0.15s_ease-out]" />}
          </button>
        )}

        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03]">
          {mod.iconBase64 ? (
            <img
              src={mod.iconBase64.startsWith("data:") ? mod.iconBase64 : `data:image/png;base64,${mod.iconBase64}`}
              alt={mod.name}
              className="h-full w-full rounded-lg object-cover"
            />
          ) : mod.isFolder ? (
            <FolderArchive className="h-3.5 w-3.5 text-cyan-400" />
          ) : (
            <Package className="h-3.5 w-3.5 text-zinc-400" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-xs font-bold text-zinc-200 group-hover:text-cyan-300 transition-colors">
              {mod.name}
            </span>
            {mod.version && (
              <span className="shrink-0 rounded border border-cyan-400/25 bg-cyan-400/[0.06] px-1 font-mono text-[9px] text-cyan-300">
                v{mod.version}
              </span>
            )}
            {updateInfo && onUpdate && !selectionMode && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdate(mod, updateInfo);
                }}
                title={`可升级至最新版本 v${updateInfo.latestVersion}`}
                className="flex items-center gap-0.5 rounded border border-emerald-400/50 bg-emerald-400/15 px-1 py-0.2 font-mono text-[9px] font-bold text-emerald-300 shadow-[0_0_8px_rgba(52,211,153,0.25)] transition hover:bg-emerald-400/25 active:scale-95 animate-pulse"
              >
                <Sparkles className="h-2.5 w-2.5" />
                升级 v{updateInfo.latestVersion}
              </button>
            )}
            {conflictWarning && (
              <span
                title={conflictWarning}
                className="flex items-center gap-0.5 rounded border border-amber-500/40 bg-amber-500/15 px-1 py-0.2 text-[9px] font-medium text-amber-300"
              >
                <AlertTriangle className="h-2.5 w-2.5 text-amber-400" />
                {conflictWarning}
              </span>
            )}
          </div>
          <span className="block truncate font-mono text-[10px] text-zinc-500">
            {mod.folderName}
          </span>
        </div>
      </div>

      {/* 中间:分类 Badge + 文件大小 */}
      <div className="flex shrink-0 items-center gap-3">
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${color.bg} ${color.border} ${color.text}`}
        >
          {category}
        </span>
        <span className="w-16 text-right font-mono text-[10px] text-zinc-500">
          {formatBytes(mod.size)}
        </span>
      </div>

      {/* 右侧:快捷操作按钮 + 开关 */}
      <div className="flex shrink-0 items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => onOpenFolder(mod)}
          title="在资源管理器中定位"
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-transparent text-zinc-500 transition hover:border-white/15 hover:bg-white/5 hover:text-cyan-300 active:scale-90"
        >
          <FolderOpen className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={() => onOpenConfig(mod)}
          title={mod.hasConfig ? "打开 .cfg 配置文件" : "打开 BepInEx 配置目录"}
          className={`flex h-7 w-7 items-center justify-center rounded-lg border transition active:scale-90 ${
            mod.hasConfig
              ? "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-400 hover:border-emerald-500/40 hover:bg-emerald-500/15"
              : "border-transparent text-zinc-600 hover:border-white/15 hover:bg-white/5 hover:text-zinc-300"
          }`}
        >
          <FileCode2 className="h-3.5 w-3.5" />
        </button>

        {!selectionMode && onDelete && (
          <button
            type="button"
            title={confirmingDelete ? "再次点击确认删除" : "删除此 Mod"}
            onClick={() => {
              if (confirmingDelete) {
                onDelete(mod);
                setConfirmingDelete(false);
              } else {
                setConfirmingDelete(true);
                setTimeout(() => setConfirmingDelete(false), 3000);
              }
            }}
            className={`flex h-7 items-center gap-1 rounded-lg border px-1.5 text-[10px] font-bold transition active:scale-90 ${
              confirmingDelete
                ? "border-rose-400/60 bg-rose-500/20 text-rose-300"
                : "border-transparent text-zinc-600 hover:border-rose-400/30 hover:bg-rose-400/10 hover:text-rose-300"
            }`}
          >
            {confirmingDelete ? <AlertTriangle className="h-3 w-3" /> : <Trash2 className="h-3 w-3" />}
          </button>
        )}

        <button
          type="button"
          role="switch"
          aria-checked={isEnabled}
          disabled={isToggling || selectionMode}
          onClick={() => onToggle(mod)}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-all duration-200 focus:outline-none active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${
            isEnabled
              ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.35)]"
              : "bg-zinc-800 hover:bg-zinc-700"
          }`}
        >
          <span
            className={`pointer-events-none flex h-4 w-4 transform items-center justify-center rounded-full bg-white shadow-md transition duration-200 ${
              isEnabled ? "translate-x-4" : "translate-x-0"
            }`}
          >
            {isToggling && <Loader2 className="h-2.5 w-2.5 animate-spin text-zinc-900" />}
          </span>
        </button>
      </div>
    </div>
  );
}
