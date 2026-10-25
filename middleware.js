// middleware.js
// Password protection for the whole app (pages and API routes) using HTTP
// Basic Auth. Your browser shows a username/password box once and remembers it.
//
// Set DASHBOARD_USER and DASHBOARD_PASSWORD in .env.local to switch it on.
// If either is missing the app stays open, which is fine on your own PC.
//
// The daily cron call to /api/run is let through only when it carries the
// correct x-cron-secret header; the route checks that secret again itself.

import { NextResponse } from "next/server";

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function middleware(request) {
  const user = process.env.DASHBOARD_USER;
  const pass = process.env.DASHBOARD_PASSWORD;
  if (!user || !pass) {
    // Never run an open dashboard on the internet: in production, a missing
    // login means the app refuses to serve anything.
    if (process.env.NODE_ENV === "production") {
      return new NextResponse("Dashboard login is not configured", {
        status: 503,
      });
    }
    return NextResponse.next();
  }

  const cronSecret = process.env.CRON_SECRET;
  if (
    request.nextUrl.pathname === "/api/run" &&
    cronSecret &&
    request.headers.get("x-cron-secret") === cronSecret
  ) {
    return NextResponse.next();
  }

  const header = request.headers.get("authorization") || "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    try {
      const decoded = atob(encoded);
      const i = decoded.indexOf(":");
      if (
        i > -1 &&
        safeEqual(decoded.slice(0, i), user) &&
        safeEqual(decoded.slice(i + 1), pass)
      ) {
        return NextResponse.next();
      }
    } catch (err) {
      // malformed header, fall through to the 401 below
    }
  }

  return new NextResponse("Login required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Job Pipeline", charset="UTF-8"',
    },
  });
}

// Everything except Next's static files.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
