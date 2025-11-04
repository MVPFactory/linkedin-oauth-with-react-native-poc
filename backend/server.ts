import express, { Request, Response } from "express";
import dotenv from "dotenv";
import { LinkedInProfile } from "./types";
import { tokenService } from "./tokenService";
import { linkedInService } from "./linkedinService";

dotenv.config();

const app = express();
const PORT: number = parseInt(process.env.PORT || "3000", 10);

// ensure correct protocol/host when behind a proxy (ngrok, render, vercel)
app.set("trust proxy", 1);

/* ──────────────────────────────
   App middleware
────────────────────────────── */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Minimal request logger
app.use((req: Request, _res: Response, next: () => void) => {
  try {
    console.log(`[req] ${req.method} ${req.originalUrl}`);
  } catch (_) {}
  next();
});

/* ──────────────────────────────
   LinkedIn OAuth Configuration
────────────────────────────── */
const LINKEDIN_CLIENT_ID: string | undefined = process.env.LINKEDIN_CLIENT_ID;
const LINKEDIN_CLIENT_SECRET: string | undefined =
  process.env.LINKEDIN_CLIENT_SECRET;
const LINKEDIN_REDIRECT_URI: string = process.env.LINKEDIN_CALLBACK_URL || "";

/* ──────────────────────────────
   OAuth Endpoints
────────────────────────────── */
// OAuth initiation endpoint - redirects to LinkedIn OAuth
app.get("/auth/linkedin", (req: Request, res: Response) => {
  const { redirect_uri } = req.query;
  const state: string = tokenService.generateState();
  const scope: string = "openid profile email w_member_social";

  // Store the mobile app's redirect_uri with the state
  // This will be used in the callback to redirect back to the app
  if (redirect_uri) {
    tokenService.storeOAuthState(state, redirect_uri as string);
  }

  // Always use the backend callback URL for LinkedIn redirect
  // LinkedIn will redirect back to this callback URL
  const authUrl: string =
    `https://www.linkedin.com/oauth/v2/authorization?` +
    `response_type=code&` +
    `client_id=${LINKEDIN_CLIENT_ID}&` +
    `redirect_uri=${encodeURIComponent(LINKEDIN_REDIRECT_URI)}&` +
    `state=${state}&` +
    `scope=${encodeURIComponent(scope)}`;

  res.redirect(authUrl);
});

app.get("/auth/linkedin/url", (req: Request, res: Response) => {
  const state: string = tokenService.generateState();
  const scope: string = "openid profile email w_member_social";

  const authUrl: string =
    `https://www.linkedin.com/oauth/v2/authorization?` +
    `response_type=code&` +
    `client_id=${LINKEDIN_CLIENT_ID}&` +
    `redirect_uri=${encodeURIComponent(LINKEDIN_REDIRECT_URI)}&` +
    `state=${state}&` +
    `scope=${encodeURIComponent(scope)}`;

  res.json({ authUrl, state });
});

