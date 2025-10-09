import { ObjectId } from "mongodb";
import type { Account } from "next-auth";
import type { AdapterUser } from "next-auth/adapters";
import { refreshParticipantsByIds, queueParticipantSync } from "./leaderboard";
import { getMongoClient, hasMongoUri } from "./mongodb";

type UpsertParticipantOptions = {
  user: AdapterUser;
  account?: Account | null;
};

function toObjectId(id?: string | null) {
  if (!id) {
    return new ObjectId();
  }

  try {
    return new ObjectId(id);
  } catch {
    return new ObjectId();
  }
}

export async function upsertParticipant({ user, account }: UpsertParticipantOptions) {
  if (!hasMongoUri || !user?.email) {
    return;
  }

  const client = await getMongoClient();
  const db = client.db();
  const participantsCollection = db.collection("participants");

  const email = user.email.toLowerCase();
  const existing = await participantsCollection.findOne<{ _id: ObjectId; googleTokens?: any }>({
    email,
  });

  const now = new Date();

  const existingTokens = existing?.googleTokens ?? {};

  const expiresAt =
    account?.expires_at != null ? new Date(account.expires_at * 1000) : existingTokens.expiryDate;

  const mergedTokens = {
    accessToken: account?.access_token ?? existingTokens.accessToken,
    refreshToken: account?.refresh_token ?? existingTokens.refreshToken,
    scope: account?.scope ?? existingTokens.scope,
    tokenType: account?.token_type ?? existingTokens.tokenType,
    expiryDate: expiresAt ? new Date(expiresAt) : undefined,
  };

  const baseUpdate = {
    name: user.name ?? existing?.["name"] ?? email,
    email,
    profileImageUrl: user.image ?? existing?.["profileImageUrl"],
    updatedAt: now,
    userId: user.id,
  };

  let participantId: ObjectId;
  let shouldSyncImmediately = false;

  if (existing) {
    participantId = existing._id;

    const update: Record<string, unknown> = { ...baseUpdate };
    if (mergedTokens.refreshToken) {
      update.googleTokens = mergedTokens;
    }

    await participantsCollection.updateOne(
      { _id: participantId },
      {
        $set: update,
        $setOnInsert: { createdAt: existing["createdAt"] ?? now },
      },
    );

    shouldSyncImmediately = Boolean(
      mergedTokens.refreshToken && !existingTokens.refreshToken,
    );
  } else {
    participantId = toObjectId(user.id);

    const document: Record<string, unknown> = {
      _id: participantId,
      ...baseUpdate,
      createdAt: now,
    };

    if (mergedTokens.refreshToken) {
      document.googleTokens = mergedTokens;
      shouldSyncImmediately = true;
    }

    await participantsCollection.insertOne(document);
  }

  if (mergedTokens.refreshToken) {
    if (shouldSyncImmediately) {
      await refreshParticipantsByIds([participantId]);
    } else {
      queueParticipantSync([participantId]);
    }
  }
}
