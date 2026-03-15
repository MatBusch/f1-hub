import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("createdAt", {
    withTimezone: true,
    mode: "date",
  }).notNull(),
  updatedAt: timestamp("updatedAt", {
    withTimezone: true,
    mode: "date",
  }).notNull(),
} as const;

export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    emailVerified: boolean("emailVerified").notNull().default(false),
    name: text("name").notNull(),
    image: text("image"),
    ...timestamps,
  },
  (table) => ({
    emailUnique: uniqueIndex("user_email_unique").on(table.email),
  }),
);

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expiresAt", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    token: text("token").notNull(),
    ipAddress: text("ipAddress"),
    userAgent: text("userAgent"),
    ...timestamps,
  },
  (table) => ({
    tokenUnique: uniqueIndex("session_token_unique").on(table.token),
    userIdIdx: index("session_user_id_idx").on(table.userId),
  }),
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("accountId").notNull(),
    providerId: text("providerId").notNull(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("accessToken"),
    refreshToken: text("refreshToken"),
    idToken: text("idToken"),
    accessTokenExpiresAt: timestamp("accessTokenExpiresAt", {
      withTimezone: true,
      mode: "date",
    }),
    refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt", {
      withTimezone: true,
      mode: "date",
    }),
    scope: text("scope"),
    password: text("password"),
    ...timestamps,
  },
  (table) => ({
    providerAccountUnique: uniqueIndex("account_provider_account_unique").on(
      table.providerId,
      table.accountId,
    ),
    userIdIdx: index("account_user_id_idx").on(table.userId),
  }),
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expiresAt", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    ...timestamps,
  },
  (table) => ({
    identifierIdx: index("verification_identifier_idx").on(table.identifier),
    valueIdx: index("verification_value_idx").on(table.value),
  }),
);

export const passkey = pgTable(
  "passkey",
  {
    id: text("id").primaryKey(),
    name: text("name"),
    publicKey: text("publicKey").notNull(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    credentialID: text("credentialID").notNull(),
    counter: integer("counter").notNull(),
    deviceType: text("deviceType").notNull(),
    backedUp: boolean("backedUp").notNull(),
    transports: text("transports"),
    aaguid: text("aaguid"),
    createdAt: timestamp("createdAt", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
  },
  (table) => ({
    credentialUnique: uniqueIndex("passkey_credential_id_unique").on(
      table.credentialID,
    ),
    userIdIdx: index("passkey_user_id_idx").on(table.userId),
  }),
);

export const invite = pgTable(
  "invite",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull(),
    email: text("email").notNull(),
    name: text("name"),
    invitedBy: text("invitedBy"),
    note: text("note"),
    acceptedByUserId: text("acceptedByUserId").references(() => user.id, {
      onDelete: "set null",
    }),
    expiresAt: timestamp("expiresAt", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    acceptedAt: timestamp("acceptedAt", {
      withTimezone: true,
      mode: "date",
    }),
    revokedAt: timestamp("revokedAt", {
      withTimezone: true,
      mode: "date",
    }),
    ...timestamps,
  },
  (table) => ({
    tokenUnique: uniqueIndex("invite_token_unique").on(table.token),
    emailIdx: index("invite_email_idx").on(table.email),
    acceptedByUserIdIdx: index("invite_accepted_by_user_id_idx").on(
      table.acceptedByUserId,
    ),
  }),
);