// LinkedIn OAuth callback - redirects to mobile app with token
// LinkedIn redirects to: http://localhost:3000/auth/linkedin/callback?code=...&state=...
app.get("/auth/linkedin/callback", async (req: Request, res: Response) => {
  const { code, error, state } = req.query;

  // Get the mobile app's redirect_uri from stored state
  const appRedirectUri = state
    ? tokenService.getOAuthState(state as string)
    : null;

  if (error) {
    // Return error HTML page (no redirects)
    const errorHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LinkedIn OAuth - Error</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            max-width: 500px;
            width: 100%;
            padding: 40px;
            text-align: center;
        }
        .error-icon {
            width: 80px;
            height: 80px;
            background: #ef4444;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 24px;
        }
        .error-icon::before {
            content: '✕';
            color: white;
            font-size: 48px;
            font-weight: bold;
        }
        h1 {
            color: #1f2937;
            font-size: 28px;
            margin-bottom: 12px;
        }
        .error-message {
            color: #6b7280;
            font-size: 16px;
            margin-top: 16px;
            padding: 16px;
            background: #fef2f2;
            border-radius: 8px;
            border-left: 4px solid #ef4444;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="error-icon"></div>
        <h1>Authentication Failed</h1>
        <div class="error-message">${error}</div>
    </div>
</body>
</html>
    `;
    res.send(errorHtml);
    return;
  }

  if (!code) {
    const errorMsg = "No authorization code received";

    // Return error HTML page (no redirects)
    const errorHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LinkedIn OAuth - Error</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            max-width: 500px;
            width: 100%;
            padding: 40px;
            text-align: center;
        }
        .error-icon {
            width: 80px;
            height: 80px;
            background: #ef4444;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 24px;
        }
        .error-icon::before {
            content: '✕';
            color: white;
            font-size: 48px;
            font-weight: bold;
        }
        h1 {
            color: #1f2937;
            font-size: 28px;
            margin-bottom: 12px;
        }
        .error-message {
            color: #6b7280;
            font-size: 16px;
            margin-top: 16px;
            padding: 16px;
            background: #fef2f2;
            border-radius: 8px;
            border-left: 4px solid #ef4444;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="error-icon"></div>
        <h1>Authentication Failed</h1>
        <div class="error-message">${errorMsg}</div>
    </div>
</body>
</html>
    `;
    res.send(errorHtml);
    return;
  }

  try {
    // Exchange code for tokens
    const tokenData = await linkedInService.exchangeCodeForTokens(
      code as string,
      LINKEDIN_CLIENT_ID!,
      LINKEDIN_CLIENT_SECRET!,
      LINKEDIN_REDIRECT_URI
    );

    const { access_token, refresh_token, expires_in } = tokenData;

    // Get user profile to create user ID
    const profile = await linkedInService.getUserProfile(access_token);
    const userId: string = profile.sub;

    // Store tokens
    tokenService.storeUserTokens(
      userId,
      access_token,
      refresh_token,
      expires_in
    );

    // Always return HTML page with token for copy-paste (no redirects)
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="apple-itunes-app" content="app-id=">
    <meta name="google-play-app" content="app-id=">
    <meta name="format-detection" content="telephone=no">
    <title>LinkedIn OAuth - Success</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            max-width: 600px;
            width: 100%;
            padding: 40px;
            text-align: center;
        }
        .success-icon {
            width: 80px;
            height: 80px;
            background: #10b981;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 24px;
            animation: scaleIn 0.5s ease-out;
        }
        .success-icon::before {
            content: '✓';
            color: white;
            font-size: 48px;
            font-weight: bold;
        }
        @keyframes scaleIn {
            from {
                transform: scale(0);
            }
            to {
                transform: scale(1);
            }
        }
        h1 {
            color: #1f2937;
            font-size: 28px;
            margin-bottom: 12px;
            font-weight: 700;
        }
        .subtitle {
            color: #6b7280;
            font-size: 16px;
            margin-bottom: 32px;
        }
        .token-section {
            background: #f9fafb;
            border: 2px solid #e5e7eb;
            border-radius: 12px;
            padding: 20px;
            margin: 24px 0;
            text-align: left;
        }
        .token-label {
            color: #374151;
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 8px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .token-value {
            background: white;
            border: 1px solid #d1d5db;
            border-radius: 8px;
            padding: 12px;
            font-family: 'Monaco', 'Courier New', monospace;
            font-size: 13px;
            color: #111827;
            word-break: break-all;
            margin-bottom: 12px;
            position: relative;
        }
        .copy-button {
            background: #0A66C2;
            color: white;
            border: none;
            border-radius: 8px;
            padding: 10px 20px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            width: 100%;
            margin-top: 8px;
        }
        .copy-button:hover {
            background: #084d94;
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(10, 102, 194, 0.3);
        }
        .copy-button:active {
            transform: translateY(0);
        }
        .copy-button.copied {
            background: #10b981;
        }
        .user-info {
            background: #eff6ff;
            border: 1px solid #bfdbfe;
            border-radius: 8px;
            padding: 12px;
            margin-top: 16px;
            font-size: 14px;
            color: #1e40af;
        }
        .user-info strong {
            color: #1e3a8a;
        }
        .instructions {
            background: #fef3c7;
            border-left: 4px solid #f59e0b;
            padding: 16px;
            border-radius: 8px;
            margin-top: 24px;
            text-align: left;
        }
        .instructions h3 {
            color: #92400e;
            font-size: 14px;
            margin-bottom: 8px;
            font-weight: 600;
        }
        .instructions p {
            color: #78350f;
            font-size: 13px;
            line-height: 1.6;
        }
        .open-app-button {
            background: #10b981;
            color: white;
            border: none;
            border-radius: 8px;
            padding: 14px 24px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            width: 100%;
            margin-top: 20px;
        }
        .open-app-button:hover {
            background: #059669;
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
        }
        .open-app-button:active {
            transform: translateY(0);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="success-icon"></div>
        <h1>Authentication Successful!</h1>
        <p class="subtitle">Your LinkedIn OAuth token has been generated</p>
        
        <div class="token-section">
            <div class="token-label">Access Token</div>
            <div class="token-value" id="token">${access_token}</div>
            <button class="copy-button" onclick="copyToken()">Copy Token</button>
        </div>

        <div class="user-info">
            <strong>User ID:</strong> ${userId}<br>
            <strong>Name:</strong> ${
              profile.name || profile.given_name || "N/A"
            }<br>
            <strong>Email:</strong> ${profile.email || "N/A"}
        </div>

        <div class="instructions">
            <h3>📱 How to use in mobile app:</h3>
            <p>1. Click "Copy Token" button above<br>
            2. Open your StoryMachine mobile app<br>
            3. Paste the token in the "Paste token here" field<br>
            4. Click "Use Token" to authenticate</p>
            <p style="margin-top: 12px; font-size: 12px; color: #92400e;"><strong>Note:</strong> The token has been copied to your clipboard. Simply paste it into the app.</p>
        </div>
    </div>

    <script>
        function copyToken() {
            const tokenElement = document.getElementById('token');
            const token = tokenElement.textContent;
            
            navigator.clipboard.writeText(token).then(() => {
                const button = document.querySelector('.copy-button');
                const originalText = button.textContent;
                button.textContent = '✓ Copied!';
                button.classList.add('copied');
                
                setTimeout(() => {
                    button.textContent = originalText;
                    button.classList.remove('copied');
                }, 2000);
            }).catch(err => {
                // Fallback for older browsers
                const textArea = document.createElement('textarea');
                textArea.value = token;
                textArea.style.position = 'fixed';
                textArea.style.left = '-999999px';
                document.body.appendChild(textArea);
                textArea.select();
                try {
                    document.execCommand('copy');
                    const button = document.querySelector('.copy-button');
                    button.textContent = '✓ Copied!';
                    button.classList.add('copied');
                    setTimeout(() => {
                        button.textContent = 'Copy Token';
                        button.classList.remove('copied');
                    }, 2000);
                } catch (err) {
                    alert('Failed to copy. Please manually select and copy the token.');
                }
                document.body.removeChild(textArea);
            });
        }

        // Auto-copy token to clipboard when page loads
        window.addEventListener('load', function() {
            const token = document.getElementById('token').textContent;
            navigator.clipboard.writeText(token).then(() => {
                // Token copied successfully
                console.log('Token copied to clipboard');
            }).catch(() => {
                // Clipboard API not available, user will need to copy manually
                console.log('Please copy the token manually');
            });
        });
    </script>
</body>
</html>
    `;

    res.send(html);
  } catch (error: any) {
    console.error(
      "OAuth callback error:",
      error.response?.data || error.message
    );
    const errorMessage =
      error.response?.data?.message || error.message || "Authentication failed";

    // Return error HTML page (no redirects)
    const errorHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LinkedIn OAuth - Error</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            max-width: 500px;
            width: 100%;
            padding: 40px;
            text-align: center;
        }
        .error-icon {
            width: 80px;
            height: 80px;
            background: #ef4444;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 24px;
        }
        .error-icon::before {
            content: '✕';
            color: white;
            font-size: 48px;
            font-weight: bold;
        }
        h1 {
            color: #1f2937;
            font-size: 28px;
            margin-bottom: 12px;
        }
        .error-message {
            color: #6b7280;
            font-size: 16px;
            margin-top: 16px;
            padding: 16px;
            background: #fef2f2;
            border-radius: 8px;
            border-left: 4px solid #ef4444;
            word-break: break-word;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="error-icon"></div>
        <h1>Authentication Failed</h1>
        <div class="error-message">${errorMessage}</div>
    </div>
</body>
</html>
    `;
    res.send(errorHtml);
  }
});

/* ──────────────────────────────
   LinkedIn API Proxy Endpoints
────────────────────────────── */
// Session endpoint for mobile app - accepts Bearer token and returns profile
app.get("/api/session", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authorization header required" });
  }

  const accessToken = authHeader.substring(7); // Remove "Bearer " prefix

  try {
    const profile = await linkedInService.getUserProfile(accessToken);
    res.json({
      authenticated: true,
      user: profile,
    });
  } catch (error: any) {
    console.error("Session fetch error:", error.message);
    res.status(401).json({
      authenticated: false,
      error: "Invalid or expired token",
    });
  }
});

