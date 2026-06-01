export interface CmssyNextConfig {
  apiUrl: string;
  workspaceSlug: string;
  draftSecret: string;
  editorOrigin: string | string[];
  defaultLocale?: string;
  resolveLocale?: () => string | Promise<string>;
}
