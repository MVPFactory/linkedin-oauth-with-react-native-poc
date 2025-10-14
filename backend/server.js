const express = require("express");
const passport = require("passport");
const LinkedInStrategy = require("passport-linkedin-oauth2").Strategy;
const session = require("express-session");
const axios = require("axios");
const crypto = require("crypto");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// ensure correct protocol/host when behind a proxy (ngrok, render, vercel)
app.set("trust proxy", 1);

/* ──────────────────────────────
   Session middleware
────────────────────────────── */
app.use(
  session({
    secret: process.env.SESSION_SECRET || "your-secret-key",
    resave: false,
    saveUninitialized: false,
  })
);

/* ──────────────────────────────
   Passport (OpenID Connect)
────────────────────────────── */
app.use(passport.initialize());
app.use(passport.session());

/* ──────────────────────────────
   In-memory App Bearer Token Store
   - Maps opaque app tokens -> user object with LinkedIn access token
   - For demo purposes only; replace with persistent store in production
────────────────────────────── */
const APP_TOKEN_TTL_MS = Number(
  process.env.APP_TOKEN_TTL_MS || 24 * 60 * 60 * 1000
);
const appTokenToUser = new Map(); // token -> { user, expiresAt }

function generateAppToken() {
  return crypto.randomBytes(32).toString("hex");
}

function storeUserForToken(user) {
  const token = generateAppToken();
  const expiresAt = Date.now() + APP_TOKEN_TTL_MS;
  appTokenToUser.set(token, { user, expiresAt });
  return token;
}

function resolveUserFromToken(token) {
  const entry = appTokenToUser.get(token);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    appTokenToUser.delete(token);
    return null;
  }
  return entry.user;
}

// Best-effort periodic cleanup (non-blocking)
setInterval(() => {
  const now = Date.now();
  for (const [t, v] of appTokenToUser.entries()) {
    if (v.expiresAt <= now) appTokenToUser.delete(t);
  }
}, 10 * 60 * 1000).unref();