app.get("/api/profile", async (req: Request, res: Response) => {
  const { userId }: { userId?: string } = req.query;

  if (!userId) {
    return res.status(400).json({ error: "User ID required" });
  }

  try {
    const accessToken: string = await tokenService.getValidAccessToken(userId);
    const profile = await linkedInService.getUserProfile(accessToken);
    res.json(profile);
  } catch (error: any) {
    console.error("Profile fetch error:", error.message);
    if (
      error.message.includes("REVOKED_ACCESS_TOKEN") ||
      error.message.includes("Token refresh failed")
    ) {
      res.status(401).json({
        error: "Authentication expired. Please re-authenticate.",
        requiresReauth: true,
      });
    } else {
      res
        .status(401)
        .json({ error: "Authentication required or token expired" });
    }
  }
});

app.post("/api/posts", async (req: Request, res: Response) => {
  const {
    userId,
    text,
    urn,
  }: { userId?: string; text?: string; urn?: string } = req.body;

  // Check if Bearer token is provided as alternative to userId
  const authHeader = req.headers.authorization;
  let accessToken: string;
  let finalUserId: string;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    // Use Bearer token directly
    accessToken = authHeader.substring(7);
    try {
      // Get userId from profile
      const profile = await linkedInService.getUserProfile(accessToken);
      finalUserId = profile.sub;
    } catch (error: any) {
      return res.status(401).json({ error: "Invalid access token" });
    }
  } else if (userId) {
    // Use userId to get stored token
    try {
      accessToken = await tokenService.getValidAccessToken(userId);
      finalUserId = userId;
    } catch (error: any) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
  } else {
    return res.status(400).json({
      error: "Either Bearer token or user ID required",
    });
  }

  if (!text) {
    return res.status(400).json({ error: "Text is required" });
  }

  try {
    const result = await linkedInService.createPost(
      accessToken,
      finalUserId,
      text,
      urn
    );
    res.json(result);
  } catch (error: any) {
    console.error(
      "Post creation error:",
      error.response?.data || error.message
    );
    res.status(400).json({
      error: "Failed to create post",
      details: error.response?.data || error.message,
    });
  }
});

