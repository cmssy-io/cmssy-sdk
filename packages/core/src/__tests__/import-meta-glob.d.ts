interface ImportMeta {
  glob(
    patterns: string[],
    options: { eager: true },
  ): Record<string, Record<string, unknown>>;
}
