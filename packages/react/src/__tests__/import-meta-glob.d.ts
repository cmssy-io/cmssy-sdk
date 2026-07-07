// Minimal typing for the Vite/Vitest `import.meta.glob` static macro used by
// sdl-operations.test.ts, so tsc doesn't require the vite/client ambient types.
interface ImportMeta {
  glob(
    patterns: string[],
    options: { eager: true },
  ): Record<string, Record<string, unknown>>;
}