app.get("/api/posts", async (req: Request, res: Response) => {
  const { userId }: { userId?: string } = req.query;

  // Check if Bearer token is provided as alternative to userId
  const authHeader = req.headers.authorization;
  let accessToken: string;
  let finalUserId: string;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    // Use Bearer token directly
    accessToken = authHeader.substring(7);
    try {
      // Get userId from profile
      const profile = await linkedInService.getUserProfile(accessToken);
      finalUserId = profile.sub;
    } catch (error: any) {
      return res.status(401).json({ error: "Invalid access token" });
    }
  } else if (userId) {
    // Use userId to get stored token
    try {
      accessToken = await tokenService.getValidAccessToken(userId);
      finalUserId = userId;
    } catch (error: any) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
  } else {
    return res.status(400).json({
      error: "Either Bearer token or user ID required",
    });
  }

  try {
    const posts = await linkedInService.getUserPosts(accessToken, finalUserId);
    res.json(posts);
  } catch (error: any) {
    console.error("Posts fetch error:", error.response?.data || error.message);
    res.status(401).json({ error: "Authentication required or token expired" });
  }
});

app.post("/api/comments", async (req: Request, res: Response) => {
  const {
    userId,
    postUrn,
    commentText,
  }: { userId?: string; postUrn?: string; commentText?: string } = req.body;

  // Check if Bearer token is provided as alternative to userId
  const authHeader = req.headers.authorization;
  let accessToken: string;
  let finalUserId: string;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    // Use Bearer token directly
    accessToken = authHeader.substring(7);
    try {
      // Get userId from profile
      const profile = await linkedInService.getUserProfile(accessToken);
      finalUserId = profile.sub;
    } catch (error: any) {
      return res.status(401).json({ error: "Invalid access token" });
    }
  } else if (userId) {
    // Use userId to get stored token
    try {
      accessToken = await tokenService.getValidAccessToken(userId);
      finalUserId = userId;
    } catch (error: any) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
  } else {
    return res.status(400).json({
      error: "Either Bearer token or user ID required",
    });
  }

  if (!postUrn || !commentText) {
    return res
      .status(400)
      .json({ error: "Post URN and comment text are required" });
  }

  try {
    const result = await linkedInService.createComment(
      accessToken,
      finalUserId,
      postUrn,
      commentText
    );
    res.json(result);
  } catch (error: any) {
    console.error(
      "Comment creation error:",
      error.response?.data || error.message
    );
    res.status(400).json({
      error: "Failed to create comment",
      details: error.response?.data || error.message,
    });
  }
});

