export type PageScrollTarget = {
  scrollTo(options: ScrollToOptions): void;
};

export function scrollPageToTop(target: PageScrollTarget, prefersReducedMotion: boolean) {
  target.scrollTo({
    top: 0,
    behavior: prefersReducedMotion ? 'auto' : 'smooth',
  });
}
