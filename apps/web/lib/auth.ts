import { passkey } from "@better-auth/passkey";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins/magic-link";

import { sendMagicLinkEmail } from "@/lib/server/auth-email";
import { authDb, schema } from "@/lib/server/db/client";
import { canAccessInviteOnlyAuth } from "@/lib/server/auth-access";
import {
  getPendingInviteForEmail,
  markInviteAccepted,
} from "@/lib/server/invitations";

type SocialProviderId = "github" | "google";

type SocialProviderDefinition = {
  clientId: string;
  clientSecret: string;
  scopes?: string[];
};

function getConfiguredSocialProviders() {
  const providers: Partial<Record<SocialProviderId, SocialProviderDefinition>> =
    {};

  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    providers.github = {
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      scopes: ["read:user", "user:email"],
    };
  }

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    providers.google = {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      scopes: ["openid", "email", "profile"],
    };
  }

  return providers;
}

export function listConfiguredSocialProviders() {
  const providers = getConfiguredSocialProviders();

  return (Object.keys(providers) as SocialProviderId[]).map((id) => ({
    id,
    label: id === "github" ? "GitHub" : "Google",
  }));
}

export const auth = betterAuth({
  appName: "F1 Hub",
  database: drizzleAdapter(authDb, {
    provider: "pg",
    schema,
    camelCase: true,
  }),
  trustedOrigins: [
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    process.env.BETTER_AUTH_URL,
  ].filter((origin): origin is string => Boolean(origin)),
  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production",
  },
  socialProviders: getConfiguredSocialProviders(),
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["google", "github"],
    },
  },
  databaseHooks: {
    user: {
      create: {
        async before(user) {
          const pendingInvite = await getPendingInviteForEmail(user.email);

          if (!pendingInvite) {
            throw new APIError("FORBIDDEN", {
              message:
                "That email does not have a valid invite. Ask for a fresh invite link and try again.",
            });
          }

          return {
            data: {
              ...user,
              email: pendingInvite.email,
              name:
                user.name?.trim() ||
                pendingInvite.name?.trim() ||
                pendingInvite.email.split("@")[0] ||
                "Driver",
            },
          };
        },
        async after(user) {
          await markInviteAccepted(user.email, user.id);
        },
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 14,
    updateAge: 60 * 60 * 12,
  },
  plugins: [
    nextCookies(),
    magicLink({
      async sendMagicLink({ email, url }) {
        await sendMagicLinkEmail({ email, url });
      },
    }),
    passkey({
      rpName: "F1 Hub",
      origin: process.env.BETTER_AUTH_URL ?? "http://localhost:3001",
    }),
  ],
});

export type AuthSession = typeof auth.$Infer.Session;
