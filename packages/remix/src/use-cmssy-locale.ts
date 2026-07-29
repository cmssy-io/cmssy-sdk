import { useMatches } from "react-router";

interface MatchWithLoaderResult {
  data?: unknown;
  loaderData?: unknown;
}

function localeOfMatch(
  match: MatchWithLoaderResult | undefined,
): string | undefined {
  for (const result of [match?.loaderData, match?.data]) {
    const locale = (result as { locale?: unknown } | null | undefined)?.locale;
    if (typeof locale === "string" && locale) return locale;
  }
  return undefined;
}

export function useCmssyLocale(): string | undefined {
  const matches: MatchWithLoaderResult[] = useMatches();
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const locale = localeOfMatch(matches[i]);
    if (locale) return locale;
  }
  return undefined;
}
