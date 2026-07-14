import type { ReactNode } from "react";
import { CmssyLayoutSlot } from "@cmssy/next/server";
import { cmssy } from "@/cmssy.config";
import { blocks } from "@/cmssy/blocks";
import { EditableLayout } from "@/cmssy/editable-layout";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        {/* The header and the footer are cmssy layout blocks, so they are
            editable like any other block. CmssyLayoutSlot renders them server-side
            for visitors and through the edit bridge in the editor - rendered
            server-side there, the editor could select them and show no fields. */}
        <CmssyLayoutSlot
          config={cmssy}
          blocks={blocks}
          position="header"
          editable={EditableLayout}
        />
        <main>{children}</main>
        <CmssyLayoutSlot
          config={cmssy}
          blocks={blocks}
          position="footer"
          editable={EditableLayout}
        />
      </body>
    </html>
  );
}
