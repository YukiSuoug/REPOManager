import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  Search,
  Download,
  ThumbsUp,
  ExternalLink,
  RefreshCw,
  Sparkles,
  Loader2,
  Package,
  Layers,
  ArrowUpDown,
  Filter,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import type {
  ThunderstorePackage,
  MarketSortOption,
  ModCardInfo,
  ModUpdateInfo,
} from "../types";
import { playClickSound, playSuccessSound } from "../utils/audio";

interface CommunityMarketProps {
  packages: ThunderstorePackage[];
  installedMods: ModCardInfo[];
  updates: ModUpdateInfo[];
  isLoading: boolean;
  onRefresh: () => void;
  onInstall: (pkg: ThunderstorePackage) => Promise<void>;
  initialSearchQuery?: string;
}

const PAGE_SIZE = 24;

function formatDownloads(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return `${count}`;
}

/** 单独的异步图片渲染组件，防卡顿与闪烁 */
const ModIcon = React.memo(function ModIcon({
  src,
  alt,
}: {
  src?: string;
  alt: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  if (!src || error) {
    return (
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-[#0e1424]">
        <Package className="h-6 w-6 text-zinc-500" />
      </div>
    );
  }

  return (
    <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-[#0e1424]">
      {!loaded && <Package className="h-6 w-6 text-zinc-600 animate-pulse" />}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        className={`h-full w-full object-cover transition-opacity duration-200 ${
          loaded ? "opacity-100" : "opacity-0 absolute inset-0"
        }`}
      />
    </div>
  );
});

export default function CommunityMarket({
  packages,
  installedMods,
  updates,
  isLoading,
  onRefresh,
  onInstall,
  initialSearchQuery = "",
}: CommunityMarketProps) {
  const [search, setSearch] = useState(initialSearchQuery);
  const [selectedCategory, setSelectedCategory] = useState("全部");
  const [sortOption, setSortOption] = useState<MarketSortOption>("downloads");
  const [currentPage, setCurrentPage] = useState(1);
  const [installingFullName, setInstallingFullName] = useState<string | null>(null);
  const topAnchorRef = useRef<HTMLDivElement>(null);

  // 提取所有社区分类标签
  const allCategories = useMemo(() => {
    const set = new Set<string>();
    packages.forEach((pkg) => {
      pkg.categories.forEach((c) => set.add(c));
    });
    return ["全部", ...Array.from(set)];
  }, [packages]);

  // 已安装 Mod 匹配辅助 Map
  const installedMap = useMemo(() => {
    const map = new Map<string, string>();
    installedMods.forEach((m) => {
      map.set(m.folderName.toLowerCase(), m.version);
      map.set(m.name.toLowerCase(), m.version);
    });
    return map;
  }, [installedMods]);

  const updatesMap = useMemo(() => {
    const map = new Map<string, ModUpdateInfo>();
    updates.forEach((u) => {
      map.set(u.folderName.toLowerCase(), u);
      map.set(u.modName.toLowerCase(), u);
    });
    return map;
  }, [updates]);

  // 过滤与排序
  const filteredPackages = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = packages.filter((pkg) => {
      const matchesSearch =
        !q ||
        pkg.name.toLowerCase().includes(q) ||
        pkg.owner.toLowerCase().includes(q) ||
        pkg.latestVersion?.description.toLowerCase().includes(q);

      const matchesCat =
        selectedCategory === "全部" || pkg.categories.includes(selectedCategory);

      return matchesSearch && matchesCat;
    });

    list = [...list].sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;

      switch (sortOption) {
        case "downloads":
          return b.totalDownloads - a.totalDownloads;
        case "rating":
          return b.ratingScore - a.ratingScore;
        case "latest": {
          const dateA = a.latestVersion?.dateCreated || "";
          const dateB = b.latestVersion?.dateCreated || "";
          return dateB.localeCompare(dateA);
        }
        case "name":
          return a.name.localeCompare(b.name);
        default:
          return 0;
      }
    });

    return list;
  }, [packages, search, selectedCategory, sortOption]);

  // 当搜索、分类或排序改变时重置为第 1 页
  useEffect(() => {
    setCurrentPage(1);
  }, [search, selectedCategory, sortOption]);

  const totalPages = Math.max(1, Math.ceil(filteredPackages.length / PAGE_SIZE));

  // 当前页切片
  const paginatedPackages = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredPackages.slice(start, start + PAGE_SIZE);
  }, [filteredPackages, currentPage]);

  function goToPage(page: number) {
    if (page < 1 || page > totalPages || page === currentPage) return;
    playClickSound();
    setCurrentPage(page);
    topAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleInstall(pkg: ThunderstorePackage) {
    if (installingFullName) return;
    setInstallingFullName(pkg.fullName);
    playClickSound();
    try {
      await onInstall(pkg);
      playSuccessSound();
    } finally {
      setInstallingFullName(null);
    }
  }

  // 计算可视页码 (最多显示 5 个数字)
  const pageNumbers = useMemo(() => {
    const pages: number[] = [];
    const maxVisible = 5;
    let start = Math.max(1, currentPage - 2);
    let end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start < maxVisible - 1) {
      start = Math.max(1, end - maxVisible + 1);
    }
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  }, [currentPage, totalPages]);

  return (
    <div ref={topAnchorRef} className="space-y-4 pb-12">
      {/* 搜索与工具条 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative min-w-[280px] flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="搜索社区 Mod 名称 / 作者 / 介绍..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-[#0d1322] py-2 pl-10 pr-4 text-xs text-slate-100 placeholder-zinc-500 outline-none transition focus:border-cyan-400/50"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* 排序选择 */}
          <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#0d1322] px-2.5 py-1.5 text-xs text-zinc-400">
            <ArrowUpDown className="h-3.5 w-3.5 text-cyan-400" />
            <select
              value={sortOption}
              onChange={(e) => {
                playClickSound();
                setSortOption(e.target.value as MarketSortOption);
              }}
              className="bg-transparent text-xs text-zinc-200 outline-none cursor-pointer"
            >
              <option value="downloads" className="bg-[#0b101d]">按下载量最多</option>
              <option value="rating" className="bg-[#0b101d]">按社区评分最高</option>
              <option value="latest" className="bg-[#0b101d]">按最新发布更新</option>
              <option value="name" className="bg-[#0b101d]">按名称 A-Z</option>
            </select>
          </div>

          {/* 刷新按钮 */}
          <button
            type="button"
            onClick={() => {
              playClickSound();
              onRefresh();
            }}
            disabled={isLoading}
            title="刷新社区 Mod 列表"
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-[#0d1322] text-zinc-400 transition hover:text-white active:scale-95 disabled:opacity-40"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin text-cyan-400" : ""}`} />
          </button>
        </div>
      </div>

      {/* 标签分类过滤器 */}
      {allCategories.length > 1 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <div className="flex items-center gap-1 text-[11px] font-medium text-zinc-500 pr-1 shrink-0">
            <Filter className="h-3 w-3 text-cyan-400" />
            分类:
          </div>
          {allCategories.slice(0, 12).map((cat) => {
            const isSelected = cat === selectedCategory;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => {
                  playClickSound();
                  setSelectedCategory(cat);
                }}
                className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition active:scale-95 ${
                  isSelected
                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold"
                    : "border border-white/5 bg-[#0d1322] text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      )}

      {/* 市场列表展示区 */}
      {isLoading && packages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-cyan-400 mb-3" />
          <p className="text-xs font-medium text-zinc-400">正在连接 Thunderstore 获取 Mod 清单...</p>
        </div>
      ) : filteredPackages.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-[#0d1322]/50 py-20 text-center">
          <Layers className="h-8 w-8 text-zinc-600 mb-2" />
          <p className="text-xs text-zinc-400 font-medium">没有找到匹配的社区 Mod</p>
          <p className="text-[11px] text-zinc-600 mt-1">尝试更换关键词或分类标签</p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 grid-cols-1 md:grid-cols-2 2xl:grid-cols-3">
            {paginatedPackages.map((pkg) => {
              const latest = pkg.latestVersion;
              const isInstalling = installingFullName === pkg.fullName;
              const isInstalled =
                installedMap.has(pkg.fullName.toLowerCase()) ||
                installedMap.has(pkg.name.toLowerCase());
              const hasUpdate =
                updatesMap.has(pkg.fullName.toLowerCase()) ||
                updatesMap.has(pkg.name.toLowerCase());

              return (
                <div
                  key={pkg.fullName}
                  className="group relative flex flex-col justify-between rounded-2xl border border-white/10 bg-[#0d1322] p-4 transition-colors hover:border-cyan-500/30"
                >
                  <div>
                    {/* 头部图标 + 标题 + 作者 + 置顶徽章 */}
                    <div className="flex items-start gap-3">
                      <ModIcon src={latest?.icon} alt={pkg.name} />

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <h4 className="truncate text-xs font-bold text-slate-100 group-hover:text-cyan-300 transition-colors">
                            {pkg.name}
                          </h4>
                          {pkg.isPinned && (
                            <span className="shrink-0 rounded bg-amber-500/20 border border-amber-500/40 px-1 font-mono text-[9px] font-bold text-amber-300">
                              PIN
                            </span>
                          )}
                          {latest?.versionNumber && (
                            <span className="shrink-0 rounded border border-cyan-400/30 bg-cyan-400/10 px-1 font-mono text-[9px] text-cyan-300">
                              v{latest.versionNumber}
                            </span>
                          )}
                        </div>

                        <p className="text-[11px] font-mono text-zinc-500 mt-0.5">
                          by <span className="text-zinc-300">{pkg.owner}</span>
                        </p>
                      </div>
                    </div>

                    {/* 描述 */}
                    <p
                      title={latest?.description}
                      className="mt-2.5 line-clamp-2 text-[11px] text-zinc-400 leading-relaxed"
                    >
                      {latest?.description || "暂无描述"}
                    </p>
                  </div>

                  {/* 底部指标与操作按钮 */}
                  <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between gap-2">
                    {/* 下载量 & 评分 */}
                    <div className="flex items-center gap-3 text-[11px] font-mono text-zinc-500">
                      <span className="flex items-center gap-1 text-zinc-400" title="总下载量">
                        <Download className="h-3 w-3 text-cyan-400" />
                        {formatDownloads(pkg.totalDownloads)}
                      </span>
                      <span className="flex items-center gap-1 text-zinc-400" title="社区赞同评分">
                        <ThumbsUp className="h-3 w-3 text-emerald-400" />
                        {pkg.ratingScore}
                      </span>
                    </div>

                    {/* 操作按钮群 */}
                    <div className="flex items-center gap-1.5">
                      {/* 官方网页链接 */}
                      <a
                        href={pkg.packageUrl}
                        target="_blank"
                        rel="noreferrer"
                        title="在浏览器中打开 Thunderstore 页面"
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/[0.02] text-zinc-500 transition hover:text-cyan-300"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>

                      {/* 安装 / 已安装 / 一键更新按钮 */}
                      {hasUpdate ? (
                        <button
                          type="button"
                          onClick={() => void handleInstall(pkg)}
                          disabled={isInstalling}
                          title="检测到新版本，点击覆盖升级"
                          className="flex h-7 items-center gap-1.5 rounded-lg border border-emerald-400/40 bg-emerald-500/20 px-2.5 text-[11px] font-bold text-emerald-300 transition active:scale-95 disabled:opacity-40"
                        >
                          {isInstalling ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Sparkles className="h-3 w-3 animate-pulse" />
                          )}
                          {isInstalling ? "更新中..." : "升级"}
                        </button>
                      ) : isInstalled ? (
                        <button
                          type="button"
                          onClick={() => void handleInstall(pkg)}
                          disabled={isInstalling}
                          title="已安装该 Mod，点击可重新下载覆盖安装"
                          className="flex h-7 items-center gap-1 rounded-lg border border-white/15 bg-white/[0.04] px-2 text-[11px] font-medium text-zinc-400 transition hover:text-zinc-200 active:scale-95 disabled:opacity-40"
                        >
                          {isInstalling ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Download className="h-3 w-3" />
                          )}
                          {isInstalling ? "重新安装中..." : "重新安装"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void handleInstall(pkg)}
                          disabled={isInstalling}
                          className="flex h-7 items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-2.5 text-[11px] font-bold text-cyan-300 transition active:scale-95 disabled:opacity-40"
                        >
                          {isInstalling ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Download className="h-3 w-3" />
                          )}
                          {isInstalling ? "下载安装中..." : "一键安装"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 分页控制器 */}
          {totalPages > 1 && (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4 text-xs">
              <div className="text-zinc-500 font-mono text-[11px]">
                共 <span className="text-zinc-300 font-bold">{filteredPackages.length}</span> 个 Mod · 每页 {PAGE_SIZE} 项
              </div>

              <div className="flex items-center gap-1">
                {/* 首页 */}
                <button
                  type="button"
                  onClick={() => goToPage(1)}
                  disabled={currentPage === 1}
                  title="回到第一页"
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-[#0d1322] text-zinc-400 transition hover:text-white disabled:opacity-30"
                >
                  <ChevronsLeft className="h-3.5 w-3.5" />
                </button>

                {/* 上一页 */}
                <button
                  type="button"
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  title="上一页"
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-[#0d1322] text-zinc-400 transition hover:text-white disabled:opacity-30"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>

                {/* 数字页码 */}
                {pageNumbers.map((p) => {
                  const isActive = p === currentPage;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => goToPage(p)}
                      className={`flex h-7 min-w-[28px] items-center justify-center rounded-lg px-1.5 font-mono text-xs font-bold transition ${
                        isActive
                          ? "border border-cyan-500/50 bg-cyan-500/20 text-cyan-300"
                          : "border border-white/5 bg-[#0d1322] text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}

                {/* 下一页 */}
                <button
                  type="button"
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  title="下一页"
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-[#0d1322] text-zinc-400 transition hover:text-white disabled:opacity-30"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>

                {/* 末页 */}
                <button
                  type="button"
                  onClick={() => goToPage(totalPages)}
                  disabled={currentPage === totalPages}
                  title="跳转至最后一页"
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-[#0d1322] text-zinc-400 transition hover:text-white disabled:opacity-30"
                >
                  <ChevronsRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
