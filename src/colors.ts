const PALETTE = [
  {
    text: "text-emerald-400",
    bg: "bg-emerald-400/10",
    border: "border-emerald-400/30",
    glow: "shadow-[0_0_10px_rgba(52,211,153,0.30)]",
  },
  {
    text: "text-cyan-400",
    bg: "bg-cyan-400/10",
    border: "border-cyan-400/30",
    glow: "shadow-[0_0_10px_rgba(34,211,238,0.30)]",
  },
  {
    text: "text-violet-400",
    bg: "bg-violet-400/10",
    border: "border-violet-400/30",
    glow: "shadow-[0_0_10px_rgba(167,139,250,0.30)]",
  },
  {
    text: "text-amber-400",
    bg: "bg-amber-400/10",
    border: "border-amber-400/30",
    glow: "shadow-[0_0_10px_rgba(251,191,36,0.30)]",
  },
  {
    text: "text-rose-400",
    bg: "bg-rose-400/10",
    border: "border-rose-400/30",
    glow: "shadow-[0_0_10px_rgba(251,113,133,0.30)]",
  },
  {
    text: "text-sky-400",
    bg: "bg-sky-400/10",
    border: "border-sky-400/30",
    glow: "shadow-[0_0_10px_rgba(56,189,248,0.30)]",
  },
  {
    text: "text-lime-400",
    bg: "bg-lime-400/10",
    border: "border-lime-400/30",
    glow: "shadow-[0_0_10px_rgba(163,230,53,0.30)]",
  },
  {
    text: "text-fuchsia-400",
    bg: "bg-fuchsia-400/10",
    border: "border-fuchsia-400/30",
    glow: "shadow-[0_0_10px_rgba(232,121,249,0.30)]",
  },
];

/** 按分类名哈希稳定映射到一组微光配色 */
export function categoryColor(category: string) {
  let hash = 0;
  for (const ch of category) {
    hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}