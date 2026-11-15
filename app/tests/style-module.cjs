module.exports = new Proxy(
  {},
  {
    get: (_target, key) => (key === "__esModule" ? undefined : key),
  },
);
