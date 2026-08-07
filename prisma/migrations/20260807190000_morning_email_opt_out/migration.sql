-- AlterTable
-- Nullbar utan default: befintliga användare prenumererar även efter
-- migrationen, vilket är rätt förvalt. Att avregistrera någon som inte bett om
-- det vore en tystare bugg än motsatsen.
ALTER TABLE "User" ADD COLUMN "morningEmailOptOutAt" TIMESTAMP(3);
