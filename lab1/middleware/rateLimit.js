const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = rateLimit;

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    error: "Zbyt wiele requestow. Sprobuj ponownie za 15 minut.",
  },
  skip: (req) => req.path === "/health" || req.path.startsWith("/auth/"),
  standardHeaders: true,
  legacyHeaders: false,
});

const healthLimiter = rateLimit({
  windowMs: 100,
  max: 50,
  message: {
    error: "Zbyt wiele requestow. Sprobuj ponownie za chwile.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  skipFailedRequests: true,
  keyGenerator: (req) => {
    const email =
      typeof req.body?.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";
    const ipKey = ipKeyGenerator(req.ip);
    return `${ipKey}:${email}`;
  },
  message: {
    error: "Zbyt wiele prob logowania. Poczekaj minute.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  globalLimiter,
  healthLimiter,
  authLimiter,
};
