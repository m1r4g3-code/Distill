/* UI-specific types */

export interface NavItem {
    label: string;
    href: string;
    icon?: string;
}

export interface StatCard {
    label: string;
    value: string | number;
    change?: number;
    changeLabel?: string;
    icon?: string;
}

export type PlaygroundTab = "scrape" | "map" | "search" | "agent";

export interface TabItem {
    id: PlaygroundTab;
    label: string;
    description: string;
}

export type DocsSection =
    | "introduction"
    | "authentication"
    | "base-url"
    | "rate-limits"
    | "error-codes"
    | "scrape"
    | "map"
    | "search"
    | "agent-extract"
    | "job-lifecycle"
    | "polling"
    | "status-codes"
    | "creating-keys"
    | "revoking-keys"
    | "curl"
    | "python"
    | "javascript";
