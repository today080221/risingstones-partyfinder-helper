import type { KeywordFilter } from "../types";

const TOKEN_SPLIT_RE = /[\s,，;；|、]+/;

export function parseKeywordFilter(input: string): KeywordFilter {
  const include: string[] = [];
  const exclude: string[] = [];

  for (const rawToken of input.split(TOKEN_SPLIT_RE)) {
    const token = rawToken.trim().toLowerCase();
    if (!token) {
      continue;
    }
    if (token.startsWith("-") && token.length > 1) {
      exclude.push(token.slice(1));
    } else {
      include.push(token);
    }
  }

  return { include, exclude };
}

export function matchesKeywordFilter(value: string | undefined, filter: KeywordFilter): boolean {
  const text = (value ?? "").toLowerCase();
  return (
    filter.include.every((token) => text.includes(token)) &&
    filter.exclude.every((token) => !text.includes(token))
  );
}
