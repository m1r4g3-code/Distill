import { GridBackground } from "@/components/shared/GridBackground";
import { MarketingNav } from "@/components/layout/MarketingNav";

export default function MarketingLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <GridBackground>
            <MarketingNav />
            <main>{children}</main>
        </GridBackground>
    );
}
