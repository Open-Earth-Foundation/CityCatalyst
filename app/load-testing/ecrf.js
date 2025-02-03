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
    "https://citycatalyst.openearth.dev/api/v0/inventory/7d7e301e-4204-472c-a8bd-09d47aa6eed5/download/?format=ecrf&lng=en",
    {
      headers,
    },
  );

  console.log(`Response Status: ${res.status}`);
  console.log(`Content-Type: ${res.headers["Content-Type"]}`);
  console.log(`Response Size: ${res.body.length} bytes`); // File size
  console.log(`Time Breakdown:`);
  console.log(`  ⏳ DNS Lookup: ${res.timings.blocked}ms`);
  console.log(`  🔗 TCP Connection: ${res.timings.connecting}ms`);
  console.log(`  🔒 TLS Handshake: ${res.timings.tls_handshaking}ms`);
  console.log(`  📡 Waiting for First Byte (TTFB): ${res.timings.waiting}ms`);
  console.log(`  📥 Download Time: ${res.timings.receiving}ms`);
  console.log(`  🏁 Total Duration: ${res.timings.duration}ms`);

  check(res, {
    "is status 200": (r) => r.status === 200,
    "Response is an Excel file": (r) =>
      r.headers["Content-Type"] === "application/vnd.ms-excel",
    "response size is reasonable": (r) => r.body.length > 1000, // Ensure file is non-empty
  });
}
