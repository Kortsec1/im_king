import { datasetRoute } from './dataset.js';
const ALLOWED_ORIGINS = new Set(["https://im-king-lookalike.vercel.app", "http://127.0.0.1:4173", "http://localhost:4173", "http://127.0.0.1:8080", "http://localhost:8080"]);
const cors = (origin) => ({
  "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://im-king-lookalike.vercel.app",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  Vary: "Origin", "Cache-Control": "no-store",
});
const json = (data, status = 200, origin = "") => Response.json(data, { status, headers: cors(origin) });

async function secureEqual(provided, expected) {
  const encoder = new TextEncoder();
  const hashes = await Promise.all([provided, expected].map((value) => crypto.subtle.digest("SHA-256", encoder.encode(value))));
  const left = new Uint8Array(hashes[0]);
  const right = new Uint8Array(hashes[1]);
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left[index] ^ right[index];
  return mismatch === 0;
}
async function authorized(request, env) {
  return secureEqual(request.headers.get("Authorization") || "", `Bearer ${env.WORKER_SECRET}`);
}
async function clientHash(request) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(request.headers.get("CF-Connecting-IP") || "unknown"));
  return [...new Uint8Array(digest)].slice(0, 12).map((value) => value.toString(16).padStart(2, "0")).join("");
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      const origin = request.headers.get("Origin") || "";
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
      if (url.pathname.startsWith('/worker/') && !(await authorized(request, env))) return json({detail:'Unauthorized'},401,origin);
      if (url.pathname.startsWith('/dataset') || url.pathname.startsWith('/worker/dataset')) {
        if (request.method==='POST' && !url.pathname.startsWith('/worker/') && origin && !ALLOWED_ORIGINS.has(origin)) return json({detail:'허용되지 않은 요청입니다.'},403,origin);
        const response=await datasetRoute(request,env,url,origin,json);
        if(response)return response;
      }

      if (request.method === "POST" && url.pathname === "/jobs") {
        const gender=url.searchParams.get('gender')||'auto';
        if(!['auto','male','female'].includes(gender))return json({detail:'성별 선택값을 확인해 주세요.'},400,origin);
        if (!ALLOWED_ORIGINS.has(origin)) return json({ detail: "허용되지 않은 요청입니다." }, 403, origin);
        const type = request.headers.get("Content-Type") || "";
        const length = Number(request.headers.get("Content-Length") || 0);
        if (!/^image\/(jpeg|png|webp)/i.test(type)) return json({ detail: "JPEG, PNG, WebP 이미지만 사용할 수 있습니다." }, 415, origin);
        if (length > 1500 * 1024) return json({ detail: "분석할 이미지는 1.5MB 이하여야 합니다." }, 413, origin);
        const hash = await clientHash(request);
        const now = Date.now();
        const recent = await env.DB.prepare("SELECT COUNT(*) AS count FROM jobs WHERE client_hash=? AND created_at>?").bind(hash, now - 60000).first();
        if ((recent?.count || 0) >= 6) return json({ detail: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." }, 429, origin);
        const body = await request.arrayBuffer();
        if (!body.byteLength || body.byteLength > 1500 * 1024) return json({ detail: "이미지 크기를 확인해 주세요." }, 413, origin);
        const id = crypto.randomUUID();
        await env.DB.prepare("INSERT INTO jobs(id,status,created_at,updated_at,expires_at,client_hash,image,content_type,match_gender) VALUES(?,?,?,?,?,?,?,?,?)").bind(id, "pending", now, now, now + 120000, hash, body, type,gender).run();
        return json({ id, status: "pending" }, 202, origin);
      }

      const publicMatch = url.pathname.match(/^\/jobs\/([0-9a-f-]+)$/);
      if (request.method === "GET" && publicMatch) {
        const job = await env.DB.prepare("SELECT id,status,result,error,expires_at FROM jobs WHERE id=?").bind(publicMatch[1]).first();
        if (!job) return json({ detail: "작업을 찾을 수 없습니다." }, 404, origin);
        if (job.expires_at < Date.now() && !["complete", "failed"].includes(job.status)) return json({ id: job.id, status: "expired", detail: "분석 시간이 초과되었습니다." }, 200, origin);
        return json({ id: job.id, status: job.status, result: job.result ? JSON.parse(job.result) : undefined, detail: job.error || undefined }, 200, origin);
      }

      if (url.pathname.startsWith("/worker/") && !(await authorized(request, env))) return json({ detail: "Unauthorized" }, 401);
      if (request.method === "POST" && url.pathname === "/worker/claim") {
        const now = Date.now();
        await env.DB.prepare("UPDATE jobs SET status='expired',updated_at=? WHERE status IN ('pending','processing') AND expires_at<?").bind(now, now).run();
        const job = await env.DB.prepare("SELECT id FROM jobs WHERE status='pending' ORDER BY created_at LIMIT 1").first();
        if (!job) return new Response(null, { status: 204 });
        const update = await env.DB.prepare("UPDATE jobs SET status='processing',updated_at=? WHERE id=? AND status='pending'").bind(now, job.id).run();
        if (!update.meta.changes) return new Response(null, { status: 204 });
        return json({ id: job.id });
      }

      const inputMatch = url.pathname.match(/^\/worker\/input\/([0-9a-f-]+)$/);
      if (request.method === "GET" && inputMatch) {
        const item = await env.DB.prepare("SELECT image,content_type,match_gender FROM jobs WHERE id=? AND status='processing'").bind(inputMatch[1]).first();
        const bytes = item?.image instanceof ArrayBuffer ? new Uint8Array(item.image) : new Uint8Array(item?.image || []);
        return bytes.byteLength ? new Response(bytes, { headers: { "Content-Type": item.content_type || "image/jpeg",'X-Match-Gender':item.match_gender||'auto' } }) : json({ detail: "Not found" }, 404);
      }

      const finishMatch = url.pathname.match(/^\/worker\/(complete|fail)\/([0-9a-f-]+)$/);
      if (request.method === "POST" && finishMatch) {
        const payload = await request.json();
        const now = Date.now();
        if (finishMatch[1] === "complete") await env.DB.prepare("UPDATE jobs SET status='complete',result=?,image=NULL,updated_at=? WHERE id=?").bind(JSON.stringify(payload), now, finishMatch[2]).run();
        else await env.DB.prepare("UPDATE jobs SET status='failed',error=?,image=NULL,updated_at=? WHERE id=?").bind(String(payload.detail || "분석에 실패했습니다."), now, finishMatch[2]).run();
        return json({ ok: true });
      }
      return json({ detail: "Not found" }, 404, origin);
    } catch (error) {
      console.error(JSON.stringify({ message: "request failed", error: error instanceof Error ? error.message : String(error) }));
      return json({ detail: "서버 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." }, 500, request.headers.get('Origin')||'');
    }
  },

  async scheduled(_controller, env) {
    const now = Date.now();
    const expired = await env.DB.prepare("SELECT COUNT(*) AS count FROM jobs WHERE status IN ('pending','processing') AND expires_at<?").bind(now).first();
    await env.DB.prepare("UPDATE jobs SET status='expired',image=NULL,updated_at=? WHERE status IN ('pending','processing') AND expires_at<?").bind(now, now).run();
    await env.DB.prepare("DELETE FROM jobs WHERE updated_at<?").bind(now - 86400000).run();
    console.log(JSON.stringify({ message: "expired jobs cleaned", count: expired?.count || 0 }));
  },
};
