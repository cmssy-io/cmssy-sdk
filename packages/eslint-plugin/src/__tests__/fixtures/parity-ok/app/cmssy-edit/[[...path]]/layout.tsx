import { CmssyLocaleProvider } from "@/components/cmssy-locale";
import { MotionProvider } from "@/components/motion/provider";

export default function EditLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CmssyLocaleProvider>
      <MotionProvider>{children}</MotionProvider>
    </CmssyLocaleProvider>
  );
}
