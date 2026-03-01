import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/", "/login", "/signup"];

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Allow public paths
    if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith("/_next") || pathname.startsWith("/api"))) {
        return NextResponse.next();
    }

    // TODO: Check Supabase auth session when connected
    // For now, allow all routes in development
    return NextResponse.next();
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
