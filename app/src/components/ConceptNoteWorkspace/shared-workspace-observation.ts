import type { ConceptNoteWorkspaceSnapshot } from "@/util/types";

type Publish = (snapshot: ConceptNoteWorkspaceSnapshot) => void;

/** Elect one tab to observe an authenticated user's resource selection.
 * Followers receive snapshots locally and take over if the leader leaves.
 * Unsupported browsers retain independent streams (the server still coalesces reads).
 */
export async function shareWorkspaceObservation({
  key,
  signal,
  observe,
  onSnapshot,
}: {
  key: string;
  signal: AbortSignal;
  observe: (signal: AbortSignal, publish: Publish) => Promise<void>;
  onSnapshot: Publish;
}): Promise<void> {
  if (!navigator.locks || typeof BroadcastChannel === "undefined") {
    await observe(signal, onSnapshot);
    return;
  }
  const channel = new BroadcastChannel(key);
  const lifetime = new AbortController();
  const stop = () => lifetime.abort();
  signal.addEventListener("abort", stop, { once: true });
  if (signal.aborted) stop();
  let leader = false;
  let latest: ConceptNoteWorkspaceSnapshot | undefined;
  channel.onmessage = ({ data }) => {
    if (lifetime.signal.aborted) return;
    if (data?.type === "hello" && leader && latest) {
      channel.postMessage({ type: "snapshot", snapshot: latest });
    } else if (data?.type === "snapshot" && !leader && data.snapshot) {
      onSnapshot(data.snapshot);
    } else if (data?.type === "done" && !leader) {
      stop();
    }
  };
  channel.postMessage({ type: "hello" });
  try {
    await navigator.locks.request(
      key,
      { signal: lifetime.signal },
      async () => {
        if (lifetime.signal.aborted) return;
        leader = true;
        await observe(lifetime.signal, (snapshot) => {
          latest = { ...latest, ...snapshot };
          onSnapshot(snapshot);
          channel.postMessage({ type: "snapshot", snapshot: latest });
        });
        if (!lifetime.signal.aborted) channel.postMessage({ type: "done" });
      },
    );
  } catch (error) {
    if (!lifetime.signal.aborted) throw error;
  } finally {
    signal.removeEventListener("abort", stop);
    channel.close();
  }
}
