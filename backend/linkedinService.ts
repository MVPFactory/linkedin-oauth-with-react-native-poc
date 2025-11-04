/* ──────────────────────────────
   LinkedIn API Service for LinkedIn OAuth POC Backend
────────────────────────────── */

import axios, { AxiosResponse } from "axios";
import {
  LinkedInProfile,
  LinkedInPostPayload,
  LinkedInPostResponse,
  LinkedInCommentPayload,
  LinkedInCommentResponse,
  LinkedInReactionPayload,
  LinkedInReactionResponse,
} from "./types";

export class LinkedInService {
  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForTokens(
    code: string,
    clientId: string,
    clientSecret: string,
    redirectUri: string
  ): Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
  }> {
    const response: AxiosResponse = await axios.post(
      "https://www.linkedin.com/oauth/v2/accessToken",
      {
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      },
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );

    return response.data;
  }

  /**
   * Get user profile from LinkedIn API
   */
  async getUserProfile(accessToken: string): Promise<LinkedInProfile> {
    const response: AxiosResponse<LinkedInProfile> = await axios.get(
      "https://api.linkedin.com/v2/userinfo",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    return response.data;
  }

  /**
   * Create a LinkedIn post using Posts API
   * According to: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api?view=li-lms-2025-10&tabs=http#reshare-a-post
   * @param reshareUrn - Optional URN of the post to reshare (e.g., "urn:li:share:6957408550713184256")
   */
  async createPost(
    accessToken: string,
    userId: string,
    text: string,
    reshareUrn?: string
  ): Promise<LinkedInPostResponse> {
    const personUrn: string = `urn:li:person:${userId}`;

    const postPayload: LinkedInPostPayload = {
      author: personUrn,
      commentary: text,
      visibility: "PUBLIC",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    };

    // Add reshare context if reshare URN is provided
    if (reshareUrn && reshareUrn.trim()) {
      postPayload.reshareContext = {
        parent: reshareUrn.trim(),
      };
    }

    // Use /rest/posts endpoint as per Posts API documentation
    const response: AxiosResponse<any> = await axios.post(
      "https://api.linkedin.com/v2/posts",
      postPayload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "Linkedin-Version": "202501", // Use active API version (YYYYMM format)
          "X-Restli-Protocol-Version": "2.0.0",
        },
      }
    );

    return {
      success: true,
      postId: response.headers["x-restli-id"],
      message: "Post created successfully",
    };
  }

  /**
   * Get user's posts from LinkedIn
   */
  async getUserPosts(accessToken: string, userId: string): Promise<any> {
    const personUrn: string = `urn:li:person:${userId}`;

    const response: AxiosResponse<any> = await axios.get(
      "https://api.linkedin.com/v2/ugcPosts",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: {
          q: "authors",
          authors: `List(${personUrn})`,
          count: 10,
        },
      }
    );

    return response.data;
  }

  /**
   * Create a comment on a LinkedIn post
   * Based on: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/network-update-social-actions
   */
  async createComment(
    accessToken: string,
    userId: string,
    postUrn: string,
    commentText: string
  ): Promise<LinkedInCommentResponse> {
    const personUrn: string = `urn:li:person:${userId}`;

    // Ensure postUrn is properly formatted
    let formattedPostUrn: string = postUrn;
    if (!postUrn.startsWith("urn:li:")) {
      // If just an ID is provided, assume it's a ugcPost
      formattedPostUrn = `urn:li:ugcPost:${postUrn}`;
    }

    // The object field should reference the share/activity
    // For ugcPost URNs, try using the same URN or convert to share format
    // Note: ugcPost URNs may need to be converted to share URNs for the object field
    // However, the API accepts both formats, so we'll use the formatted URN as-is
    const objectUrn: string = formattedPostUrn;

    const commentPayload: LinkedInCommentPayload = {
      actor: personUrn,
      object: objectUrn,
      message: {
        text: commentText,
      },
    };

    // Use the REST API endpoint with the post URN in the URL
    const encodedUrn: string = encodeURIComponent(formattedPostUrn);
    const response: AxiosResponse<any> = await axios.post(
      `https://api.linkedin.com/v2/socialActions/${encodedUrn}/comments`,
      commentPayload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "Linkedin-Version": "202501", // Use active API version (YYYYMM format)
          "X-Restli-Protocol-Version": "2.0.0",
        },
      }
    );

    return {
      success: true,
      commentId: response.data?.id || response.headers["x-restli-id"],
      message: "Comment created successfully",
    };
  }

  /**
   * Create a reaction (like) on a LinkedIn post
   * Based on: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/network-update-social-actions
   * Note: The LinkedIn API currently only supports "likes" via the API.
   * Other reaction types (LOVE, SUPPORT, FUNNY, etc.) may not be available via API.
   */
  async createReaction(
    accessToken: string,
    userId: string,
    postUrn: string,
    reactionType:
      | "LIKE"
      | "LOVE"
      | "SUPPORT"
      | "FUNNY"
      | "INSIGHTFUL"
      | "CELEBRATE"
  ): Promise<LinkedInReactionResponse> {
    const personUrn: string = `urn:li:person:${userId}`;

    // Ensure postUrn is properly formatted
    let formattedPostUrn: string = postUrn;
    if (!postUrn.startsWith("urn:li:")) {
      // If just an ID is provided, assume it's a ugcPost
      formattedPostUrn = `urn:li:ugcPost:${postUrn}`;
    }

    // The object field should reference the share/activity
    // Use the formatted URN as-is - the API accepts both ugcPost and share URNs
    const objectUrn: string = formattedPostUrn;

    // Note: LinkedIn API currently only supports likes via REST API
    // Other reaction types may not be available programmatically
    const reactionPayload = {
      actor: personUrn,
      object: objectUrn,
    };

    // Use the REST API endpoint with the post URN in the URL
    const encodedUrn: string = encodeURIComponent(formattedPostUrn);

    try {
      const response: AxiosResponse<any> = await axios.post(
        `https://api.linkedin.com/v2/socialActions/${encodedUrn}/likes`,
        reactionPayload,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "Linkedin-Version": "202501", // Use active API version (YYYYMM format)
            "X-Restli-Protocol-Version": "2.0.0",
          },
        }
      );

      return {
        success: true,
        reactionId: response.data?.id || response.headers["x-restli-id"],
        message: "Reaction (like) created successfully",
      };
    } catch (error: any) {
      // Handle 409 Conflict - reaction already exists
      if (error.response?.status === 409) {
        return {
          success: true,
          reactionId: undefined,
          message: "Reaction already exists for this post",
        };
      }
      // Re-throw other errors
      throw error;
    }
  }
}

// Export a default instance
export const linkedInService = new LinkedInService();
