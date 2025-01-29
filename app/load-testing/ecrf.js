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
  Cookie: `__Host-next-auth.csrf-token=fc0ea8cd8c9ad715d8cb739851ab3bf43f886ece6f2a00621db8fb1a3fbb1567%7Cfb928c4646d54840bcbcd473699dceaa6d06c93446ae5a76b700dee8d21950d1; __Secure-next-auth.callback-url=https%3A%2F%2Fcitycatalyst.openearth.dev%2Fen%2F7d7e301e-4204-472c-a8bd-09d47aa6eed5%2F; __Secure-next-auth.session-token=eyJhbGciOiJkaXIiLCJlbmMiOiJBMjU2R0NNIn0..ub_3pRnzK6jbQ53Q.dUis7TWC9O0x4eoQYz3zskg_ErKO2RKKrrm2D7UT53e6PKVM026fAP9-Gzufb72lTiefT-fNjEApf0FMhGC7b4-ETScBc5uKZ21-As4iWiw1n-GA6sGDcpBUYT7t0EqVjno2ABPvueQjRg_tqLvLflFu6uz0NLzm2FuATW7bzrZ_6lJr1ZhfSi0L0qNtinKbMjUsHR8YaI6IndM77KjEYEmynKyyYCJ0S8a-AsVqrf-ab5dgi5Bjpy5X-V-bcXJi0EA.h_8MHuEYjx4FT8V-LBxpMw`,
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
