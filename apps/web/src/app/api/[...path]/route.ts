import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3003";

export const maxDuration = 120;

async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const search = req.nextUrl.search;
  const url = `${API_URL}${path}${search}`;

  const headers = new Headers();
  headers.set("Content-Type", req.headers.get("Content-Type") ?? "application/json");
  const cookie = req.headers.get("Cookie");
  if (cookie) headers.set("Cookie", cookie);

  const body = req.method !== "GET" && req.method !== "HEAD"
    ? await req.text()
    : undefined;

  const res = await fetch(url, {
    method: req.method,
    headers,
    body,
    signal: AbortSignal.timeout(120_000),
  });

  const responseHeaders = new Headers();
  res.headers.forEach((value, key) => {
    responseHeaders.set(key, value);
  });

  return new NextResponse(res.body, {
    status: res.status,
    headers: responseHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;
