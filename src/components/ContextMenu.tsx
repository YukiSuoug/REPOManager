import { useEffect, useRef } from "react";
import {
  FolderOpen,
  FileCode2,
  Power,
  PowerOff,
  Copy,
  Trash2,
  Tags,
} from "lucide-react";
import type { ModCardInfo } from "../types";
import { categoryColor } from "../colors";

export interface ContextMenuPosition {
  x: number;
  y: number;
}

interface ContextMenuProps {
  mod: ModCardInfo;
  category: string;
  categories: string[];
  position: ContextMenuPosition;
  onClose: () => void;
  onToggle: (mod: ModCardInfo) => void;
  onOpenFolder: (mod: ModCardInfo) => void;
  onOpenConfig: (mod: ModCardInfo) => void;
  onCategoryChange: (mod: ModCardInfo, category: string) => void;
  onCopyName: (mod: ModCardInfo) => void;
  onDelete: (mod: ModCardInfo) => void;
}

export default function ContextMenu({
  mod,
  category,
  categories,
  position,
  onClose,
  onToggle,
  onOpenFolder,
  onOpenConfig,
  onCategoryChange,
  onCopyName,
  onDelete,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // 边界保护 (避免菜单超出窗口下边缘/右边缘)
  const adjustedX = Math.min(position.x, window.innerWidth - 220);
  const adjustedY = Math.min(position.y, window.innerHeight - 280);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const allCategories = [...new Set([...categories.filter((c) => c !== "全部"), "未分类"])];

  return (
    <div
      ref={menuRef}
      style={{ left: adjustedX, top: adjustedY }}
      className="fixed z-[100] w-52 overflow-hidden rounded-xl border border-white/15 bg-[#0a0f1d]/95 p-1.5 shadow-2xl shadow-black/80 backdrop-blur-xl animate-[modal-in_0.15s_cubic-bezier(0.16,1,0.3,1)_both]"
    >
      {/* 头部微型标题 */}
      <div className="border-b border-white/10 px-2.5 py-1.5 mb-1">
        <p className="truncate text-xs font-bold text-zinc-100">{mod.name}</p>
        <p className="truncate font-mono text-[10px] text-zinc-500">{mod.folderName}</p>
      </div>

      <div className="flex flex-col gap-0.5">
        {/* 启停切换 */}
        <button
          type="button"
          onClick={() => {
            onToggle(mod);
            onClose();
          }}
          className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition ${
            mod.enabled
              ? "text-rose-300 hover:bg-rose-500/15"
              : "text-emerald-300 hover:bg-emerald-500/15"
          }`}
        >
          {mod.enabled ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
          {mod.enabled ? "禁用此 Mod" : "启用此 Mod"}
        </button>

        {/* 在文件夹中定位 */}
        <button
          type="button"
          onClick={() => {
            onOpenFolder(mod);
            onClose();
          }}
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs text-zinc-300 transition hover:bg-white/10 hover:text-cyan-300"
        >
          <FolderOpen className="h-3.5 w-3.5 text-cyan-400" />
          在资源管理器中定位
        </button>

        {/* 打开配置文件 */}
        <button
          type="button"
          onClick={() => {
            onOpenConfig(mod);
            onClose();
          }}
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs text-zinc-300 transition hover:bg-white/10 hover:text-emerald-300"
        >
          <FileCode2 className="h-3.5 w-3.5 text-emerald-400" />
          {mod.hasConfig ? "编辑 .cfg 配置文件" : "打开 BepInEx 配置目录"}
        </button>

        {/* 复制 Mod 名称 */}
        <button
          type="button"
          onClick={() => {
            onCopyName(mod);
            onClose();
          }}
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs text-zinc-300 transition hover:bg-white/10 hover:text-zinc-100"
        >
          <Copy className="h-3.5 w-3.5 text-zinc-400" />
          复制 Mod 名称
        </button>

        {/* 快速归类子列表 */}
        <div className="my-1 border-t border-white/10 pt-1">
          <div className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            <Tags className="h-3 w-3" />
            分配分类
          </div>
          <div className="grid grid-cols-2 gap-1 px-1">
            {allCategories.slice(0, 6).map((cat) => {
              const c = categoryColor(cat);
              const isCurrent = cat === category;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    onCategoryChange(mod, cat);
                    onClose();
                  }}
                  className={`truncate rounded px-1.5 py-1 text-left text-[11px] font-medium transition ${
                    isCurrent
                      ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                      : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                  }`}
                >
                  <span className={`inline-block h-1.5 w-1.5 rounded-full mr-1 ${c.bg} ${c.text}`} />
                  {cat}
                </button>
              );
            })}
          </div>
        </div>

        {/* 彻底删除 */}
        <div className="border-t border-white/10 pt-1 mt-0.5">
          <button
            type="button"
            onClick={() => {
              onDelete(mod);
              onClose();
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs text-rose-400 transition hover:bg-rose-500/20"
          >
            <Trash2 className="h-3.5 w-3.5" />
            彻底从硬盘删除
          </button>
        </div>
      </div>
    </div>
  );
}
