"use client";

import { useRef, useState, useCallback, useEffect } from "react";

/**
 * Result of checking whether a poll response is terminal.
 * - done: true, success: true → terminal success (e.g. completed, waiting_for_approval)
 * - done: true, success: false → terminal failure (e.g. failed)
 * - done: false → keep polling
 */
export type PollTerminalResult<T> =
  | { done: true; success: true; data: T }
  | { done: true; success: false; data: T }
  | { done: false };

export interface UsePollUntilOptions<T> {
  /** Called every interval; must return the current status payload. */
  fetch: () => Promise<T>;
  /** Determines if the payload is a terminal state (success or failure) or should keep polling. */
  isTerminal: (data: T) => PollTerminalResult<T>;
  /** Called once when isTerminal returns { done: true, success: true }. */
  onSuccess: (data: T) => void;
  /** Called once when isTerminal returns { done: true, success: false }. */
  onFailure: (data: T) => void;
  /** Optional: called on every successful fetch before checking isTerminal (e.g. to update progress). */
  onTick?: (data: T) => void;
  /** Optional: called when fetch throws; polling continues unless you call stopPolling. */
  onPollError?: (err: unknown) => void;
  /** Poll interval in ms. Default 3000. */
  intervalMs?: number;
}

export interface UsePollUntilReturn {
  /** Start polling. Clears any existing interval and resets the "handled" guard. */
  startPolling: () => void;
  /** Stop polling and clear the interval. */
  stopPolling: () => void;
  /** True while the interval is active. */
  isPolling: boolean;
}

const DEFAULT_INTERVAL_MS = 3000;

/**
 * Reusable polling hook for async operations that return 202 and complete in the background.
 * Call startPolling() after receiving 202; the hook will poll fetch() every intervalMs until
 * isTerminal() returns done: true, then call onSuccess or onFailure once and stop.
 * Uses a "handled" ref so success/failure callbacks run only once even if the interval fires again.
 */
export function usePollUntil<T>({
  fetch: fetchFn,
  isTerminal,
  onSuccess,
  onFailure,
  onTick,
  onPollError,
  intervalMs = DEFAULT_INTERVAL_MS,
}: UsePollUntilOptions<T>): UsePollUntilReturn {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const handledRef = useRef(false);
  const [isPolling, setIsPolling] = useState(false);

  const optionsRef = useRef({
    fetchFn,
    isTerminal,
    onSuccess,
    onFailure,
    onTick,
    onPollError,
    intervalMs,
  });
  optionsRef.current = {
    fetchFn,
    isTerminal,
    onSuccess,
    onFailure,
    onTick,
    onPollError,
    intervalMs,
  };

  const stopPolling = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsPolling(false);
  }, []);

  const startPolling = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    handledRef.current = false;
    setIsPolling(true);

    intervalRef.current = setInterval(async () => {
      const { fetchFn: f, isTerminal: isTerm, onSuccess: ok, onFailure: fail, onTick: tick, onPollError: onErr } =
        optionsRef.current;
      try {
        const data = await f();
        if (handledRef.current) return;
        tick?.(data);
        const result = isTerm(data);
        if (!result.done) return;
        handledRef.current = true;
        if (intervalRef.current !== null) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        setIsPolling(false);
        if (result.success) ok(result.data);
        else fail(result.data);
      } catch (err) {
        optionsRef.current.onPollError?.(err);
      }
    }, optionsRef.current.intervalMs);
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  return { startPolling, stopPolling, isPolling };
}
