export interface CmssyAuthConfig {
  modelSlug: string;
  sessionSecret: string;
}

export interface CmssyNextConfig {
  apiUrl: string;
  workspaceSlug: string;
  draftSecret: string;
  editorOrigin: string | string[];
  auth?: CmssyAuthConfig;
  defaultLocale?: string;
  /** All languages enabled on the workspace; exposed to blocks via context.locale.enabled. */
  enabledLocales?: string[];
  resolveLocale?: () => string | Promise<string>;
}