passport.use(
  new LinkedInStrategy(
    {
      clientID: process.env.LINKEDIN_CLIENT_ID,
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
      callbackURL:
        process.env.LINKEDIN_CALLBACK_URL ||
        "http://localhost:3000/auth/linkedin/callback",
      // OIDC scopes only; w_member_social kept for posts (gracefully handled)
      scope: ["openid", "profile", "email", "w_member_social"],
      // IMPORTANT: don't let the library call legacy /v2/me parser
      skipUserProfile: true,
    },
    async (accessToken, refreshToken, params, profile, done) => {
      try {
        // OIDC userinfo (works with "Sign In with LinkedIn using OpenID Connect")
        const { data: userinfo } = await axios.get(
          "https://api.linkedin.com/v2/userinfo",
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        const user = {
          ...userinfo, // name, email, sub, picture (if present)
          accessToken, // kept only in session (never returned from APIs)
        };

        done(null, user);
      } catch (err) {
        console.error(
          "LinkedIn userinfo error:",
          err?.response?.data || err.message
        );
        done(err);
      }
    }
  )
);

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

/* ──────────────────────────────
   App middleware
────────────────────────────── */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Minimal request logger
app.use((req, _res, next) => {
  try {
    console.log(`[req] ${req.method} ${req.originalUrl}`);
  } catch (_) {}
  next();
});

/* ──────────────────────────────
   Bearer auth for mobile apps
   - If Authorization: Bearer <appToken> is provided, attach user to req
────────────────────────────── */
app.use((req, _res, next) => {
  if (!req.user) {
    const auth = req.headers["authorization"] || "";
    const match = auth.match(/^Bearer\s+(.+)$/i);
    if (match) {
      const token = match[1];
      const user = resolveUserFromToken(token);
      const prefix = typeof token === "string" ? token.slice(0, 8) : "";
      if (user) {
        req.user = user;
        try {
          console.log(
            `[auth] bearer resolved prefix=${prefix} sub=${user?.sub || ""}`
          );
        } catch (_) {}
      } else {
        try {
          console.warn(`[auth] bearer not resolved prefix=${prefix}`);
        } catch (_) {}
      }
    } else if (auth) {
      try {
        console.warn(`[auth] authorization header present but not Bearer`);
      } catch (_) {}
    }
  }
  next();
});

/* ──────────────────────────────
   Session info (sanitized)
   - Works with cookie session OR Bearer app token
────────────────────────────── */
app.get("/api/session", (req, res) => {
  if (!req.user) return res.json({ authenticated: false });

  const {
    accessToken, // do not expose
    posts = [],
    name,
    given_name,
    family_name,
    email,
    sub,
    picture,
    profile, // not used but kept if you later enrich
    ...rest
  } = req.user;

  const sanitizedUser = {
    name,
    given_name,
    family_name,
    email,
    sub,
    picture,
    profile,
  };
  return res.json({ authenticated: true, user: sanitizedUser, posts });
});

/* ──────────────────────────────
   Live profile fetch (OIDC only)
   NOTE: removed /v2/me to avoid 403 me.GET.NO_VERSION under OIDC
────────────────────────────── */
app.get("/api/profile", async (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Unauthenticated" });
  const accessToken = req.user.accessToken;
  try {
    const { data } = await axios.get("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return res.json(data);
  } catch (e) {
    const status = e?.response?.status || 500;
    return res.status(status).json({ error: e?.response?.data || e.message });
  }
});

// Removed older listing endpoints; keep only create post API
/* ──────────────────────────────
   List my posts (UGC v2)
   - Returns recent UGC posts for the authenticated user
────────────────────────────── */
app.get("/api/posts", async (req, res) => {
  if (!req.user) {
    try {
      console.warn(
        `[posts:list] unauthorized; authHeader=${Boolean(
          req.headers["authorization"]
        )}`
      );
    } catch (_) {}
    return res.status(401).json({ error: "Unauthenticated" });
  }
  const accessToken = req.user.accessToken;
  const sub = String(req.user.sub || "");
  const personUrn = sub.startsWith("urn:li:person:")
    ? sub
    : `urn:li:person:${sub}`;

  const authHeaders = { Authorization: `Bearer ${accessToken}` };
  const restHeaders = {
    ...authHeaders,
    "LinkedIn-Version": "202405",
    "X-Restli-Protocol-Version": "2.0.0",
  };

  try {
    console.log(`[posts:list] request by ${personUrn}`);
    // Try modern REST posts endpoint first
    try {
      const { data } = await axios.get("https://api.linkedin.com/rest/posts", {
        headers: restHeaders,
        params: { q: "authors", authors: `List(${personUrn})`, count: 10 },
      });
      const elements = Array.isArray(data?.elements) ? data.elements : [];
      console.log(`[posts:list] rest/posts success count=${elements.length}`);
      if (elements.length > 0) return res.json({ elements, source: "rest" });
    } catch (restErr) {
      // Continue to legacy v2 fallbacks
      const status = restErr?.response?.status || "";
      const msg = restErr?.response?.data?.message || restErr.message || "";
      console.warn(
        `[posts:list] rest/posts failed status=${status} msg=${msg}`
      );
    }

    const warnings = [];
    let elements = [];

    // v2 ugcPosts
    try {
      const { data } = await axios.get("https://api.linkedin.com/v2/ugcPosts", {
        headers: authHeaders,
        params: { q: "authors", authors: `List(${personUrn})`, count: 10 },
      });
      elements = elements.concat(
        Array.isArray(data?.elements) ? data.elements : []
      );
    } catch (e) {
      warnings.push(
        `v2/ugcPosts error: ${e?.response?.status || ""} ${
          e?.response?.data?.message || e.message || ""
        }`
      );
      const status = e?.response?.status || "";
      const msg = e?.response?.data?.message || e.message || "";
      console.warn(
        `[posts:list] v2/ugcPosts failed status=${status} msg=${msg}`
      );
    }

    // v2 shares
    try {
      const { data } = await axios.get("https://api.linkedin.com/v2/shares", {
        headers: authHeaders,
        params: { q: "owners", owners: `List(${personUrn})`, count: 10 },
      });
      elements = elements.concat(
        Array.isArray(data?.elements) ? data.elements : []
      );
    } catch (e) {
      warnings.push(
        `v2/shares error: ${e?.response?.status || ""} ${
          e?.response?.data?.message || e.message || ""
        }`
      );
      const status = e?.response?.status || "";
      const msg = e?.response?.data?.message || e.message || "";
      console.warn(`[posts:list] v2/shares failed status=${status} msg=${msg}`);
    }

    if (elements.length > 0) {
      console.log(
        `[posts:list] v2 fallback success count=${elements.length} warnings=${warnings.length}`
      );
      return res.json({ elements, source: "v2", warnings });
    }

    console.warn(
      `[posts:list] no posts found via REST or v2; warnings=${warnings.length}`
    );
    return res.status(404).json({
      error: {
        status: 404,
        code: "RESOURCE_NOT_FOUND",
        message: "No posts found via REST or v2 endpoints",
        warnings,
      },
    });
  } catch (e) {
    const status = e?.response?.status || 500;
    console.error(
      `[posts:list] error status=${status} msg=${
        e?.response?.data?.message || e.message
      }`
    );
    return res.status(status).json({ error: e?.response?.data || e.message });
  }
});

/* ──────────────────────────────
   Create post (v2 ugcPosts for widest availability)
────────────────────────────── */
app.post("/api/posts", async (req, res) => {
  if (!req.user) return res.status(401).json({ error: "Unauthenticated" });
  const text = (req.body?.text || "").trim();
  if (!text) return res.status(400).json({ error: "Missing text" });

  const accessToken = req.user.accessToken;
  const sub = String(req.user.sub || "");
  const personUrn = sub.startsWith("urn:li:person:")
    ? sub
    : `urn:li:person:${sub}`; // UGC requires a full person URN

  const payload = {
    author: personUrn,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text },
        shareMediaCategory: "NONE",
      },
    },
    visibility: {
      "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
    },
  };

  try {
    console.log(
      `[posts] create requested by ${personUrn} textLength=${text.length}`
    );
    const resp = await axios.post(
      "https://api.linkedin.com/v2/ugcPosts",
      payload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Restli-Protocol-Version": "2.0.0",
        },
        validateStatus: () => true, // capture non-2xx responses
      }
    );

    if (resp.status >= 200 && resp.status < 300) {
      const id = resp.headers?.["x-restli-id"] || null;
      console.log(
        `[posts] create success status=${resp.status} id=${id || "unknown"}`
      );
      return res
        .status(201)
        .json({ ok: true, id, status: resp.status, message: "Post created" });
    }

    const failureMessage = resp?.data?.message || "Create post failed";
    console.warn(
      `[posts] create failed status=${resp.status || 0} msg=${failureMessage}`
    );
    return res.status(resp.status || 500).json({
      ok: false,
      status: resp.status || 500,
      message: failureMessage,
      error: resp.data || { message: failureMessage },
    });
  } catch (err) {
    const status = err?.response?.status || 500;
    console.error(
      `[posts] create error status=${status} msg=${
        err?.response?.data?.message || err.message
      }`
    );
    return res.status(status).json({
      ok: false,
      status,
      message: err?.response?.data?.message || err.message,
      error: err?.response?.data || err.message,
    });
  }
});

