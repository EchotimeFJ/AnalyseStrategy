import { ArrowUp } from 'lucide-react';
import { scrollPageToTop } from '@/lib/pageScroll';

export function BackToTopButton() {
  const handleClick = () => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    scrollPageToTop(window, prefersReducedMotion);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="mb-2 flex min-h-11 w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 text-left text-slate-600 transition hover:border-blue-300 hover:text-slate-950"
      aria-label="返回顶部"
    >
      <span className="flex items-center gap-2">
        <ArrowUp className="h-4 w-4" />
        <span className="font-semibold">返回顶部</span>
      </span>
      <span>平滑返回</span>
    </button>
  );
}
