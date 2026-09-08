import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import {
  Archive,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileArchive,
  FileCheck2,
  FolderOpen,
  Loader2,
  Minus,
  X,
} from "lucide-react";
import type { ExportNode, PackManifest } from "../types";
import Burst from "./Burst";

interface TreeNode {
  relativePath: string;
  name: string;
  isDir: boolean;
  size: number;
  isRecommended: boolean;
  children: TreeNode[];
}

type ExportState = "idle" | "packing" | "success" | "error";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function buildTree(list: ExportNode[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  for (const n of list) map.set(n.relativePath, { ...n, children: [] });
  const top: TreeNode[] = [];
  for (const node of list) {
    const idx = node.relativePath.lastIndexOf("/");
    const target = idx === -1 ? top : map.get(node.relativePath.slice(0, idx))?.children;
    if (target) target.push(map.get(node.relativePath)!);
  }
  // 文件夹在上,同层按名称排序
  const sortNodes = (arr: TreeNode[]) => {
    arr.sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name));
    arr.forEach((n) => sortNodes(n.children));
  };
  sortNodes(top);
  return top;
}

function addDescendants(node: TreeNode, set: Set<string>) {
  for (const c of node.children) {
    set.add(c.relativePath);
    addDescendants(c, set);
  }
}

function collectDescendants(node: TreeNode): string[] {
  const out: string[] = [];
  for (const c of node.children) {
    out.push(c.relativePath);
    out.push(...collectDescendants(c));
  }
  return out;
}

function flatten(nodes: TreeNode[]): TreeNode[] {
  return nodes.flatMap((n) => [n, ...flatten(n.children)]);
}

interface ExportModalProps {
  gamePath: string;
  initialManifest: PackManifest;
  onClose: () => void;
}

