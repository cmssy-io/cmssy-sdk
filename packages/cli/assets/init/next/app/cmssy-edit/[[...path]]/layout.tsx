import type { ReactNode } from "react";
import { resolveCmssyLocale } from "@cmssy/core";
import { cmssy } from "@/cmssy.config";

type LayoutProps = {
  children: ReactNode;
  params: Promise<{ path?: string[] }>;
};

export default async function EditRootLayout({ children, params }: LayoutProps) {
  const { path } = await params;
  const locale = await resolveCmssyLocale(cmssy, path);

  return (
    <html lang={locale}>
      <body>{children}</body>
    </html>
  );
}
