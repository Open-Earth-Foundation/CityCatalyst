import http from "k6/http";
import { sleep, check } from "k6";

export const options = {
  vus: 10, // Number of concurrent virtual users
  duration: "30s", // Test duration
  thresholds: {
    http_req_duration: ["p(95)<5000"], // 95% of requests must complete below 5s
    http_req_failed: ["rate<0.1"], // Allow up to 10% failure rate
  },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
// Dev URL - uncomment for dev deployment load testing
// const BASE_URL = 'https://citycatalyst.openearth.dev';

function makeRequest(endpoint: string, checkName: string) {
  const res = http.get(`${BASE_URL}${endpoint}`);
  check(res, { [`${checkName} status is 200`]: (res) => res.status === 200 });
  return res;
}

export default function () {
  // TODO consider batching requests for better performance
  /* const responses = http.batch([
    ["GET", `${BASE_URL}/api/auth/csrf`],
    ["GET", `${BASE_URL}/api/auth/signin`],
    ["GET", `${BASE_URL}/`],
  ]); */
  makeRequest("/", "Home page");

  makeRequest("/api/auth/csrf", "CSRF");
  let res = http.post(`${BASE_URL}/api/auth/signin`, {
    email: "test@example.com",
    password: "testpassword",
  });
  check(res, { "signin status is 200": (res) => res.status === 200 });

  // Random sleep between 0-3 seconds for more realistic user load
  sleep(Math.random() * 3);
}
