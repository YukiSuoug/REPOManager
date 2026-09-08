import { Folder, CheckCircle2, AlertCircle, FolderSearch } from "lucide-react";

interface Props {
  gamePath: string;
  onPick: () => void;
}

export default function GamePathBar({ gamePath, onPick }: Props) {
  const isFound = Boolean(gamePath);

  return (
    <div className="group relative flex items-center justify-between rounded-xl border border-slate-800/80 bg-slate-900/40 p-2.5 px-3.5 backdrop-blur-md transition-all hover:border-slate-700/80">
      <div className="flex min-w-0 items-center gap-3">
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
            isFound
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.1)]"
              : "border-rose-500/30 bg-rose-500/10 text-rose-400 animate-pulse"
          }`}
        >
          {isFound ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
              Target Repository
            </span>
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                isFound ? "bg-emerald-400" : "bg-rose-400"
              }`}
            />
          </div>
          <div className="truncate text-xs font-mono font-medium text-slate-300">
            {isFound ? (
              <span className="flex items-center gap-1">
                <Folder className="h-3 w-3 text-cyan-400/70 shrink-0 inline" />
                {gamePath}
              </span>
            ) : (
              <span className="text-rose-400">未自动检测到 R.E.P.O 目录，请手动定位</span>
            )}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onPick}
        className="ml-3 flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-700/60 bg-slate-800/80 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition-all hover:border-cyan-500/50 hover:bg-cyan-950/30 hover:text-cyan-300 active:scale-95"
      >
        <FolderSearch className="h-3.5 w-3.5" />
        {isFound ? "更换目录" : "手动选择"}
      </button>
    </div>
  );
}