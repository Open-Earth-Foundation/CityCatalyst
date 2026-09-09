"use client";
import { useCallback, useRef, useState } from "react";
import {
  useLazyGetMeedPlanQuery,
  useRunMeedGeneratePlanMutation,
} from "@/services/api";
import { isFetchBaseQueryError } from "@/util/helpers";
import type { MeedPlanRouteReport } from "@/util/types/meed";
import {
  toReportDocument,
  type MeedReportActionDocument,
  type MeedReportInput,
} from "./reportDocument";

export interface MeedReportResult {
  documents: MeedReportActionDocument[];
  /** Names of actions whose report could not be produced. */
  failed: string[];
}

export interface MeedReportTarget {
  actionId: string;
  actionName: string;
}

export interface MeedReportProgress {
  /** Actions finished, successfully or not. */
  done: number;
  total: number;
  /** The action being worked on, for a live detail line. */
  current: string | null;
  /** Actions whose report could not be produced. */
  failed: string[];
}

/**
 * True only for the "nothing stored for this action yet" case.
 *
 * The route 404s when no report exists, which is the normal first-run path.
 * Every other status is a real failure: a 401 means the session is gone, a 5xx
 * means the service is unwell, and neither is fixed by asking for a fresh
 * report. Treating them as "not generated yet" would fire a 10-30 s LLM call
 * per selected action against a backend that just told us it cannot serve us.
 */
export function isReportNotFound(error: unknown): boolean {
  return isFetchBaseQueryError(error) && error.status === 404;
}

const IDLE: MeedReportProgress = {
  done: 0,
  total: 0,
  current: null,
  failed: [],
};

/**
 * Generates reports for the selected actions and hands back a document.
 *
 * Three things shape this:
 *
 * **One call per action.** `actionId` is singular upstream, so a multi-action
 * report is N generations. Ten selected actions is ten LLM calls, which is why
 * this reports progress rather than showing a spinner.
 *
 * **Sequential, not parallel.** hiap-meed caps concurrent reports per pod and
 * returns 429 once the queue wait is exceeded, so firing ten at once would make
 * some of them fail by design.
 *
 * **Existing reports are reused.** They are stored server-side precisely so a
 * second look does not cost another 10–30 s call, so each action is fetched
 * first; a 404 there means "not generated yet", not an error.
 */
export function useMeedReport(cityId: string, inventoryId: string) {
  const [fetchPlan] = useLazyGetMeedPlanQuery();
  const [generatePlan] = useRunMeedGeneratePlanMutation();

  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<MeedReportProgress>(IDLE);
  const running = useRef(false);

  const generate = useCallback(
    async (
      targets: MeedReportTarget[],
      language: string,
    ): Promise<MeedReportResult | null> => {
      if (running.current || targets.length === 0) return null;
      running.current = true;
      setIsRunning(true);
      setProgress({ ...IDLE, total: targets.length });

      const collected: MeedReportInput[] = [];
      const failed: string[] = [];

      try {
        for (const [index, target] of targets.entries()) {
          setProgress({
            done: index,
            total: targets.length,
            current: target.actionName,
            failed: [...failed],
          });

          let report: MeedPlanRouteReport | null = null;
          try {
            report = await fetchPlan({
              cityId,
              inventoryId,
              actionId: target.actionId,
            }).unwrap();
          } catch (error) {
            // Only a 404 means "not generated yet". Anything else is a fetch
            // failure that affects every remaining action too, so it aborts
            // the run rather than being recorded as a per-action miss.
            if (!isReportNotFound(error)) throw error;
            report = null;
          }

          if (!report) {
            try {
              report = await generatePlan({
                cityId,
                body: {
                  inventoryId,
                  actionId: target.actionId,
                  languages: [language],
                },
              }).unwrap();
            } catch {
              // A generation that fails is per-action: the next one may well
              // succeed, so the run continues and names this one at the end.
              failed.push(target.actionName);
              report = null;
            }
          }

          collected.push({ ...target, report });
        }

        setProgress({
          done: targets.length,
          total: targets.length,
          current: null,
          failed,
        });
      } finally {
        // Whatever happened, the guard has to open again or the button is
        // dead for the rest of the session.
        running.current = false;
        setIsRunning(false);
      }

      // Failed actions are dropped from the document but returned alongside
      // it, so the caller names what is missing rather than handing over a
      // short report with no explanation.
      return { documents: toReportDocument(collected, language), failed };
    },
    [cityId, inventoryId, fetchPlan, generatePlan],
  );

  return { generate, isRunning, progress };
}
