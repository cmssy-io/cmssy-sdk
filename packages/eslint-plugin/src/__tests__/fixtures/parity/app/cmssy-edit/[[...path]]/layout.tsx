import { CmssyLocaleProvider } from "@/components/cmssy-locale";

export default function EditLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <CmssyLocaleProvider>{children}</CmssyLocaleProvider>;
}
