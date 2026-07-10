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
