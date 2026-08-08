-- Lösenordsinloggning och engångslänkar.
--
-- passwordHash är nullbar med flit. Kontona som redan finns skapades med magisk
-- länk och har inget lösenord; att kräva ett här hade låst ute dem. De tar sig
-- in via återställningsflödet i stället.
ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT;

CREATE TYPE "AuthTokenPurpose" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET', 'EMAIL_CHANGE');

-- Primärnyckeln är SHA-256 av hemligheten i länken, inte hemligheten själv.
-- Den som läser tabellen kan därmed inte använda raderna för att logga in som
-- någon annan — samma skäl som att lösenord inte lagras i klartext.
CREATE TABLE "AuthToken" (
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" "AuthTokenPurpose" NOT NULL,
    "newEmail" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthToken_pkey" PRIMARY KEY ("tokenHash")
);

CREATE INDEX "AuthToken_userId_purpose_idx" ON "AuthToken"("userId", "purpose");

-- Städningen av utgångna länkar går på det här indexet.
CREATE INDEX "AuthToken_expiresAt_idx" ON "AuthToken"("expiresAt");

-- Kaskaden är inte en detalj: GDPR-raderingen i lib/account/actions.ts förlitar
-- sig på att schemat städar allt som hänger på en användare. En ny tabell utan
-- kaskad hade lämnat kvar persondata utan att något larmat.
ALTER TABLE "AuthToken" ADD CONSTRAINT "AuthToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
