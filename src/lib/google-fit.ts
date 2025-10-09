import { challengeWindowMillis } from "./challenge";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const AGGREGATE_ENDPOINT = "https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate";

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  throw new Error("Missing Google client credentials in environment variables.");
}

type GoogleTokenSet = {
  accessToken?: string;
  refreshToken: string;
  expiryDate?: string | Date | number;
  scope?: string;
  tokenType?: string;
};

type EnsureAccessTokenResult = {
  accessToken: string;
  refreshed: boolean;
  updatedTokens: {
    accessToken: string;
    refreshToken: string;
    expiryDate: Date;
    scope?: string;
    tokenType?: string;
  };
};

export async function ensureAccessToken(tokens: GoogleTokenSet): Promise<EnsureAccessTokenResult> {
  if (!tokens.refreshToken) {
    throw new Error("Participant does not have a refresh token.");
  }

  const expiryDate = tokens.expiryDate ? new Date(tokens.expiryDate) : null;
  const shouldRefresh =
    !tokens.accessToken || !expiryDate || expiryDate.getTime() - Date.now() < 60 * 1000;

  if (!shouldRefresh && tokens.accessToken) {
    return {
      accessToken: tokens.accessToken,
      refreshed: false,
      updatedTokens: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiryDate,
        scope: tokens.scope,
        tokenType: tokens.tokenType,
      },
    };
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: tokens.refreshToken,
    grant_type: "refresh_token",
  });

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to refresh Google token: ${response.status} ${errorBody}`);
  }

  const tokenPayload = (await response.json()) as {
    access_token: string;
    expires_in: number;
    token_type?: string;
    scope?: string;
  };

  const nextExpiry = new Date(Date.now() + tokenPayload.expires_in * 1000);

  return {
    accessToken: tokenPayload.access_token,
    refreshed: true,
    updatedTokens: {
      accessToken: tokenPayload.access_token,
      refreshToken: tokens.refreshToken,
      expiryDate: nextExpiry,
      scope: tokenPayload.scope ?? tokens.scope,
      tokenType: tokenPayload.token_type ?? tokens.tokenType,
    },
  };
}

export async function fetchTotalSteps(accessToken: string): Promise<number> {
  const payload = {
    aggregateBy: [
      {
        dataTypeName: "com.google.step_count.delta",
      },
    ],
    bucketByTime: {
      durationMillis: 24 * 60 * 60 * 1000,
    },
    startTimeMillis: challengeWindowMillis.start,
    endTimeMillis: challengeWindowMillis.end,
  };

  const response = await fetch(AGGREGATE_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to fetch Google Fit data: ${response.status} ${errorBody}`);
  }

  const data = (await response.json()) as {
    bucket?: Array<{
      dataset?: Array<{
        point?: Array<{
          value?: Array<{ intVal?: number; fpVal?: number }>;
        }>;
      }>;
    }>;
  };

  let totalSteps = 0;

  data.bucket?.forEach((bucket) => {
    bucket.dataset?.forEach((dataset) => {
      dataset.point?.forEach((point) => {
        point.value?.forEach((value) => {
          if (typeof value.intVal === "number") {
            totalSteps += value.intVal;
          } else if (typeof value.fpVal === "number") {
            totalSteps += Math.round(value.fpVal);
          }
        });
      });
    });
  });

  return totalSteps;
}
