export function getCenteredScrollTop({
  containerHeight,
  itemOffsetTop,
  itemHeight,
}: {
  containerHeight: number;
  itemOffsetTop: number;
  itemHeight: number;
}) {
  return Math.max(0, Math.round(itemOffsetTop - (containerHeight - itemHeight) / 2));
}

export function getSourceLineScrollTop({
  windowScrollY,
  viewportHeight,
  elementTop,
  elementHeight,
  startLine,
  endLine,
  targetLine,
}: {
  windowScrollY: number;
  viewportHeight: number;
  elementTop: number;
  elementHeight: number;
  startLine: number;
  endLine: number;
  targetLine: number;
}) {
  const span = Math.max(1, endLine - startLine + 1);
  const progress = Math.min(1, Math.max(0, (targetLine - startLine) / span));
  const targetOffset = elementHeight * progress;
  return Math.max(0, Math.round(windowScrollY + elementTop + targetOffset - viewportHeight * 0.28));
}


/** Prefer the selected company on the exact raw source line, then the line itself. */
export function findSourceLineElement(root: ParentNode, line: number): HTMLElement | null {
  const exact = Array.from(root.querySelectorAll<HTMLElement>(`[data-source-line="${line}"]`));
  for (const node of exact) {
    const target = node.querySelector<HTMLElement>('.report-target-highlight');
    if (target) return target;
  }
  if (exact.length) return exact[0];

  const blocks = Array.from(root.querySelectorAll<HTMLElement>('[data-line-start]'));
  return blocks.filter((node) => Number(node.dataset.lineStart) <= line && Number(node.dataset.lineEnd ?? node.dataset.lineStart) >= line)
    .sort((left, right) => (Number(left.dataset.lineEnd) - Number(left.dataset.lineStart)) - (Number(right.dataset.lineEnd) - Number(right.dataset.lineStart)))[0]
    ?? blocks.filter((node) => Number(node.dataset.lineStart) <= line)
      .sort((left, right) => Number(right.dataset.lineStart) - Number(left.dataset.lineStart))[0]
    ?? null;
}
