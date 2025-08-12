import http from "k6/http";
import { sleep, check } from "k6";

export const options = {
  vus: 10,
  duration: "30s",
  thresholds: {
    http_req_duration: ["p(95)<5000"], // 95% of requests must complete below 5s
    http_req_failed: ["rate<0.1"],
  },
};

const BASE_URL = "http://localhost:3000";
// const BASE_URL = 'https://citycatalyst.openearth.dev';

export default function () {
  let res = http.get(`${BASE_URL}/api/auth/csrf`);
  check(res, { "CSRF status is 200": (res) => res.status === 200 });

  res = http.get(`${BASE_URL}/api/auth/signin`);
  check(res, { "Signin status is 200": (res) => res.status === 200 });

  res = http.get(`${BASE_URL}/`);
  check(res, { "Home page status is 200": (res) => res.status === 200 });

  sleep(1);
}
