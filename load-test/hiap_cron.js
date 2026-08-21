import http from "k6/http";
import { check } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

const cronDuration = new Trend("hiap_cron_duration", true);
const cronErrors = new Rate("hiap_cron_errors");
const cron5xx = new Rate("hiap_cron_5xx");
const unexpectedPayload = new Counter("hiap_cron_unexpected_payload");

const BASE_URL = (__ENV.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const CRON_API_KEY = __ENV.CRON_API_KEY;
const RATE = Number(__ENV.RATE || 1);
const DURATION = __ENV.DURATION || "5m";
const PRE_ALLOCATED_VUS = Number(__ENV.PRE_ALLOCATED_VUS || 5);
const MAX_VUS = Number(__ENV.MAX_VUS || 20);

if (!CRON_API_KEY) {
  throw new Error("CRON_API_KEY is required; refusing to run unauthenticated load");
}

export const options = {
  scenarios: {
    hiap_cron_polling: {
      executor: "constant-arrival-rate",
      rate: RATE,
      timeUnit: "1s",
      duration: DURATION,
      preAllocatedVUs: PRE_ALLOCATED_VUS,
      maxVUs: MAX_VUS,
      gracefulStop: "10s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<2000", "p(99)<5000"],
    hiap_cron_errors: ["rate<0.01"],
    hiap_cron_5xx: ["rate==0"],
    hiap_cron_duration: ["p(95)<2000"],
    hiap_cron_unexpected_payload: ["count==0"],
  },
};

export default function () {
  const response = http.get(`${BASE_URL}/api/v1/cron/check-hiap-jobs`, {
    headers: {
      Authorization: `Bearer ${CRON_API_KEY}`,
      "X-Load-Test-Run": __ENV.RUN_ID || "hiap-cron-load-test",
    },
    tags: {
      endpoint: "check-hiap-jobs",
    },
  });

  const payload = (() => {
    try {
      return response.json();
    } catch {
      return null;
    }
  })();
  const hasExpectedShape =
    response.status === 200 &&
    payload !== null &&
    typeof payload.checkedJobs === "number" &&
    typeof payload.completedJobs === "number" &&
    typeof payload.startedBatches === "number" &&
    typeof payload.durationMs === "number" &&
    !Object.prototype.hasOwnProperty.call(payload, "catalogBackfilled") &&
    !Object.prototype.hasOwnProperty.call(payload, "actionPlansBackfilled");

  check(response, {
    "HIAP cron returns HTTP 200": (res) => res.status === 200,
    "HIAP cron response has polling-only contract": () => hasExpectedShape,
  });

  cronDuration.add(response.timings.duration);
  cronErrors.add(response.status >= 400 || !hasExpectedShape);
  cron5xx.add(response.status >= 500);
  if (!hasExpectedShape) unexpectedPayload.add(1);
}
