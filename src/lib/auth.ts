import { MongoDBAdapter } from '@auth/mongodb-adapter';
import type { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { getMongoClient, hasMongoUri } from './mongodb';
import { getServerSession } from 'next-auth';
import { upsertParticipant } from './participants';

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const nextAuthSecret = process.env.NEXTAUTH_SECRET;

if (!googleClientId || !googleClientSecret) {
    throw new Error(
        'Missing Google OAuth credentials in environment variables.'
    );
}

if (!nextAuthSecret) {
    throw new Error('Missing NEXTAUTH_SECRET environment variable.');
}

const adapter = hasMongoUri ? MongoDBAdapter(getMongoClient()) : undefined;

export const authOptions: NextAuthOptions = {
    adapter,
    secret: nextAuthSecret,
    session: hasMongoUri
        ? {
              strategy: 'database',
          }
        : {
              strategy: 'jwt',
          },
    providers: [
        GoogleProvider({
            clientId: googleClientId,
            clientSecret: googleClientSecret,
            authorization: {
                params: {
                    access_type: 'offline',
                    prompt: 'consent',
                    response_type: 'code',
                    scope: [
                        'openid',
                        'email',
                        'profile',
                        'https://www.googleapis.com/auth/fitness.activity.read',
                    ].join(' '),
                },
            },
        }),
    ],
    callbacks: {
        session: async ({ session, user, token }) => {
            if (session.user) {
                session.user.id = user?.id ?? (token?.sub as string);
            }
            return session;
        },
    },
    events: {
        async signIn({ user, account }) {
            await upsertParticipant({ user, account });
        },
        async linkAccount({ user, account }) {
            await upsertParticipant({ user, account });
        },
        // NOTE: We intentionally do NOT implement a signOut event handler.
        // When users sign out, we only delete their session (front-end logout),
        // but we MUST preserve their Google tokens in the participants collection
        // so we can continue fetching step data in the background for the leaderboard.
        // Never add: async signOut() { /* delete tokens */ } here!
    },
};

export const auth = () => getServerSession(authOptions);
