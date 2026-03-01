"use client";

import { motion } from "framer-motion";
import { GridBackground } from "@/components/shared/GridBackground";

export default function AuthLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <GridBackground className="flex items-center justify-center min-h-screen p-6">
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="w-full max-w-[420px]"
            >
                {children}
            </motion.div>
        </GridBackground>
    );
}
