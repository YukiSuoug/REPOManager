import { useMemo } from "react";

/** 成功粒子爆发:围绕中心向四周飞散的小光点,用于安装/导出完成时的庆祝动效 */
export default function Burst({ color = "bg-emerald-300" }: { color?: string }) {
  const dots = useMemo(
    () =>
      Array.from({ length: 10 }, (_, i) => {
        const angle = (i / 10) * Math.PI * 2 + Math.random() * 0.3;
        const dist = 36 + Math.random() * 20;
        return {
          dx: Math.cos(angle) * dist,
          dy: Math.sin(angle) * dist,
          delay: Math.random() * 0.08,
        };
      }),
    []
  );

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      {dots.map((d, i) => (
        <span
          key={i}
          className={`burst-dot absolute h-1.5 w-1.5 rounded-full ${color}`}
          style={{
            animationDelay: `${d.delay}s`,
            ["--dx" as string]: `${d.dx}px`,
            ["--dy" as string]: `${d.dy}px`,
          }}
        />
      ))}
    </div>
  );
}