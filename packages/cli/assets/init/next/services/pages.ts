import { createCmssyClient, typedOperation } from "@cmssy/core";
import { cmssy } from "@/cmssy.config";

type PublishedPages = {
  public?: {
    page?: { list?: { slug?: string | null; publishedAt?: string | null }[] | null } | null;
  } | null;
};

const PUBLISHED_PAGES = typedOperation<
  PublishedPages,
  { workspaceSlug: string }
>(`query PublishedPages($workspaceSlug: String!) {
  public {
    page {
      list(workspaceSlug: $workspaceSlug) {
        slug
        publishedAt
      }
    }
  }
}`);

const client = createCmssyClient({
  apiUrl: cmssy.apiUrl,
  org: cmssy.org,
  workspaceSlug: cmssy.workspaceSlug,
});

export async function publishedPaths(): Promise<{ path: string[] }[]> {
  const data = await client.query(
    PUBLISHED_PAGES,
    { workspaceSlug: cmssy.workspaceSlug },
    {
      public: true,
      retry: {},
    },
  );

  const pages = data?.public?.page?.list ?? [];
  return pages
    .filter((page) => page.publishedAt)
    .map((page) => ({
      path: (page.slug ?? "").split("/").filter(Boolean),
    }));
}
