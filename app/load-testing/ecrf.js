import http from "k6/http";
import { check } from "k6";

export let options = {
  vus: 50,
  duration: "10s",
  thresholds: {
    http_req_duration: ["p(95)<5000"], // 95% of requests must complete below 5s
    http_req_failed: ["rate<0.1"],
  },
};

// Temporary headers to bypass authentication
const headers = {
  Cookie: __ENV.LOAD_TESTING_COOKIE, // when running the load test use the command k6 run -e LOAD_TESTING_COOKIE="your_cookie_value" script.js
  Accept: "application/vnd.ms-excel",
  responseType: "binary",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
};

export default function () {
  let res = http.get(
    __ENV.LOAD_TESTING_URL, // when running the load test use the command k6 run -e LOAD_TESTING_URL="your_url" script.js
    {
      headers,
    },
  );

  console.log(
    JSON.stringify(
      {
        status: res.status,
        contentType: res.headers["Content-Type"],
        size: res.body.length,
        timings: res.timings,
      },
      null,
      2,
    ),
  );

  check(res, {
    "is status 200": (r) => r.status === 200,
    "Response is an Excel file": (r) =>
      r.headers["Content-Type"] === "application/vnd.ms-excel",
    "response size is reasonable": (r) => r.body.length > 1000, // Ensure file is non-empty
  });
}
