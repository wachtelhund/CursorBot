const UPSTREAM = "https://api.cursor.com";

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
  };
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    const incoming = new URL(request.url);
    const target = new URL(incoming.pathname + incoming.search, UPSTREAM);
    const headers = new Headers();
    const auth = request.headers.get("Authorization");
    if (auth) headers.set("Authorization", auth);
    const type = request.headers.get("Content-Type");
    if (type) headers.set("Content-Type", type);
    headers.set("Accept", request.headers.get("Accept") ?? "application/json");
    const response = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    });
    const out = new Headers(response.headers);
    for (const [key, value] of Object.entries(corsHeaders())) out.set(key, value);
    return new Response(response.body, { status: response.status, headers: out });
  },
};
