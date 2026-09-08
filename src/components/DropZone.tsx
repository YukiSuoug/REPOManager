import { useState, DragEvent } from "react";
import { UploadCloud, CheckCircle2, AlertCircle, Loader2, FileArchive } from "lucide-react";
import Burst from "./Burst";

interface Props {
  state: "idle" | "installing" | "success" | "error";
  message: string;
  onFile: (file: File) => void;
  onPickZip: () => void;
}

export default function DropZone({ state, message, onFile, onPickZip }: Props) {
  const [isDragOver, setIsDragOver] = useState(false);

  function handleDrag(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragOver(true);
    } else if (e.type === "dragleave") {
      setIsDragOver(false);
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFile(e.dataTransfer.files[0]);
    }
  }

  return (
    <div
      onDragEnter={handleDrag}
      onDragOver={handleDrag}
      onDragLeave={handleDrag}
      onDrop={handleDrop}
      onClick={state === "installing" ? undefined : onPickZip}
      className={`group relative flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed p-7 text-center transition-all duration-300 active:scale-[0.99] ${
        isDragOver
          ? "border-cyan-400 bg-cyan-950/20 shadow-[0_0_30px_rgba(6,182,212,0.2)] scale-[1.01]"
          : state === "error"
          ? "border-rose-500/40 bg-rose-950/10 hover:border-rose-500/60"
          : state === "success"
          ? "border-emerald-500/40 bg-emerald-950/10 hover:border-emerald-500/60"
          : "border-slate-800 bg-slate-900/30 hover:border-cyan-500/40 hover:bg-slate-900/50 hover:shadow-[0_0_25px_rgba(6,182,212,0.05)]"
      }`}
    >
      {/* 科技感微光扫描条 */}
      {isDragOver && (
        <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent animate-pulse" />
      )}

      {state === "installing" ? (
        <div className="flex flex-col items-center py-1">
          <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
          <p className="mt-3 text-xs font-bold tracking-wide text-cyan-300 animate-pulse">
            {message || "正在解压并部署 BepInEx 架构与插件..."}
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5">请稍候，完成后会自动刷新列表</p>
        </div>
      ) : state === "success" ? (
        <div className="flex flex-col items-center py-1">
          <div className="success-ring relative flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
            <CheckCircle2 className="check-pop h-6 w-6" />
            <Burst />
          </div>
          <p className="mt-3 text-xs font-bold text-emerald-300">{message || "Mod 安装成功！"}</p>
          <p className="text-[10px] text-slate-500 mt-0.5">可继续拖入其他 Mod 压缩包进行覆盖更新</p>
        </div>
      ) : state === "error" ? (
        <div className="flex flex-col items-center py-1">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/30">
            <AlertCircle className="h-6 w-6" />
          </div>
          <p className="mt-3 text-xs font-bold text-rose-300">安装失败: {message}</p>
          <p className="text-[10px] text-slate-500 mt-0.5">点击重试或重新选择有效的 Zip 文件</p>
        </div>
      ) : (
        <div className="flex flex-col items-center">
          <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-800/80 text-slate-300 border border-slate-700/60 transition-all duration-300 group-hover:scale-110 group-hover:border-cyan-500/50 group-hover:bg-cyan-950/30 group-hover:text-cyan-300">
            <UploadCloud className="h-6 w-6" />
          </div>
          <p className="mt-3 text-xs font-semibold text-slate-200 group-hover:text-cyan-300 transition-colors">
            将房主发送的 <span className="text-cyan-400 font-bold">Mod 压缩包 (.zip)</span> 拖拽到此处
          </p>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
            <FileArchive className="h-3 w-3" />
            <span>或者直接点击浏览选择文件</span>
          </div>
        </div>
      )}
    </div>
  );
}