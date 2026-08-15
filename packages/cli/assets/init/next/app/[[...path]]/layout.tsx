import type { ReactNode } from "react";
import { resolveCmssyLocale } from "@cmssy/core";
import { cmssy } from "@/cmssy.config";
import { SiteProviders } from "@/cmssy/site-providers";

type LayoutProps = {
  children: ReactNode;
  params: Promise<{ path?: string[] }>;
};

export default async function RootLayout({ children, params }: LayoutProps) {
  const { path } = await params;
  const locale = await resolveCmssyLocale(cmssy, path);

  return (
    <html lang={locale}>
      <body>
        <SiteProviders>{children}</SiteProviders>
      </body>
    </html>
  );
}
