import { createCmssyRevalidateRoute } from "@cmssy/next/server";

export const POST = createCmssyRevalidateRoute({
  secret: process.env.CMSSY_WEBHOOK_SECRET,
});