// Removed activities, comments, reactions endpoints

/* ──────────────────────────────
   Root → SPA index.html
────────────────────────────── */
// No root UI; backend only serves APIs

/* ──────────────────────────────
   Auth routes
────────────────────────────── */
app.get("/auth/linkedin", (req, res, next) => {
  // Optional per-request redirect_uri to return control to the mobile app
  const redirectUri = (req.query.redirect_uri || "").toString();
  if (redirectUri) {
    req.session.mobileRedirectUri = redirectUri;
  }
  return passport.authenticate("linkedin")(req, res, next);
});

app.get("/auth/linkedin/callback", (req, res, next) => {
  passport.authenticate("linkedin", (err, user) => {
    const mobileRedirect = req.session.mobileRedirectUri || "";

    const completeBase = `${req.protocol}://${req.get("host")}/auth/complete`;

    if (err || !user) {
      const params = new URLSearchParams({
        error: err?.message || "authentication_failed",
      });
      if (mobileRedirect) params.append("redirect", mobileRedirect);
      return res.redirect(`${completeBase}?${params.toString()}`);
    }

    req.logIn(user, (loginErr) => {
      if (loginErr) {
        const params = new URLSearchParams({
          error: loginErr?.message || "login_failed",
        });
        if (mobileRedirect) params.append("redirect", mobileRedirect);
        return res.redirect(`${completeBase}?${params.toString()}`);
      }

      // Issue opaque app token for the mobile app; do NOT expose LinkedIn token
      const token = storeUserForToken(req.user);

      const params = new URLSearchParams({ token });
      if (mobileRedirect) params.append("redirect", mobileRedirect);
      return res.redirect(`${completeBase}?${params.toString()}`);
    });
  })(req, res, next);
});