export default function ExportModal({ gamePath, initialManifest, onClose }: ExportModalProps) {
  const [packName, setPackName] = useState(initialManifest.packName);
  const [author, setAuthor] = useState(initialManifest.author);
  const [version, setVersion] = useState(initialManifest.version || "1.0.0");
  const [description, setDescription] = useState(initialManifest.description);
  const [nodes, setNodes] = useState<TreeNode[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [state, setState] = useState<ExportState>("idle");
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<"simple" | "advanced">("simple");
  const [leaving, setLeaving] = useState(false);

  const rootName = useMemo(
    () => gamePath.split(/[\\/]/).filter(Boolean).pop() || "游戏根目录",
    [gamePath]
  );

  // 关闭:先播放退场动画再通知父组件卸载
  const close = () => {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(onClose, 180);
  };

  useEffect(() => {
    invoke<ExportNode[]>("scan_exportable_tree", { gamePath })
      .then((list) => {
        const tree = buildTree(list);
        setNodes(tree);
        const recommended = new Set<string>();
        for (const n of tree) {
          if (n.isRecommended) {
            recommended.add(n.relativePath);
            addDescendants(n, recommended);
          }
        }
        setChecked(recommended);
      })
      .catch((e) => setMessage(String(e)));
  }, [gamePath]);

  // 简单模式:仅显示推荐项(3 个引导文件 + BepInEx 及其子树)
  const visibleNodes = useMemo(
    () => (mode === "simple" ? nodes.filter((n) => n.isRecommended) : nodes),
    [mode, nodes]
  );

  function toggle(node: TreeNode) {
    const next = new Set(checked);
    const all = new Set<string>([node.relativePath]);
    addDescendants(node, all);
    const allChecked = [...all].every((p) => checked.has(p));
    if (allChecked) {
      all.forEach((p) => next.delete(p));
    } else {
      all.forEach((p) => next.add(p));
    }
    setChecked(next);
  }

  function stateOf(node: TreeNode): "checked" | "indeterminate" | "unchecked" {
    if (checked.has(node.relativePath)) return "checked";
    const descendants = collectDescendants(node);
    if (descendants.length === 0) return "unchecked";
    const any = descendants.some((p) => checked.has(p));
    if (!any) return "unchecked";
    return descendants.every((p) => checked.has(p)) ? "checked" : "indeterminate";
  }

  // 导出时剔除已被勾选祖先覆盖的路径,避免重复打包
  const selectedPaths = useMemo(() => {
    return [...checked].filter((p) => {
      const parts = p.split("/");
      for (let i = 1; i < parts.length; i++) {
        if (checked.has(parts.slice(0, i).join("/"))) return false;
      }
      return true;
    });
  }, [checked]);

  const totalSize = useMemo(() => {
    const sizeMap = new Map<string, number>();
    const visit = (n: TreeNode) => {
      sizeMap.set(n.relativePath, n.size);
      n.children.forEach(visit);
    };
    nodes.forEach(visit);
    return selectedPaths.reduce((sum, p) => sum + (sizeMap.get(p) ?? 0), 0);
  }, [selectedPaths, nodes]);

  function setAll() {
    setChecked(new Set(flatten(visibleNodes).map((n) => n.relativePath)));
  }

  function setRecommended() {
    const recommended = new Set<string>();
    for (const n of visibleNodes) {
      if (n.isRecommended) {
        recommended.add(n.relativePath);
        addDescendants(n, recommended);
      }
    }
    setChecked(recommended);
  }

  function clearAll() {
    setChecked(new Set());
  }

  async function startExport() {
    if (selectedPaths.length === 0) {
      setState("error");
      setMessage("请至少勾选一个文件");
      return;
    }
    const target = await save({
      title: "导出整合包",
      defaultPath: `${packName || "整合包"}.zip`,
      filters: [{ name: "Zip 压缩包", extensions: ["zip"] }],
    });
    if (typeof target !== "string") return;

    const manifest: PackManifest = {
      packName: packName.trim() || "未命名整合包",
      author: author.trim(),
      version: version.trim() || "1.0.0",
      description: description.trim(),
      categories: initialManifest.categories,
      modCategories: initialManifest.modCategories,
    };

    setState("packing");
    setMessage("");
    try {
      await invoke("export_modpack_zip", {
        gamePath,
        saveZipPath: target,
        selectedRelativePaths: selectedPaths,
        manifest,
      });
      setState("success");
      setMessage(target);
    } catch (e) {
      setState("error");
      setMessage(String(e));
    }
  }

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
            <Archive className="h-4 w-4 text-emerald-400" />
            导出整合包
            <span className="rounded border border-cyan-400/30 bg-cyan-400/10 px-1.5 font-mono text-[9px] font-semibold text-cyan-300">
              PCL STYLE
            </span>
          </h2>
          <div className="flex items-center gap-2">
            {/* 简单 / 高级模式切换 */}
            <div className="flex items-center rounded-lg border border-white/10 bg-black/30 p-0.5">
              <button
                type="button"
                onClick={() => setMode("simple")}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-all ${
                  mode === "simple"
                    ? "bg-cyan-400/15 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.2)]"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                简单模式
              </button>
              <button
                type="button"
                onClick={() => setMode("advanced")}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-all ${
                  mode === "advanced"
                    ? "bg-cyan-400/15 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.2)]"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                高级模式
              </button>
            </div>
            <button
              type="button"
              onClick={close}
              className="rounded-lg p-1.5 text-zinc-500 transition-all hover:bg-white/5 hover:text-zinc-200 active:scale-90"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          {/* 基本信息 */}
          <div className="grid grid-cols-2 gap-3 px-6 py-4">
            <label className="flex flex-col gap-1 text-[11px] text-zinc-400">
              整合包名称
              <input
                value={packName}
                onChange={(e) => setPackName(e.target.value)}
                placeholder="如:开黑高难拓展包"
                className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-400/50 focus:bg-white/[0.06]"
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] text-zinc-400">
              作者
              <input
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="作者名字"
                className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-400/50 focus:bg-white/[0.06]"
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] text-zinc-400">
              版本号
              <input
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="v1.0.0"
                className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-400/50 focus:bg-white/[0.06]"
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] text-zinc-400">
              介绍描述
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="整合包介绍描述"
                className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-emerald-400/50 focus:bg-white/[0.06]"
              />
            </label>
          </div>

          {/* 快捷操作 + 统计 */}
          <div className="flex items-center justify-between px-6 pb-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={setRecommended}
                className="flex items-center gap-1 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300 transition-all hover:bg-emerald-400/20 active:scale-95"
              >
                <FileCheck2 className="h-3 w-3" />
                推荐勾选
              </button>
              <button
                type="button"
                onClick={setAll}
                className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-zinc-300 transition-all hover:border-white/25 hover:text-zinc-100 active:scale-95"
              >
                <CheckCircle2 className="h-3 w-3" />
                全选
              </button>
              <button
                type="button"
                onClick={clearAll}
                className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-zinc-300 transition-all hover:border-white/25 hover:text-zinc-100 active:scale-95"
              >
                <Minus className="h-3 w-3" />
                清空
              </button>
            </div>
            <span className="font-mono text-[11px] text-zinc-500">
              已选 <span className="font-bold text-emerald-300">{selectedPaths.length}</span> 项 · 合计{" "}
              <span className="font-bold text-cyan-300">{formatSize(totalSize)}</span>
            </span>
          </div>

          {/* 文件选择树 */}
          <div className="mx-6 mb-4 max-h-72 overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-2">
            {nodes.length === 0 && !message && (
              <div className="flex items-center justify-center gap-2 py-6 text-xs text-zinc-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-400" />
                正在扫描可导出内容...
              </div>
            )}
            {/* 最上级:游戏根目录 */}
            <div className="flex items-center gap-2 rounded-md bg-white/[0.03] px-2 py-2">
              <FolderOpen className="h-4 w-4 shrink-0 text-emerald-400" />
              <span className="truncate font-mono text-xs font-bold text-zinc-100">{rootName}</span>
              <span className="shrink-0 rounded border border-white/10 bg-white/[0.04] px-1.5 text-[9px] text-zinc-500">
                {mode === "simple" ? "简单模式" : "游戏根目录"}
              </span>
              <span className="ml-auto shrink-0 font-mono text-[10px] text-zinc-600">
                已选 {formatSize(totalSize)}
              </span>
            </div>
            {visibleNodes.map((n) => (
              <TreeRow
                key={n.relativePath}
                node={n}
                depth={0}
                mode={mode}
                onToggle={toggle}
                stateOf={stateOf}
              />
            ))}
            {/* 自动包含项 */}
            <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-zinc-500">
              <span className="flex h-4 w-4 items-center justify-center rounded border border-emerald-400/50 bg-emerald-400/20 text-emerald-300">
                <Check className="h-3 w-3" />
              </span>
              <span className="font-mono text-zinc-400">repo_pack_manifest.json</span>
              <span className="text-zinc-600">(分类清单,自动包含)</span>
            </div>
          </div>
        </div>

        {/* 底部操作栏 */}
        <footer className="flex items-center justify-between border-t border-white/10 px-6 py-4">
          <div className="min-w-0 text-xs">
            {state === "packing" && (
              <span className="flex items-center gap-1.5 text-cyan-300">
                <Loader2 className="h-4 w-4 animate-spin" />
                正在打包整合包...
              </span>
            )}
            {state === "success" && (
              <span className="relative flex items-center gap-1.5 text-emerald-400">
                <span className="success-ring relative flex h-6 w-6 shrink-0 items-center justify-center">
                  <CheckCircle2 className="check-pop h-5 w-5" />
                  <Burst />
                </span>
                导出成功: <span className="truncate font-mono">{message}</span>
              </span>
            )}
            {state === "error" && <span className="text-rose-400">{message}</span>}
          </div>
          <div className="flex shrink-0 gap-2">
            {state === "success" ? (
              <button
                type="button"
                onClick={close}
                className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-2 text-xs font-bold text-zinc-950 shadow-[0_0_20px_rgba(16,185,129,0.25)] transition-all hover:scale-[1.02] hover:shadow-[0_0_25px_rgba(16,185,129,0.4)] active:scale-95"
              >
                完成
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={close}
                  disabled={state === "packing"}
                  className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-medium text-zinc-300 transition-all hover:border-white/25 hover:text-zinc-100 active:scale-95 disabled:opacity-40"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => void startExport()}
                  disabled={state === "packing"}
                  className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 px-5 py-2 text-xs font-bold text-zinc-950 shadow-[0_0_20px_rgba(6,182,212,0.25)] transition-all hover:scale-[1.02] hover:shadow-[0_0_25px_rgba(6,182,212,0.4)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <FileArchive className="h-4 w-4" />
                  开始打包导出
                </button>
              </>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

interface TreeRowProps {
  node: TreeNode;
  depth: number;
  mode: "simple" | "advanced";
  onToggle: (node: TreeNode) => void;
  stateOf: (node: TreeNode) => "checked" | "indeterminate" | "unchecked";
}

function TreeRow({ node, depth, mode, onToggle, stateOf }: TreeRowProps) {
  // 简单模式默认展开到 Mod 列表层;高级模式默认展开两层
  const [open, setOpen] = useState(depth < (mode === "simple" ? 3 : 2));
  const state = stateOf(node);
  const isBepinex = node.relativePath === "BepInEx";

  return (
    <div>
      <div
        className="flex items-center gap-2 rounded-md py-1.5 pr-2 transition hover:bg-white/[0.03]"
        style={{ paddingLeft: depth * 18 + 8 }}
      >
        {node.children.length > 0 ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="flex h-4 w-4 items-center justify-center text-zinc-500 transition hover:text-zinc-200 active:scale-90"
          >
            {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}

        <button
          type="button"
          onClick={() => onToggle(node)}
          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-all duration-150 active:scale-90 ${
            state === "checked"
              ? "border-emerald-400 bg-emerald-400 text-zinc-950 shadow-[0_0_8px_rgba(52,211,153,0.4)]"
              : state === "indeterminate"
              ? "border-emerald-400/60 bg-emerald-400/20 text-emerald-300"
              : "border-white/25 hover:border-white/50"
          }`}
        >
          {state === "checked" && <Check className="h-3 w-3" />}
          {state === "indeterminate" && <Minus className="h-3 w-3" />}
        </button>

        {node.isDir ? (
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-cyan-400/70" />
        ) : (
          <FileArchive className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
        )}
        <span className={`truncate font-mono text-xs ${node.isRecommended ? "text-zinc-200" : "text-zinc-400"}`}>
          {node.name}
        </span>
        <span className="shrink-0 text-[10px] text-zinc-600">
          {isBepinex ? "(核心框架)" : node.isRecommended ? (node.isDir ? "" : "(引导前置)") : ""}
        </span>
        <span className="ml-auto shrink-0 font-mono text-[10px] text-zinc-600">{formatSize(node.size)}</span>
      </div>

      {open &&
        node.children.map((c) => (
          <TreeRow key={c.relativePath} node={c} depth={depth + 1} mode={mode} onToggle={onToggle} stateOf={stateOf} />
        ))}
    </div>
  );
}