import React from "react";
import {
  AlertTriangle,
  X,
  Puzzle,
  Copy,
  FolderOpen,
  ShoppingBag,
  CheckCircle2,
  FileWarning,
} from "lucide-react";
import type { ConflictReport } from "../types";
import { playClickSound } from "../utils/audio";

interface ConflictModalProps {
  report: ConflictReport;
  onClose: () => void;
  onSearchInMarket?: (depName: string) => void;
  onOpenFolder?: (path: string) => void;
}

export default function ConflictModal({
  report,
  onClose,
  onSearchInMarket,
  onOpenFolder,
}: ConflictModalProps) {
  const { missingDependencies, duplicateDlls } = report;
  const [copiedDep, setCopiedDep] = React.useState<string | null>(null);

  function copyText(text: string) {
    playClickSound();
    void navigator.clipboard.writeText(text);
    setCopiedDep(text);
    setTimeout(() => setCopiedDep(null), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md animate-[fade-in_0.2s_ease-out]">
      <div className="relative mx-4 flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-amber-500/30 bg-[#0b101d] shadow-2xl shadow-amber-950/40">
        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4 bg-amber-500/[0.04]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                Mod 冲突与依赖诊断报告
                {report.hasConflicts && (
                  <span className="rounded-full bg-amber-500/20 border border-amber-500/30 px-2 py-0.5 text-[11px] font-mono text-amber-300">
                    发现 {missingDependencies.length + duplicateDlls.length} 处异常
                  </span>
                )}
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                实时扫描已启用的 Mod 前置依赖完整性与同名 DLL 文件冲突
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              playClickSound();
              onClose();
            }}
            className="rounded-xl border border-white/10 p-2 text-zinc-400 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {!report.hasConflicts ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 mb-3">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <h4 className="text-sm font-bold text-emerald-300">所有前置依赖与文件状态正常！</h4>
              <p className="text-xs text-zinc-500 mt-1 max-w-sm">
                当前已启用的所有 Mod 依赖均已满足，且未发现重复覆盖的 DLL 动态链接库。
              </p>
            </div>
          ) : (
            <>
              {/* 1. 缺失的前置依赖 */}
              {missingDependencies.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Puzzle className="h-4 w-4 text-amber-400" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-amber-300">
                      缺失的前置依赖库 ({missingDependencies.length})
                    </h4>
                  </div>

                  <div className="grid gap-2.5">
                    {missingDependencies.map((dep, idx) => (
                      <div
                        key={`${dep.folderName}-${dep.requiredDependency}-${idx}`}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.03] p-3.5 transition hover:border-amber-500/40"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-amber-200">
                              {dep.dependencyName}
                            </span>
                            {dep.dependencyVersion && (
                              <span className="rounded border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.2 font-mono text-[10px] text-amber-300">
                                v{dep.dependencyVersion}
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-[11px] text-zinc-400">
                            由 <span className="font-medium text-zinc-200">「{dep.modName}」</span> 触发依赖要求 ({dep.requiredDependency})
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => copyText(dep.dependencyName)}
                            title="复制依赖名称"
                            className="flex h-8 items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 text-[11px] font-medium text-zinc-300 transition hover:bg-white/10 hover:text-white"
                          >
                            <Copy className="h-3 w-3" />
                            {copiedDep === dep.dependencyName ? "已复制" : "复制"}
                          </button>

                          {onSearchInMarket && (
                            <button
                              type="button"
                              onClick={() => {
                                playClickSound();
                                onSearchInMarket(dep.dependencyName);
                                onClose();
                              }}
                              className="flex h-8 items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-3 text-[11px] font-bold text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.2)] transition hover:bg-cyan-500/25 active:scale-95"
                            >
                              <ShoppingBag className="h-3.5 w-3.5" />
                              去市场搜索安装
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 2. 重复 DLL 冲突 */}
              {duplicateDlls.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <FileWarning className="h-4 w-4 text-rose-400" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-rose-300">
                      重复存在的同名 DLL ({duplicateDlls.length})
                    </h4>
                  </div>

                  <div className="grid gap-2.5">
                    {duplicateDlls.map((dup) => (
                      <div
                        key={dup.dllName}
                        className="rounded-xl border border-rose-500/20 bg-rose-500/[0.03] p-3.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs font-bold text-rose-200">
                            {dup.dllName}
                          </span>
                          <span className="text-[10px] text-rose-400/80 font-mono">
                            在 {dup.locations.length} 处路径中重复出现
                          </span>
                        </div>

                        <div className="mt-2 space-y-1">
                          {dup.locations.map((loc) => (
                            <div
                              key={loc}
                              className="flex items-center justify-between gap-2 rounded-lg bg-black/40 px-2.5 py-1 text-[11px] font-mono text-zinc-400"
                            >
                              <span className="truncate">{loc}</span>
                              {onOpenFolder && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    playClickSound();
                                    onOpenFolder(loc);
                                  }}
                                  title="在资源管理器中定位"
                                  className="flex shrink-0 items-center gap-1 text-[10px] text-cyan-400 hover:underline"
                                >
                                  <FolderOpen className="h-3 w-3" />
                                  定位
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* 底部 */}
        <div className="flex items-center justify-between border-t border-white/10 px-6 py-3.5 bg-black/40">
          <span className="text-[11px] text-zinc-500">
            💡 提示：若缺少核心依赖可能导致 Mod 无法生效，请优先补全缺失依赖。
          </span>
          <button
            type="button"
            onClick={() => {
              playClickSound();
              onClose();
            }}
            className="rounded-xl bg-white/10 px-4 py-2 text-xs font-bold text-zinc-200 transition hover:bg-white/15 active:scale-95"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
}
