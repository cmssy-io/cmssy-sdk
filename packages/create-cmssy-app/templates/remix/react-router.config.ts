import type { Config } from "@react-router/dev/config";

// Server-rendered on every request. That is why this adapter needs no separate
// edit route: a React Router page always sees its query string, so a verified
// editor request can be served from the page itself.
export default { ssr: true } satisfies Config;
