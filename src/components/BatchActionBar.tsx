import { useEffect, useRef, useState } from "react";
import {
  CheckSquare,
  ChevronDown,
  FolderInput,
  Loader2,
  Power,
  PowerOff,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { categoryColor } from "../colors";

interface BatchActionBarProps {
  count: number;
  total: number;
  busy: boolean;
  categories: string[];
  onSelectAll: () => void;
  onSetEnabled: (enable: boolean) => void;
  onMoveToCategory: (category: string) => void;
  onDelete: () => void;
  onExit: () => void;
}

export default function BatchActionBar({
  count,
  total,
  busy,
  categories,
  onSelectAll,
  onSetEnabled,
  onMoveToCategory,
  onDelete,
  onExit,
}: BatchActionBarProps) {
  const [moveOpen, setMoveOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMoveOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const allSelected = count > 0 && count === total;

  function requestDelete() {
    if (confirmingDelete) {
      onDelete();
      setConfirmingDelete(false);
      return;
    }
    setConfirmingDelete(true);
    window.setTimeout(() => setConfirmingDelete(false), 3000);
  }

  const btnBase =
    "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex justify-center px-4">
      <div className="pointer-events-auto bar-in flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-black/70 px-4 py-3 shadow-[0_0_30px_rgba(52,211,153,0.15),0_-4px_30px_rgba(0,0,0,0.5)] backdrop-blur-xl">
        {/* 计数 */}
        <span className="mr-1 font-mono text-xs text-zinc-300">
          已选中 <span className="font-bold text-emerald-300">{count}</span> 项
        </span>

        <button
          type="button"
          onClick={onSelectAll}
          disabled={busy || total === 0}
          className={`${btnBase} border-white/10 bg-white/[0.03] text-zinc-300 hover:border-white/25 hover:text-zinc-100`}
        >
          {allSelected ? <Square className="h-3.5 w-3.5" /> : <CheckSquare className="h-3.5 w-3.5" />}
          {allSelected ? "取消全选" : "全选"}
        </button>

        <div className="h-5 w-px bg-white/10" />

        <button
          type="button"
          onClick={() => onSetEnabled(true)}
          disabled={busy || count === 0}
          className={`${btnBase} border-emerald-400/30 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/20`}
        >
          <Power className="h-3.5 w-3.5" />
          批量启用
        </button>
        <button
          type="button"
          onClick={() => onSetEnabled(false)}
          disabled={busy || count === 0}
          className={`${btnBase} border-rose-400/30 bg-rose-400/10 text-rose-300 hover:bg-rose-400/20`}
        >
          <PowerOff className="h-3.5 w-3.5" />
          批量禁用
        </button>

        <div className="h-5 w-px bg-white/10" />

        {/* 移动到分类 */}
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMoveOpen((o) => !o)}
            disabled={busy || count === 0}
            className={`${btnBase} border-cyan-400/30 bg-cyan-400/10 text-cyan-300 hover:bg-cyan-400/20`}
          >
            <FolderInput className="h-3.5 w-3.5" />
            移动到分类
            <ChevronDown className={`h-3 w-3 transition-transform duration-150 ${moveOpen ? "rotate-180" : ""}`} />
          </button>
          {moveOpen && (
            <div className="absolute bottom-full left-0 mb-1.5 max-h-64 w-44 overflow-y-auto rounded-lg border border-white/10 bg-[#0d1322]/95 py-1 shadow-2xl shadow-black/50 backdrop-blur-xl">
              {categories.map((opt) => {
                const c = categoryColor(opt);
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      onMoveToCategory(opt);
                      setMoveOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-zinc-300 transition hover:bg-white/5"
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${c.bg} ${c.text} ${c.border}`} />
                    {opt}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 批量删除 */}
        <button
          type="button"
          onClick={requestDelete}
          disabled={busy || count === 0}
          className={`${btnBase} ${
            confirmingDelete
              ? "border-rose-400 bg-rose-500/20 font-bold text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.3)]"
              : "border-rose-400/30 bg-rose-400/10 text-rose-300 hover:bg-rose-400/20"
          }`}
        >
          <Trash2 className="h-3.5 w-3.5" />
          {confirmingDelete ? "确认删除?" : "批量删除"}
        </button>

        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-300" />}

        <div className="h-5 w-px bg-white/10" />

        <button
          type="button"
          onClick={onExit}
          className={`${btnBase} border-white/10 bg-white/[0.03] text-zinc-400 hover:border-white/25 hover:text-zinc-100`}
        >
          <X className="h-3.5 w-3.5" />
          退出批量
        </button>
      </div>
    </div>
  );
}