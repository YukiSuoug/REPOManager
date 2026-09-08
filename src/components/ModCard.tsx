import { useState, useRef, useEffect } from "react";
import {
  Check,
  Package,
  User,
  FolderArchive,
  Loader2,
  ChevronDown,
  Trash2,
  AlertTriangle,
  FolderOpen,
  FileCode2,
  Sparkles,
} from "lucide-react";
import type { ModCardInfo, ModUpdateInfo } from "../types";
import { categoryColor } from "../colors";

interface Props {
  mod: ModCardInfo;
  category: string;
  categories: string[];
  isToggling?: boolean;
  selectionMode?: boolean;
  selected?: boolean;
  updateInfo?: ModUpdateInfo;
  conflictWarning?: string;
  onToggle: (mod: ModCardInfo) => void;
  onCategoryChange: (mod: ModCardInfo, category: string) => void;
  onSelect?: (mod: ModCardInfo, shift: boolean) => void;
  onDragHover?: (mod: ModCardInfo) => void;
  onOpenFolder?: (mod: ModCardInfo) => void;
  onOpenConfig?: (mod: ModCardInfo) => void;
  onDelete?: (mod: ModCardInfo) => void;
  onUpdate?: (mod: ModCardInfo, update: ModUpdateInfo) => void;
  onContextMenu?: (e: React.MouseEvent, mod: ModCardInfo) => void;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes === 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function ModCard({
  mod,
  category,
  categories,
  isToggling = false,
  selectionMode = false,
  selected = false,
  updateInfo,
  conflictWarning,
  onToggle,
  onCategoryChange,
  onSelect,
  onDragHover,
  onOpenFolder,
  onOpenConfig,
  onDelete,
  onUpdate,
  onContextMenu,
}: Props) {
  const isEnabled = mod.enabled;
  const [imgError, setImgError] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const deleteTimer = useRef<number | null>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(
    () => () => {
      if (deleteTimer.current) window.clearTimeout(deleteTimer.current);
    },
    []
  );

  const getIconUrl = (base64: string | null) => {
    if (!base64 || imgError) return null;
    if (base64.startsWith("data:") || base64.startsWith("http") || base64.startsWith("asset:")) {
      return base64;
    }
    return `data:image/png;base64,${base64}`;
  };

  const iconUrl = getIconUrl(mod.iconBase64);
  const color = categoryColor(category);
  const options = [...new Set([...categories.filter((c) => c !== "全部"), "未分类"])];
  const formattedSize = formatBytes(mod.size);

  return (
    <div
      onContextMenu={onContextMenu ? (e) => onContextMenu(e, mod) : undefined}
      className={`group relative flex items-center justify-between rounded-xl border p-3 transition-all duration-200 ${
        selectionMode && selected
          ? "border-emerald-400/50 bg-emerald-400/[0.07] shadow-[0_0_20px_rgba(52,211,153,0.12)]"
          : isEnabled
          ? "border-white/10 bg-white/[0.03] shadow-sm hover:border-emerald-400/30 hover:bg-white/[0.05] hover:shadow-[0_0_20px_rgba(52,211,153,0.06)] active:scale-[0.995]"
          : "border-white/5 bg-white/[0.01] opacity-40 grayscale hover:opacity-65"
      } ${selectionMode ? "cursor-pointer" : ""}`}
      onClick={selectionMode ? (e) => onSelect?.(mod, e.shiftKey) : undefined}
      onMouseEnter={selectionMode ? () => onDragHover?.(mod) : undefined}
    >
      {/* 启用状态左侧发光指示线 */}
      {isEnabled && !selectionMode && (
        <div className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
      )}

      <div className="flex min-w-0 flex-1 items-center gap-3.5 pl-1.5">
        {/* 批量模式复选框 */}
        {selectionMode && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelect?.(mod, e.shiftKey);
            }}
            className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border-2 transition-all duration-150 active:scale-90 ${
              selected
                ? "border-emerald-400 bg-emerald-400 text-zinc-950 shadow-[0_0_10px_rgba(52,211,153,0.5)]"
                : "border-white/30 hover:border-emerald-400/70"
            }`}
          >
            {selected && (
              <Check className="h-3.5 w-3.5 animate-[checkpop_0.15s_ease-out]" />
            )}
          </button>
        )}

        {/* Mod 图标容器 */}
        <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] shadow-inner">
          {iconUrl ? (
            <img
              src={iconUrl}
              alt={mod.name}
              onError={() => setImgError(true)}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : mod.isFolder ? (
            <FolderArchive className="h-5 w-5 text-cyan-400" />
          ) : (
            <Package className="h-5 w-5 text-zinc-400" />
          )}
        </div>

        {/* Mod 详情 */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-xs font-bold tracking-tight text-zinc-100 transition-colors group-hover:text-cyan-300">
              {mod.name}
            </h3>
            {mod.version && (
              <span className="shrink-0 rounded border border-cyan-400/30 bg-cyan-400/10 px-1.5 font-mono text-[9px] font-semibold text-cyan-300">
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
                title={`可升级至最新版本 v${updateInfo.latestVersion} (点击自动更新)`}
                className="flex items-center gap-1 rounded-md border border-emerald-400/50 bg-emerald-400/15 px-1.5 py-0.5 font-mono text-[9px] font-bold text-emerald-300 shadow-[0_0_10px_rgba(52,211,153,0.25)] transition hover:bg-emerald-400/25 active:scale-95 animate-pulse"
              >
                <Sparkles className="h-2.5 w-2.5" />
                升级 v{updateInfo.latestVersion}
              </button>
            )}
            {conflictWarning && (
              <span
                title={conflictWarning}
                className="flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-medium text-amber-300"
              >
                <AlertTriangle className="h-2.5 w-2.5 text-amber-400" />
                {conflictWarning}
              </span>
            )}
            {formattedSize && (
              <span className="shrink-0 font-mono text-[10px] text-zinc-500">
                {formattedSize}
              </span>
            )}
          </div>

          <p className="mt-0.5 flex items-start gap-1">
            <span
              title={mod.description || undefined}
              className={`min-w-0 flex-1 text-[11px] text-zinc-400 ${
                descExpanded ? "line-clamp-none" : "line-clamp-2"
              }`}
            >
              {mod.description || "暂无描述信息"}
            </span>
            {(mod.description?.length ?? 0) > 60 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setDescExpanded((o) => !o);
                }}
                className={`flex shrink-0 items-center gap-0.5 pt-0.5 text-[10px] font-medium transition-colors ${
                  descExpanded ? "text-cyan-300" : "text-zinc-500 hover:text-cyan-300"
                }`}
              >
                {descExpanded ? "收起" : "展开"}
                <ChevronDown
                  className={`h-3 w-3 transition-transform duration-150 ${
                    descExpanded ? "rotate-180" : ""
                  }`}
                />
              </button>
            )}
          </p>

          <div className="mt-1 flex items-center gap-2 font-mono text-[10px] text-zinc-500">
            {mod.author && (
              <span className="flex items-center gap-1 text-zinc-400">
                <User className="h-2.5 w-2.5 text-zinc-500" />
                {mod.author}
              </span>
            )}
            <span className="text-zinc-700">·</span>
            <span className="max-w-[180px] truncate text-zinc-500">{mod.folderName}</span>
          </div>
        </div>
      </div>

      {/* 右侧交互区:快速动作 + 分类 + 删除 + 开关 */}
      <div className="flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
        {/* 快速直达按钮(定位文件夹 + 打开配置) */}
        {!selectionMode && (
          <div className="flex items-center gap-1">
            {onOpenFolder && (
              <button
                type="button"
                onClick={() => onOpenFolder(mod)}
                title="在资源管理器中定位"
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-transparent text-zinc-500 transition hover:border-white/15 hover:bg-white/5 hover:text-cyan-300 active:scale-90"
              >
                <FolderOpen className="h-3.5 w-3.5" />
              </button>
            )}

            {onOpenConfig && (
              <button
                type="button"
                onClick={() => onOpenConfig(mod)}
                title={mod.hasConfig ? "编辑 .cfg 配置文件" : "打开 BepInEx 配置目录"}
                className={`flex h-7 w-7 items-center justify-center rounded-lg border transition active:scale-90 ${
                  mod.hasConfig
                    ? "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-400 hover:border-emerald-500/40 hover:bg-emerald-500/15"
                    : "border-transparent text-zinc-600 hover:border-white/15 hover:bg-white/5 hover:text-zinc-300"
                }`}
              >
                <FileCode2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}

        {/* 分类 Badge + 快速切换菜单 */}
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            title="点击切换 Mod 分类"
            className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all duration-150 active:scale-95 ${color.bg} ${color.border} ${color.text} ${color.glow}`}
          >
            {category}
            <ChevronDown className={`h-3 w-3 opacity-70 transition-transform duration-150 ${menuOpen ? "rotate-180" : ""}`} />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full z-30 mt-1.5 w-40 overflow-hidden rounded-xl border border-white/15 bg-[#0d1322] shadow-2xl shadow-black/80">
              {options.map((opt) => {
                const c = categoryColor(opt);
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      onCategoryChange(mod, opt);
                      setMenuOpen(false);
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition hover:bg-white/5 ${
                      opt === category ? "text-emerald-300" : "text-zinc-300"
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${c.bg} ${c.text} ${c.border}`} />
                    {opt}
                    {opt === category && <span className="ml-auto text-emerald-400">✓</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 删除按钮(二次确认,批量模式下隐藏) */}
        {!selectionMode && onDelete && (
          <div>
            <button
              type="button"
              title={confirmingDelete ? "再次点击确认删除" : "删除此 Mod"}
              onClick={() => {
                if (confirmingDelete) {
                  if (deleteTimer.current) window.clearTimeout(deleteTimer.current);
                  onDelete(mod);
                  setConfirmingDelete(false);
                } else {
                  setConfirmingDelete(true);
                  deleteTimer.current = window.setTimeout(() => setConfirmingDelete(false), 3000);
                }
              }}
              className={`flex items-center gap-1 rounded-lg border px-2 py-1.5 text-[10px] font-bold transition-all duration-150 active:scale-90 ${
                confirmingDelete
                  ? "border-rose-400/60 bg-rose-500/20 text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.3)]"
                  : "border-transparent text-zinc-600 hover:border-rose-400/30 hover:bg-rose-400/10 hover:text-rose-300"
              }`}
            >
              {confirmingDelete ? (
                <>
                  <AlertTriangle className="h-3.5 w-3.5" />
                  确认?
                </>
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        )}

        {/* 科技感 Switch 开关 */}
        <div>
          <button
            type="button"
            role="switch"
            aria-checked={isEnabled}
            disabled={isToggling || selectionMode}
            onClick={() => onToggle(mod)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-all duration-200 ease-in-out focus:outline-none active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${
              isEnabled
                ? "bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.4)]"
                : "bg-zinc-800 hover:bg-zinc-700"
            }`}
          >
            <span
              className={`pointer-events-none flex h-5 w-5 transform items-center justify-center rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                isEnabled ? "translate-x-5" : "translate-x-0"
              }`}
            >
              {isToggling && <Loader2 className="h-3 w-3 animate-spin text-zinc-900" />}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}