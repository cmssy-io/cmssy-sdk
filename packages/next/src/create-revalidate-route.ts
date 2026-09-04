import { revalidateTag } from "next/cache";
import { CmssyWebhookError, verifyCmssyWebhook } from "@cmssy/core";
import { cmssyContentTags } from "./data-cache";

export interface CmssyRevalidateRouteConfig {
  secret: string | string[] | undefined;
  tags?: string[];
  toleranceSeconds?: number;
}

const SIGNATURE_HEADER = "x-cmssy-signature";

export function createCmssyRevalidateRoute(config: CmssyRevalidateRouteConfig) {
  const tags = cmssyContentTags(config.tags);
  const secrets = (
    Array.isArray(config.secret) ? config.secret : [config.secret]
  ).filter((secret): secret is string => Boolean(secret));

  return async function POST(request: Request): Promise<Response> {
    if (secrets.length === 0) {
      return new Response(
        "cmssy: createCmssyRevalidateRoute has no signing secret - set CMSSY_WEBHOOK_SECRET to the secret cmssy shows for this webhook and pass it as `secret`",
        { status: 500 },
      );
    }
    const body = await request.text();
    try {
      await verifyCmssyWebhook({
        body,
        signatureHeader: request.headers.get(SIGNATURE_HEADER),
        secret: secrets,
        toleranceSeconds: config.toleranceSeconds,
      });
    } catch (err) {
      if (err instanceof CmssyWebhookError) {
        return new Response(err.message, { status: 401 });
      }
      throw err;
    }
    for (const tag of tags) revalidateTag(tag, { expire: 0 });
    return Response.json({ revalidated: tags });
  };
}
