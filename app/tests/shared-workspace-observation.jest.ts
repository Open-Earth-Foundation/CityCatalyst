import { afterEach, beforeEach, expect, it, jest } from "@jest/globals";
import { shareWorkspaceObservation } from "@/components/ConceptNoteWorkspace/shared-workspace-observation";
import type { ConceptNoteWorkspaceSnapshot } from "@/util/types";

const channels = new Map<string, Set<Channel>>();
class Channel {
  onmessage?: (event: { data: unknown }) => void;
  constructor(readonly name: string) {
    const members = channels.get(name) ?? new Set<Channel>();
    members.add(this);
    channels.set(name, members);
  }
  postMessage(data: unknown) {
    for (const member of channels.get(this.name) ?? []) {
      if (member !== this) queueMicrotask(() => member.onmessage?.({ data }));
    }
  }
  close() {
    channels.get(this.name)?.delete(this);
  }
}
const originalNavigator = Object.getOwnPropertyDescriptor(
  globalThis,
  "navigator",
);
const originalChannel = globalThis.BroadcastChannel;
const controllers: AbortController[] = [];
const jobs: Promise<void>[] = [];
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  const locks = new Map<string, Promise<unknown>>();
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      locks: {
        request: (
          key: string,
          { signal }: { signal: AbortSignal },
          run: () => Promise<void>,
        ) => {
          const previous = locks.get(key) ?? Promise.resolve();
          const job = previous
            .catch(() => {})
            .then(async () => {
              if (signal.aborted)
                throw new DOMException("aborted", "AbortError");
              await run();
            });
          locks.set(key, job);
          return job;
        },
      },
    },
  });
  globalThis.BroadcastChannel = Channel as unknown as typeof BroadcastChannel;
});
afterEach(async () => {
  controllers.splice(0).forEach((controller) => controller.abort());
  await Promise.all(jobs.splice(0));
  channels.clear();
  if (originalNavigator)
    Object.defineProperty(globalThis, "navigator", originalNavigator);
  else Reflect.deleteProperty(globalThis, "navigator");
  globalThis.BroadcastChannel = originalChannel;
});

function start(
  key: string,
  observe: Parameters<typeof shareWorkspaceObservation>[0]["observe"],
) {
  const controller = new AbortController();
  controllers.push(controller);
  const receive = jest.fn();
  const job = shareWorkspaceObservation({
    key,
    signal: controller.signal,
    observe,
    onSnapshot: receive,
  });
  jobs.push(job);
  return { controller, receive, job };
}
const snapshot = {
  sequence: 1,
  draft: { run_id: "run", status: "running" },
} as ConceptNoteWorkspaceSnapshot;

it("uses one connection for two tabs and replays state to a late follower", async () => {
  let publish!: (snapshot: ConceptNoteWorkspaceSnapshot) => void;
  const observe = jest.fn(async (signal: AbortSignal, emit: typeof publish) => {
    publish = emit;
    await new Promise<void>((resolve) =>
      signal.addEventListener("abort", () => resolve(), { once: true }),
    );
  });
  const leader = start("user-1/run", observe);
  await tick();
  publish(snapshot);
  const follower = start("user-1/run", observe);
  await tick();
  expect(observe).toHaveBeenCalledTimes(1);
  expect(leader.receive).toHaveBeenCalledWith(snapshot);
  expect(follower.receive).toHaveBeenCalledWith(snapshot);
  leader.controller.abort();
  await tick();
  expect(observe).toHaveBeenCalledTimes(2);
  follower.controller.abort();
});

it("does not merge observations belonging to different authenticated users", async () => {
  const observe = jest.fn(async (signal: AbortSignal) => {
    await new Promise<void>((resolve) =>
      signal.addEventListener("abort", () => resolve(), { once: true }),
    );
  });
  start("user-1/run", observe);
  start("user-2/run", observe);
  await tick();
  expect(observe).toHaveBeenCalledTimes(2);
});

it("stops followers after completion without starting their queued connection", async () => {
  let complete!: () => void;
  const observe = jest.fn(
    async () =>
      new Promise<void>((resolve) => {
        complete = resolve;
      }),
  );
  start("user-1/run", observe);
  await tick();
  start("user-1/run", observe);
  await tick();
  complete();
  await tick();
  expect(observe).toHaveBeenCalledTimes(1);
});
