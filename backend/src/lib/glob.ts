/**
 * Minimal glob → RegExp for repository paths. Supports `**` (any depth), `*` (one segment) and `?`.
 * A pattern without wildcards matches the path itself or anything under it (directory prefix).
 */
export function globToRegExp(pattern: string): RegExp {
  const p = pattern.trim().replace(/^\.\//, '').replace(/^\//, '');
  if (!/[*?]/.test(p)) {
    const escaped = escapeRe(p.replace(/\/$/, ''));
    return new RegExp(`^${escaped}(?:/.*)?$`);
  }
  let re = '';
  for (let i = 0; i < p.length; i++) {
    const ch = p[i]!;
    if (ch === '*') {
      if (p[i + 1] === '*') {
        const followedBySlash = p[i + 2] === '/';
        re += followedBySlash ? '(?:.*/)?' : '.*';
        i += followedBySlash ? 2 : 1;
      } else {
        re += '[^/]*';
      }
    } else if (ch === '?') {
      re += '[^/]';
    } else {
      re += escapeRe(ch);
    }
  }
  return new RegExp(`^${re}$`);
}

function escapeRe(s: string): string {
  return s.replace(/[.+^${}()|[\]\\]/g, '\\$&');
}

export function matchesAny(path: string, patterns: string[]): boolean {
  return patterns.some((p) => globToRegExp(p).test(path));
}
