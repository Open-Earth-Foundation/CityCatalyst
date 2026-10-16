// Invoked through docker exec in the unhealthy container after SIGUSR1.
// Inspector listens only on container loopback and is never published.
// Record code locations only, not local variables, request bodies or secrets.
const deadline = setTimeout(() => process.exit(1), 8000);
let targets;
for (let attempt = 0; attempt < 10; attempt++) {
  try {
    targets = await (await fetch("http://127.0.0.1:9229/json/list", {
      signal: AbortSignal.timeout(500),
    })).json();
    break;
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
if (!targets?.[0]?.webSocketDebuggerUrl) throw new Error("Inspector unavailable");
const socket = new WebSocket(targets[0].webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});
let sequence = 0;
const pending = new Map();
const scripts = new Map();
let onPaused;
const paused = new Promise((resolve) => { onPaused = resolve; });
socket.addEventListener("message", ({ data }) => {
  const message = JSON.parse(data);
  if (message.method === "Debugger.scriptParsed") {
    scripts.set(message.params.scriptId, message.params.url);
  }
  if (message.method === "Debugger.paused") onPaused(message.params);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  }
});
function send(method) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method }));
  });
}
try {
  await send("Debugger.enable");
  await send("Debugger.pause");
  const state = await paused;
  console.log(JSON.stringify({
    capturedAt: new Date().toISOString(),
    reason: state.reason,
    frames: state.callFrames.map((frame) => ({
      functionName: frame.functionName,
      url: frame.url || scripts.get(frame.location.scriptId),
      line: frame.location.lineNumber + 1,
      column: frame.location.columnNumber + 1,
    })),
  }, null, 2));
} finally {
  await send("Debugger.resume").catch(() => {});
  socket.close();
  clearTimeout(deadline);
}
