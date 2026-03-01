import { GridBackground } from "@/components/shared/GridBackground";

export default function AuthLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <GridBackground className="flex items-center justify-center min-h-screen p-6">
            {children}
        </GridBackground>
    );
}
