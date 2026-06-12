import { cookies } from "next/headers";

import type { CmssyNextConfig } from "./config";
import { CMSSY_SESSION_COOKIE, isAccessExpired, openSession } from "./session";
import {
  backendAddToCart,
  backendApplyDiscount,
  backendCheckout,
  backendClearCart,
  backendGetCart,
  backendProduct,
  backendRemoveDiscount,
  backendRemoveItem,
  backendUpdateItem,
  type CartRequestContext,
} from "./cart-client";

export const CMSSY_CART_COOKIE = "cmssy_cart";
const CART_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const CART_TOKEN_BYTES = 32;
const MAX_BODY_CHARS = 16 * 1024;

export interface CmssyCartRouteHandlers {
  POST(
    request: Request,
    context: { params: Promise<{ action: string }> },
  ): Promise<Response>;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

function cartCookieOptions() {
  return {
    httpOnly: true as const,
    secure: process.env.NODE_ENV !== "development",
    sameSite: "lax" as const,
    path: "/" as const,
    maxAge: CART_MAX_AGE_SECONDS,
  };
}

function mintToken(): string {
  const bytes = new Uint8Array(CART_TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error("content-type must be application/json");
  }
  const text = await request.text();
  if (text.length > MAX_BODY_CHARS) throw new Error("body too large");
  if (!text) return {};
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("body must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function plainObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function createCmssyCartRoute(
  config: CmssyNextConfig,
): CmssyCartRouteHandlers {
  async function ensureCartToken(): Promise<string> {
    const jar = await cookies();
    const existing = jar.get(CMSSY_CART_COOKIE)?.value;
    if (existing) return existing;
    const token = mintToken();
    jar.set(CMSSY_CART_COOKIE, token, cartCookieOptions());
    return token;
  }

  async function clearCartToken(): Promise<void> {
    const jar = await cookies();
    jar.set(CMSSY_CART_COOKIE, "", { ...cartCookieOptions(), maxAge: 0 });
  }

  async function memberAccessToken(): Promise<string | undefined> {
    if (!config.auth) return undefined;
    const jar = await cookies();
    const raw = jar.get(CMSSY_SESSION_COOKIE)?.value;
    if (!raw) return undefined;
    const session = await openSession(
      raw,
      config.auth.sessionSecret,
      config.workspaceSlug,
    );
    if (!session || isAccessExpired(session)) return undefined;
    return session.accessToken;
  }

  async function buildContext(): Promise<CartRequestContext> {
    const cartToken = await ensureCartToken();
    const accessToken = await memberAccessToken();
    return accessToken ? { cartToken, accessToken } : { cartToken };
  }

  return {
    async POST(request, context) {
      const { action } = await context.params;
      let body: Record<string, unknown>;
      try {
        body = await readBody(request);
      } catch {
        return json({ message: "Invalid request body." }, 400);
      }
      try {
        const ctx = await buildContext();
        switch (action) {
          case "cart":
            return json({ cart: await backendGetCart(config, ctx) });
          case "add":
            return json({
              cart: await backendAddToCart(config, ctx, {
                recordId: str(body.recordId),
                quantity: typeof body.quantity === "number" ? body.quantity : 1,
                variantSelections: body.variantSelections as
                  | Record<string, string>
                  | undefined,
                notes: typeof body.notes === "string" ? body.notes : undefined,
              }),
            });
          case "update":
            return json({
              cart: await backendUpdateItem(config, ctx, {
                itemId: str(body.itemId),
                quantity: typeof body.quantity === "number" ? body.quantity : 0,
              }),
            });
          case "remove":
            return json({
              cart: await backendRemoveItem(config, ctx, str(body.itemId)),
            });
          case "clear":
            return json({ cart: await backendClearCart(config, ctx) });
          case "apply-discount":
            return json({
              cart: await backendApplyDiscount(config, ctx, str(body.code)),
            });
          case "remove-discount":
            return json({ cart: await backendRemoveDiscount(config, ctx) });
          case "checkout": {
            const order = await backendCheckout(
              config,
              ctx,
              str(body.customerEmail),
            );
            await clearCartToken();
            return json({ order });
          }
          case "product":
            return json({
              product: await backendProduct(
                config,
                ctx,
                str(body.modelSlug),
                plainObject(body.filter),
              ),
            });
          default:
            return json({ message: "Not found." }, 404);
        }
      } catch (err) {
        return json(
          {
            message:
              err instanceof Error ? err.message : "Commerce request failed",
          },
          502,
        );
      }
    },
  };
}
