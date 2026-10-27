import { defineCmssyConfig, defineCmssyLayout } from "@cmssy/astro";

if (import.meta.env.DEV) loadLocalEnv();

function loadLocalEnv() {
  try {
    process.loadEnvFile?.(".env.local");
  } catch (error) {
    if ((error as { code?: string }).code !== "ENOENT") throw error;
  }
}

export const layout = defineCmssyLayout({
  regions: [
    { id: "header", label: "Header" },
    { id: "footer", label: "Footer" },
  ],
});

export const cmssy = defineCmssyConfig({
  org: process.env.CMSSY_ORG_SLUG,
  workspaceSlug: process.env.CMSSY_WORKSPACE_SLUG,
  draftSecret: process.env.CMSSY_DRAFT_SECRET,
  layout,
});
