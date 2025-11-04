/* ──────────────────────────────
   Token Management Service for LinkedIn OAuth POC Backend
────────────────────────────── */

import axios, { AxiosResponse } from "axios";
import crypto from "crypto";
import { UserTokens, LinkedInTokenResponse } from "./types";

const LINKEDIN_CLIENT_ID: string | undefined = process.env.LINKEDIN_CLIENT_ID;
const LINKEDIN_CLIENT_SECRET: string | undefined =
  process.env.LINKEDIN_CLIENT_SECRET;

/* ──────────────────────────────
   Token Storage (In-memory for demo)
   In production, use a database like Redis or PostgreSQL
────────────────────────────── */
const userTokens = new Map<string, UserTokens>(); // userId -> UserTokens
const oauthStates = new Map<string, { redirectUri: string; expiresAt: number }>(); // state -> redirectUri

export class TokenService {
  /**
   * Generate a random state for OAuth
   */
  generateState(): string {
    return crypto.randomBytes(32).toString("hex");
  }

  /**
   * Store OAuth state with redirect URI (expires in 10 minutes)
   */
  storeOAuthState(state: string, redirectUri: string): void {
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes
    oauthStates.set(state, { redirectUri, expiresAt });
  }

  /**
   * Get and remove OAuth state (one-time use)
   */
  getOAuthState(state: string): string | null {
    const stateData = oauthStates.get(state);
    if (!stateData) {
      return null;
    }

    // Check if expired
    if (stateData.expiresAt <= Date.now()) {
      oauthStates.delete(state);
      return null;
    }

    // Remove after use (one-time)
    oauthStates.delete(state);
    return stateData.redirectUri;
  }

  /**
   * Store user tokens in memory
   */
  storeUserTokens(
    userId: string,
    accessToken: string,
    refreshToken: string,
    expiresIn: number
  ): void {
    const now: number = Date.now();
    const expiresAt: number = now + expiresIn * 1000; // Convert seconds to milliseconds
    const refreshExpiresAt: number = now + 365 * 24 * 60 * 60 * 1000; // 1 year from now

    userTokens.set(userId, {
      accessToken,
      refreshToken,
      expiresAt,
      refreshExpiresAt,
      lastUpdated: now,
    });
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(userId: string): Promise<string> {
    const tokens: UserTokens | undefined = userTokens.get(userId);
    if (!tokens || !tokens.refreshToken) {
      throw new Error("No refresh token available");
    }

    if (tokens.refreshExpiresAt <= Date.now()) {
      throw new Error("Refresh token expired");
    }

    try {
      const response: AxiosResponse<LinkedInTokenResponse> = await axios.post(
        "https://www.linkedin.com/oauth/v2/accessToken",
        {
          grant_type: "refresh_token",
          refresh_token: tokens.refreshToken,
          client_id: LINKEDIN_CLIENT_ID,
          client_secret: LINKEDIN_CLIENT_SECRET,
        },
        {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        }
      );

      const { access_token, expires_in } = response.data;

      // Update stored tokens
      this.storeUserTokens(
        userId,
        access_token,
        tokens.refreshToken,
        expires_in
      );

      return access_token;
    } catch (error: any) {
      console.error(
        "Token refresh failed:",
        error.response?.data || error.message
      );
      throw new Error("Failed to refresh access token");
    }
  }

  /**
   * Get valid access token (refresh if needed)
   */
  async getValidAccessToken(userId: string): Promise<string> {
    const tokens: UserTokens | undefined = userTokens.get(userId);
    if (!tokens) {
      throw new Error("User not authenticated");
    }

    // Check if access token is expired
    if (tokens.expiresAt <= Date.now()) {
      console.log(
        `[token] Access token expired for user ${userId}, refreshing...`
      );
      try {
        return await this.refreshAccessToken(userId);
      } catch (error) {
        console.log(
          `[token] Refresh failed for user ${userId}, removing tokens`
        );
        this.removeUserTokens(userId);
        throw new Error("Token refresh failed. Please re-authenticate.");
      }
    }

    return tokens.accessToken;
  }

  /**
   * Check if user has valid tokens
   */
  hasValidTokens(userId: string): boolean {
    const tokens: UserTokens | undefined = userTokens.get(userId);
    return tokens !== undefined;
  }

  /**
   * Remove user tokens (logout)
   */
  removeUserTokens(userId: string): void {
    userTokens.delete(userId);
  }
}

// Export a default instance
export const tokenService = new TokenService();
