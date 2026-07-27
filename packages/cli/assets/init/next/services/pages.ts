import { createCmssyClient } from "@cmssy/core";
import { cmssy } from "@/cmssy.config";

// Your query, in your repo. The SDK does not mirror the graph - it gives you a
// client and gets out of the way, so adding a field here is your call and not a
// release of ours.
const PUBLISHED_PAGES = `query PublishedPages($workspaceSlug: String!) {
  public {
    page {
      list(workspaceSlug: $workspaceSlug) {
        slug
        publishedAt
      }
    }
  }
}`;

type PublishedPages = {
  public?: {
    page?: { list?: { slug?: string | null; publishedAt?: string | null }[] | null } | null;
  } | null;
};

const client = createCmssyClient({
  apiUrl: cmssy.apiUrl,
  org: cmssy.org,
  workspaceSlug: cmssy.workspaceSlug,
});

/**
 * The paths to prerender, as `generateStaticParams` wants them.
 *
 * A catch-all route with no params generated is served on demand and cached by
 * nothing, whatever `revalidate` says - so this function is what makes the
 * route cacheable at all, not an optimisation on top of it.
 */
export async function publishedPaths(): Promise<{ path: string[] }[]> {
  const data = await client.query<PublishedPages>(PUBLISHED_PAGES, {
    workspaceSlug: cmssy.workspaceSlug,
  });

  const pages = data?.public?.page?.list ?? [];
  return pages
    .filter((page) => page.publishedAt)
    .map((page) => ({
      path: (page.slug ?? "").split("/").filter(Boolean),
    }));
}
