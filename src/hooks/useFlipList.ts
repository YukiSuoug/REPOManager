import { useEffect, useRef } from "react";

/**
 * FLIP 列表位移动画:当 items 中元素位置发生变化(删除/插入导致的补位)时,
 * 平滑地从旧位置过渡到新位置,而不是瞬移。
 */
export function useFlipList<T>(items: T[], keyFn: (item: T) => string) {
  const refs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const prev = useRef<Map<string, DOMRect>>(new Map());

  useEffect(() => {
    const next = new Map<string, DOMRect>();
    const moved: { el: HTMLDivElement; dx: number; dy: number }[] = [];

    for (const item of items) {
      const key = keyFn(item);
      const el = refs.current.get(key);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      next.set(key, rect);
      const before = prev.current.get(key);
      if (before) {
        const dx = before.left - rect.left;
        const dy = before.top - rect.top;
        if (dx !== 0 || dy !== 0) moved.push({ el, dx, dy });
      }
    }

    if (moved.length > 0) {
      // First:记录旧位置与现位置的差值,先瞬移到旧位置
      for (const { el, dx, dy } of moved) {
        el.style.transition = "none";
        el.style.transform = `translate(${dx}px, ${dy}px)`;
      }
      // 强制回流,确保 transform 生效
      void document.body.offsetWidth;
      // Play:加上过渡动画回到目标位置
      requestAnimationFrame(() => {
        for (const { el } of moved) {
          el.style.transition = "transform 250ms cubic-bezier(0.22, 1, 0.36, 1)";
          el.style.transform = "";
        }
      });
      window.setTimeout(() => {
        for (const { el } of moved) {
          el.style.transition = "";
        }
      }, 300);
    }

    prev.current = next;
  }, [items, keyFn]);

  /** 绑定到列表项的 ref 上 */
  const setRef = (key: string) => (el: HTMLDivElement | null) => {
    if (el) refs.current.set(key, el);
    else refs.current.delete(key);
  };

  return setRef;
}