// Netlify Function: GitHub Release video proxy
// 1) rewrite Content-Type to video/mp4  (WATERFrAMES decides video-vs-image by Content-Type)
// 2) normalize Range (suffix form, out-of-range) so we never trigger 416/501 or re-fetch the whole file
const UPSTREAM = "https://github.com/qYGSYp/mcvideo/releases/download/v1/movie.mp4";
const SIZE = 1455584986; // file size in bytes; update if the video changes

function normalizeRange(h) {
  if (!h) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(h).trim());
  if (!m) return null; // multi-range or invalid: ignore, serve whole
  let s = m[1], e = m[2];
  if (s === "") {
    // suffix form bytes=-N  ->  last N bytes
    const n = parseInt(e || "1", 10);
    s = String(Math.max(0, SIZE - n));
    e = String(SIZE - 1);
  } else if (e === "") {
    e = String(SIZE - 1);
  }
  let start = parseInt(s, 10);
  let end = parseInt(e, 10);
  if (Number.isNaN(start)) start = 0;
  if (Number.isNaN(end) || end > SIZE - 1) end = SIZE - 1;
  if (start > end || start >= SIZE) {
    // out of range: only return the last byte, avoids 416 and avoids re-fetching the whole file
    start = SIZE - 1;
    end = SIZE - 1;
  }
  return "bytes=" + start + "-" + end;
}

export default async function handler(req) {
  const upstreamRange = normalizeRange(req.headers.get("range"));
  const headers = { "User-Agent": "netlify-video-proxy" };
  if (upstreamRange) headers["Range"] = upstreamRange;

  let up = await fetch(UPSTREAM, { headers, redirect: "follow" });
  if (up.status >= 500) {
    // upstream hiccup: retry once
    up = await fetch(UPSTREAM, { headers, redirect: "follow" });
  }

  const out = new Headers();
  out.set("Content-Type", "video/mp4");
  out.set("Accept-Ranges", "bytes");
  out.set("Access-Control-Allow-Origin", "*");
  out.set("Cache-Control", "no-store");
  const cr = up.headers.get("content-range");
  if (cr) out.set("Content-Range", cr);
  const cl = up.headers.get("content-length");
  if (cl) out.set("Content-Length", cl);

  return new Response(req.method === "HEAD" ? null : up.body, {
    status: up.status,
    headers: out,
  });
}

export const config = { path: "/*" };
