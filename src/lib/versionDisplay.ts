export function compactCommitLabel(commit: string): string {
  return /^[0-9a-f]{12,}$/i.test(commit) ? commit.slice(0, 7) : commit;
}
