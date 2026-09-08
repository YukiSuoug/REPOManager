import { useEffect, useRef, useState } from "react";
import { Check, MoreHorizontal, Pencil, Plus, Trash2, X } from "lucide-react";

export const PRESET_CATEGORIES = ["全部", "已启用", "已禁用"];

interface CategoryTabsProps {
  /** 预设系统分类(固定,不可增删改) */
  presets: string[];
  /** 用户自定义分类 */
  customCategories: string[];
  selected: string;
  onSelect: (category: string) => void;
  onAdd: (name: string) => void;
  onRename: (oldName: string, newName: string) => void;
  onDelete: (name: string) => void;
}

export default function CategoryTabs({
  presets,
  customCategories,
  selected,
  onSelect,
  onAdd,
  onRename,
  onDelete,
}: CategoryTabsProps) {
  const [adding, setAdding] = useState(false);
  const [input, setInput] = useState("");
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭菜单
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setMenuFor(null);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function confirmAdd() {
    const name = input.trim();
    if (name) onAdd(name);
    setInput("");
    setAdding(false);
  }

  function startRename(name: string) {
    setMenuFor(null);
    setEditing(name);
    setEditValue(name);
  }

  function confirmRename() {
    const name = editValue.trim();
    if (name) onRename(editing as string, name);
    setEditing(null);
    setEditValue("");
  }

  function requestDelete(name: string) {
    if (confirmingDelete === name) {
      setConfirmingDelete(null);
      setMenuFor(null);
      onDelete(name);
      return;
    }
    setConfirmingDelete(name);
    window.setTimeout(() => {
      setConfirmingDelete(null);
    }, 3000);
  }

  function renderTab(name: string, custom: boolean) {
    const active = name === selected;
    return (
      <div key={name} className="relative group inline-flex items-center">
        <button
          type="button"
          onClick={() => onSelect(name)}
          className={`rounded-full border px-3 py-1 text-xs transition active:scale-95 ${
            active
              ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300 shadow-[0_0_12px_rgba(52,211,153,0.25)] font-bold"
              : "border-white/10 bg-white/[0.03] text-zinc-400 hover:border-white/25 hover:text-zinc-200"
          }`}
        >
          {name}
        </button>

        {custom && (
          <div className="relative ml-0.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMenuFor(menuFor === name ? null : name);
              }}
              title="分类管理"
              className={`flex h-5 w-5 items-center justify-center rounded-full border bg-[#0d1322] transition active:scale-90 ${
                menuFor === name
                  ? "border-cyan-400/40 bg-cyan-400/15 text-cyan-300 opacity-100"
                  : "border-white/10 text-zinc-500 opacity-0 group-hover:opacity-100 hover:border-white/30 hover:text-zinc-200"
              }`}
            >
              <MoreHorizontal className="h-3 w-3" />
            </button>

            {menuFor === name && (
              <div className="absolute left-0 top-full z-40 mt-1 w-28 overflow-hidden rounded-xl border border-white/15 bg-[#0d1322] p-1 shadow-2xl backdrop-blur-xl">
                <button
                  type="button"
                  onClick={() => startRename(name)}
                  className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left text-xs text-zinc-300 hover:bg-white/5 hover:text-cyan-300"
                >
                  <Pencil className="h-3 w-3" />
                  重命名
                </button>
                <button
                  type="button"
                  onClick={() => requestDelete(name)}
                  className={`flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left text-xs transition ${
                    confirmingDelete === name
                      ? "bg-rose-500/20 font-bold text-rose-300"
                      : "text-zinc-300 hover:bg-white/5 hover:text-rose-300"
                  }`}
                >
                  <Trash2 className="h-3 w-3" />
                  {confirmingDelete === name ? "确认删除?" : "删除"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex flex-wrap items-center gap-1.5">
      {presets.map((name) => renderTab(name, false))}

      {customCategories.map((name) =>
        editing === name ? (
          <div key={name} className="inline-flex items-center gap-1">
            <input
              autoFocus
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmRename();
                if (e.key === "Escape") setEditing(null);
              }}
              onBlur={confirmRename}
              className="w-24 rounded-full border border-cyan-400/40 bg-cyan-400/10 px-2.5 py-0.5 text-xs text-cyan-200 outline-none"
            />
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={confirmRename}
              className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300"
            >
              <Check className="h-3 w-3" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setEditing(null)}
              className="flex h-5 w-5 items-center justify-center rounded-full bg-white/5 text-zinc-400"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          renderTab(name, true)
        )
      )}

      {adding ? (
        <div className="inline-flex items-center gap-1">
          <input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmAdd();
              if (e.key === "Escape") {
                setAdding(false);
                setInput("");
              }
            }}
            onBlur={confirmAdd}
            placeholder="新分类名"
            className="w-24 rounded-full border border-cyan-400/40 bg-cyan-400/10 px-2.5 py-0.5 text-xs text-cyan-200 outline-none placeholder:text-cyan-400/40"
          />
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={confirmAdd}
            className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300"
          >
            <Check className="h-3 w-3" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setAdding(false);
              setInput("");
            }}
            className="flex h-5 w-5 items-center justify-center rounded-full bg-white/5 text-zinc-400"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-white/20 px-2.5 py-1 text-xs text-zinc-500 hover:border-cyan-400/50 hover:text-cyan-300 transition active:scale-95"
        >
          <Plus className="h-3 w-3" />
          新建分类
        </button>
      )}
    </div>
  );
}