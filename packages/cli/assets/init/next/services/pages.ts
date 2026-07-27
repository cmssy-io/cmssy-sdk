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
  const data = await client.query<PublishedPages>(
    PUBLISHED_PAGES,
    { workspaceSlug: cmssy.workspaceSlug },
    {
      // `public` routes through the org-scoped delivery path. Without it the
      // request lands on the base endpoint, where an unauthenticated workspace
      // lookup is by slug alone - across every org.
      public: true,
      // A build reads this once. A single 429 from the delivery API would fail
      // the whole deploy, so retry - it is a read, nothing to double-apply.
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
