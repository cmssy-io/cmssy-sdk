import { checkCmssyEditMode } from "@cmssy/astro/testing";

const baseUrl = process.env.SMOKE_BASE_URL ?? "http://localhost:4321";
const secret = process.env.CMSSY_DRAFT_SECRET;

if (!secret) {
  console.error("CMSSY_DRAFT_SECRET is not set - the editor cannot be checked.");
  process.exit(1);
}

// A build proves the site compiles. It says nothing about whether the site can
// still be EDITED - and that is the part that breaks silently.
const result = await checkCmssyEditMode({ baseUrl, secret });

if (!result.ok) {
  console.error("Editor smoke test FAILED:");
  for (const failure of result.failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log("Editor smoke test passed.");
