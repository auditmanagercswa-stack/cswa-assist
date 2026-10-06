import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";

export default function HomeLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="fixed inset-x-0 top-0 z-50">
        <SiteHeader transparent />
      </div>
      <main>{children}</main>
      <SiteFooter />
    </>
  );
}