app.post("/api/reactions", async (req: Request, res: Response) => {
  const {
    userId,
    postUrn,
    reactionType,
  }: {
    userId?: string;
    postUrn?: string;
    reactionType?:
      | "LIKE"
      | "LOVE"
      | "SUPPORT"
      | "FUNNY"
      | "INSIGHTFUL"
      | "CELEBRATE";
  } = req.body;

  // Check if Bearer token is provided as alternative to userId
  const authHeader = req.headers.authorization;
  let accessToken: string;
  let finalUserId: string;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    // Use Bearer token directly
    accessToken = authHeader.substring(7);
    try {
      // Get userId from profile
      const profile = await linkedInService.getUserProfile(accessToken);
      finalUserId = profile.sub;
    } catch (error: any) {
      return res.status(401).json({ error: "Invalid access token" });
    }
  } else if (userId) {
    // Use userId to get stored token
    try {
      accessToken = await tokenService.getValidAccessToken(userId);
      finalUserId = userId;
    } catch (error: any) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
  } else {
    return res.status(400).json({
      error: "Either Bearer token or user ID required",
    });
  }

  if (!postUrn || !reactionType) {
    return res
      .status(400)
      .json({ error: "Post URN and reaction type are required" });
  }

  try {
    const result = await linkedInService.createReaction(
      accessToken,
      finalUserId,
      postUrn,
      reactionType
    );
    res.json(result);
  } catch (error: any) {
    console.error(
      "Reaction creation error:",
      error.response?.data || error.message
    );

    // Check for specific error types
    if (
      error.response?.status === 403 &&
      error.response?.data?.code === "ACCESS_DENIED"
    ) {
      res.status(403).json({
        error: "Reactions require Partner API access",
        message:
          "Creating reactions requires LinkedIn Partner API access, which is not available with the current app permissions.",
        details: error.response?.data,
      });
      return;
    }

    const statusCode = error.response?.status || 400;
    res.status(statusCode).json({
      error: "Failed to create reaction",
      details: error.response?.data || error.message,
    });
  }
});

/* ──────────────────────────────
   Basic API endpoints
────────────────────────────── */
app.get("/", (req: Request, res: Response) => {
  res.json({ message: "linkedin_oauth_poc API - LinkedIn OAuth Ready" });
});

/* ──────────────────────────────
   Start
────────────────────────────── */
app.listen(PORT, () => {
  console.log(`🚀  Running at http://localhost:${PORT}`);
  console.log("✅  linkedin_oauth_poc API ready with LinkedIn OAuth");
  console.log(`📱  OAuth URL: http://localhost:${PORT}/auth/linkedin/url`);
});
