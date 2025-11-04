/* ──────────────────────────────
   Types for LinkedIn OAuth POC Backend
────────────────────────────── */

export interface UserTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  refreshExpiresAt: number;
  lastUpdated: number;
}

export interface LinkedInProfile {
  sub: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  email?: string;
  picture?: string;
}

export interface LinkedInTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface LinkedInPostPayload {
  author: string;
  commentary: string;
  visibility: "PUBLIC" | "CONNECTIONS" | "LOGGED_IN";
  distribution?: {
    feedDistribution: "MAIN_FEED";
    targetEntities?: any[];
    thirdPartyDistributionChannels?: any[];
  };
  lifecycleState: "PUBLISHED";
  isReshareDisabledByAuthor?: boolean;
  reshareContext?: {
    parent: string;
  };
}

export interface LinkedInPostResponse {
  success: boolean;
  postId?: string;
  message: string;
}

export interface LinkedInCommentPayload {
  actor: string;
  object: string;
  message: {
    text: string;
  };
}

export interface LinkedInCommentResponse {
  success: boolean;
  commentId?: string;
  message: string;
}

export interface LinkedInReactionPayload {
  actor: string;
  object: string;
  // Note: LinkedIn API currently only supports "likes" via REST API
  // Other reaction types are not available programmatically
}

export interface LinkedInReactionResponse {
  success: boolean;
  reactionId?: string;
  message: string;
}
