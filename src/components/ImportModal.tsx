import { useState } from "react";
import {
  AlertTriangle,
  Archive,
  FileArchive,
  FolderOpen,
  PackageCheck,
  RefreshCcw,
  X,
} from "lucide-react";
import type { ImportPreview } from "../types";

type ImportMode = "merge" | "replace";

interface Props {
  preview: ImportPreview;
  zipName: string;
  /** 当前游戏目录已安装的整合包名(用于覆盖提示) */
  existingPackName?: string;
  onCancel: () => void;
  onConfirm: (mode: ImportMode) => void;
}

/** 导入确认弹窗:展示包信息与 Mod 列表,选择合并覆盖或删除 BepInEx 后重装 */
export default function ImportModal({
  preview,
  zipName,
  existingPackName,
  onCancel,
  onConfirm,
}: Props) {
  const [mode, setMode] = useState<ImportMode>("merge");
  const [leaving, setLeaving] = useState(false);

  const close = () => {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(onCancel, 180);
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm ${
        leaving ? "overlay-out" : "overlay-in"
      }`}
      onClick={close}
    >
      <div
        className={`flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0d1322]/80 shadow-2xl shadow-black/50 backdrop-blur-2xl ${
          leaving ? "modal-out" : "modal-in"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-zinc-100">
            <Archive className="h-4 w-4 text-cyan-400" />
            导入整合包
            <span className="max-w-[180px] truncate rounded border border-cyan-400/30 bg-cyan-400/10 px-1.5 font-mono text-[9px] font-semibold text-cyan-300">
              {zipName}
            </span>
          </h2>
          <button
            type="button"
            onClick={close}
            className="rounded-lg p-1.5 text-zinc-500 transition-all hover:bg-white/5 hover:text-zinc-200 active:scale-90"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          {/* 包信息 */}
          <div className="px-6 py-4">
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-base font-bold text-zinc-100">
                  {preview.packName || "未命名整合包"}
                </h3>
                {preview.version && (
                  <span className="shrink-0 rounded border border-cyan-400/30 bg-cyan-400/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-cyan-300">
                    v{preview.version}
                  </span>
                )}
              </div>
              {preview.author && (
                <p className="mt-1 text-[11px] text-zinc-400">作者: {preview.author}</p>
              )}
              {preview.description && (
                <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-zinc-500">
                  {preview.description}
                </p>
              )}
              {preview.categories.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {preview.categories.map((c) => (
                    <span
                      key={c}
                      className="rounded-full border border-cyan-400/25 bg-cyan-400/[0.06] px-2 py-0.5 text-[10px] font-medium text-cyan-300"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Mod 列表 */}
          <div className="px-6">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-medium text-zinc-500">
                <PackageCheck className="mr-1 inline h-3.5 w-3.5 text-cyan-400" />
                包内包含 {preview.mods.length} 个 Mod / 插件
              </span>
              <span className="font-mono text-[10px] text-zinc-600">
                共 {preview.totalFiles} 个文件
              </span>
            </div>
            <div className="max-h-44 overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-2">
              {preview.mods.length === 0 ? (
                <p className="py-4 text-center text-xs text-zinc-600">
                  未识别到 plugins 目录下的 Mod(可能是单插件或整合子包)
                </p>
              ) : (
                <ul className="divide-y divide-white/[0.04]">
                  {preview.mods.map((m) => (
                    <li
                      key={m.name}
                      className="flex items-center gap-2 px-2 py-1.5 text-xs text-zinc-300"
                    >
                      {m.isFolder ? (
                        <FolderOpen className="h-3.5 w-3.5 shrink-0 text-cyan-400/70" />
                      ) : (
                        <FileArchive className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                      )}
                      <span className="truncate font-mono">{m.name}</span>
                      <span className="ml-auto shrink-0 text-[10px] text-zinc-600">
                        {m.isFolder ? "Mod 文件夹" : "单文件插件"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* 安装方式选择 */}
          <div className="px-6 py-4">
            <p className="mb-2 text-[11px] font-medium text-zinc-500">选择安装方式</p>
            <div className="grid grid-cols-1 gap-2.5">
              <button
                type="button"
                onClick={() => setMode("merge")}
                className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition-all duration-150 ${
                  mode === "merge"
                    ? "border-emerald-400/50 bg-emerald-400/[0.07] shadow-[0_0_15px_rgba(52,211,153,0.12)]"
                    : "border-white/10 bg-white/[0.02] hover:border-white/25"
                }`}
              >
                <span
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                    mode === "merge"
                      ? "border-emerald-400 bg-emerald-400 text-zinc-950"
                      : "border-white/30"
                  }`}
                >
                  {mode === "merge" && <span className="h-1.5 w-1.5 rounded-full bg-zinc-950" />}
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-zinc-100">
                    <PackageCheck className="h-3.5 w-3.5 text-emerald-400" />
                    合并覆盖
                  </span>
                  <span className="mt-1 block text-[11px] leading-relaxed text-zinc-500">
                    保留游戏目录现有的 Mod,新增内容合并进去,同名文件会被覆盖
                  </span>
                  {existingPackName && (
                    <span className="mt-1.5 flex items-start gap-1 rounded-lg border border-amber-400/25 bg-amber-400/[0.06] px-2 py-1 text-[10px] leading-relaxed text-amber-300/90">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-400" />
                      当前游戏已有整合包「{existingPackName}」,合并导入将覆盖同名 Mod
                      与配置文件
                    </span>
                  )}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setMode("replace")}
                className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition-all duration-150 ${
                  mode === "replace"
                    ? "border-rose-400/50 bg-rose-400/[0.07] shadow-[0_0_15px_rgba(244,63,94,0.12)]"
                    : "border-white/10 bg-white/[0.02] hover:border-white/25"
                }`}
              >
                <span
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                    mode === "replace"
                      ? "border-rose-400 bg-rose-400 text-zinc-950"
                      : "border-white/30"
                  }`}
                >
                  {mode === "replace" && <span className="h-1.5 w-1.5 rounded-full bg-zinc-950" />}
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-zinc-100">
                    <RefreshCcw className="h-3.5 w-3.5 text-rose-400" />
                    删除 BepInEx 后重新安装
                  </span>
                  <span className="mt-1 flex items-start gap-1 text-[11px] leading-relaxed text-zinc-500">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-rose-400/80" />
                    先删除游戏目录现有 BepInEx 文件夹,再完整安装该整合包。
                    适合纯净安装,现有 Mod 将全部移除
                  </span>
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* 底部操作栏 */}
        <footer className="flex items-center justify-end gap-2 border-t border-white/10 px-6 py-4">
          <button
            type="button"
            onClick={close}
            className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-medium text-zinc-300 transition-all hover:border-white/25 hover:text-zinc-100 active:scale-95"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => {
              setLeaving(true);
              window.setTimeout(() => onConfirm(mode), 180);
            }}
            className={`flex items-center gap-1.5 rounded-xl bg-gradient-to-r px-5 py-2 text-xs font-bold text-zinc-950 shadow-[0_0_20px_rgba(6,182,212,0.25)] transition-all hover:scale-[1.02] active:scale-95 ${
              mode === "replace"
                ? "from-rose-500 to-orange-500 shadow-[0_0_20px_rgba(244,63,94,0.3)]"
                : "from-cyan-500 to-emerald-500"
            }`}
          >
            {mode === "replace" ? (
              <>
                <RefreshCcw className="h-4 w-4" />
                删除并导入
              </>
            ) : (
              <>
                <Archive className="h-4 w-4" />
                合并导入
              </>
            )}
          </button>
        </footer>
      </div>
    </div>
  );
}