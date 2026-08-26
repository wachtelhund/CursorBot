const port = process.env.CDP_PORT || "9223";
const text = process.argv[2] || "Svara med exakt ett ord: pong.";

async function pages() {
  const res = await fetch(`http://127.0.0.1:${port}/json/list`);
  if (!res.ok) throw new Error(`CDP ${res.status}`);
  return res.json();
}

function cdp(url, method, params, id) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error(`CDP timeout: ${method}`));
    }, 20000);
    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ id, method, params }));
    });
    ws.addEventListener("message", (event) => {
      const data = JSON.parse(String(event.data));
      if (data.id !== id) return;
      clearTimeout(timer);
      ws.close();
      if (data.error) reject(new Error(data.error.message || method));
      else resolve(data.result);
    });
    ws.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("CDP socket error"));
    });
  });
}

const list = await pages();
const page = list.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
if (!page) {
  console.error(JSON.stringify({ ok: false, error: "Ingen renderer", list }, null, 2));
  process.exit(1);
}

const expr = `(() => {
  const api = window.cursorBots;
  if (!api || typeof api.sendMessage !== "function") {
    return Promise.resolve({
      ok: false,
      error: "sendMessage saknas",
      keys: api ? Object.keys(api) : [],
    });
  }
  return (async () => {
    const bots = await api.listBots();
    const settings = await api.getSettings();
    if (bots.length === 0) return { ok: false, error: "Inga bots", hasApiKey: settings.hasApiKey };
    const bot = bots[0];
    const first = new Promise((resolve) => {
      const stop = api.onEvent((event) => {
        if (event.botId !== bot.id) return;
        if (event.type === "append" || event.type === "error") {
          stop();
          resolve(event);
        }
      });
      setTimeout(() => {
        stop();
        resolve({ type: "timeout" });
      }, 15000);
    });
    let sent;
    try {
      sent = await api.sendMessage({ text: ${JSON.stringify(text)}, botId: bot.id });
    } catch (error) {
      return { ok: false, error: String(error && error.message ? error.message : error), hasApiKey: settings.hasApiKey, bot: bot.name };
    }
    const event = await first;
    return {
      ok: event.type === "append" || Boolean(sent && sent.targetIds && sent.targetIds.length),
      sent,
      eventType: event.type,
      hasApiKey: settings.hasApiKey,
      bot: bot.name,
      botId: bot.id,
      error: event.type === "error" ? event.message : undefined,
    };
  })();
})()`;

const result = await cdp(
  page.webSocketDebuggerUrl,
  "Runtime.evaluate",
  { expression: expr, awaitPromise: true, returnByValue: true },
  1,
);

const value = result?.result?.value ?? result;
console.log(JSON.stringify(value, null, 2));
if (!value?.ok) process.exit(1);
