import { createCmssyProxy } from "@cmssy/next/middleware";
import { cmssy } from "@/cmssy.config";

// Resolves the language, sends verified editor traffic to /cmssy-edit (carrying
// that language and the edit flag), and lets the cmssy admin frame this site.
// The order matters, which is why it lives in the preset and not here.
export const proxy = createCmssyProxy(cmssy);

// Next parses this at compile time, so the matcher has to be a literal - an
// imported constant is rejected. Skips Next internals, API routes and files.
export const config = {
  matcher: ["/((?!_next/|api/|.*\\..*).*)"],
};