app.get("/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    // nuke session + cookie for clean logout
    req.session.destroy((destroyErr) => {
      if (destroyErr) return next(destroyErr);
      res.clearCookie("connect.sid");
      return res.status(204).end();
    });
  });
});

/* ──────────────────────────────
   Auth completion page (HTML fallback)
   - Attempts to open app deep link with token
   - Displays token and manual link if automatic open fails
────────────────────────────── */
app.get("/auth/complete", (req, res) => {
  const token = String(req.query.token || "");
  const error = String(req.query.error || "");
  const redirect = String(req.query.redirect || "");
  const esc = (s) =>
    String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Authentication Complete</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Arial, sans-serif; padding: 24px; line-height: 1.5; }
      .box { border: 1px solid #eee; border-radius: 8px; padding: 16px; max-width: 680px; }
      .token { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; word-break: break-all; background: #fafafa; padding: 8px; border-radius: 6px; }
      .btn { display: inline-block; background: #0A66C2; color: white; padding: 10px 14px; border-radius: 8px; text-decoration: none; }
      .link { color: #0A66C2; text-decoration: none; }
    </style>
  </head>
  <body>
    <div class="box">
      <h2>Authentication ${error ? "Failed" : "Complete"}</h2>
      ${error ? `<p style="color:#B00020">${esc(error)}</p>` : ""}
      ${
        token
          ? `<p><strong>Token:</strong> <span class="token">${esc(
              token
            )}</span></p>`
          : ""
      }
      ${
        redirect
          ? `<p><a id="open-app" class="btn" href="#">Open App</a></p>`
          : ""
      }
      ${
        redirect
          ? `<p>If the app does not open automatically, click the button above. If it still doesn't open, copy the token and paste it into the app manually.</p>`
          : `<p>You can copy the token above and paste it into the app.</p>`
      }
    </div>
    <script>
      (function(){
        var token = ${JSON.stringify(token)};
        var redirect = ${JSON.stringify(redirect)};
        function withParam(u, k, v){
          try { var url = new URL(u); url.searchParams.set(k, v); return url.toString(); } catch(e) {
            var j = u.indexOf('?') === -1 ? '?' : '&';
            return u + j + encodeURIComponent(k) + '=' + encodeURIComponent(v);
          }
        }
        if (redirect) {
          var target = withParam(redirect, 'token', token);
          var btn = document.getElementById('open-app');
          if (btn) {
            btn.addEventListener('click', function(ev){
              ev.preventDefault();
              window.location.href = target;
            });
          }
          setTimeout(function(){
            try { window.location.replace(target); } catch(_) { /* ignore */ }
          }, 150);
        }
      })();
    </script>
  </body>
  </html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.send(html);
});

/* ──────────────────────────────
   Start
────────────────────────────── */
app.listen(PORT, () => {
  console.log(`🚀  Running at http://localhost:${PORT}`);
  console.log("✅  LinkedIn OpenID Connect POC ready (no /v2/me)");
});
