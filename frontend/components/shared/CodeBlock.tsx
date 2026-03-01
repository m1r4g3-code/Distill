"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface CodeBlockProps {
    code: string;
    language?: string;
    showLineNumbers?: boolean;
    className?: string;
}

export function CodeBlock({
    code,
    language = "bash",
    showLineNumbers = false,
    className,
}: CodeBlockProps) {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const lines = code.split("\n");

    return (
        <div
            className={cn(
                "relative group rounded-xl border border-border-subtle bg-surface-elevated overflow-hidden",
                className
            )}
        >
            {/* Header bar */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-border-subtle">
                <span className="text-xs font-mono text-text-muted uppercase tracking-wider">
                    {language}
                </span>
                <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
                >
                    {copied ? (
                        <>
                            <Check size={12} />
                            Copied
                        </>
                    ) : (
                        <>
                            <Copy size={12} />
                            Copy
                        </>
                    )}
                </button>
            </div>

            {/* Code content */}
            <div className="overflow-x-auto">
                <pre className="p-4 text-sm leading-relaxed">
                    <code className="font-mono text-text-primary">
                        {lines.map((line, i) => (
                            <div key={i} className="flex">
                                {showLineNumbers && (
                                    <span className="select-none pr-4 text-text-muted text-right w-8 shrink-0">
                                        {i + 1}
                                    </span>
                                )}
                                <span className="flex-1 whitespace-pre">{line}</span>
                            </div>
                        ))}
                    </code>
                </pre>
            </div>
        </div>
    );
}
