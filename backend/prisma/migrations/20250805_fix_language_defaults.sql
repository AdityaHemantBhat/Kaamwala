-- Fix language defaults to match the app runtime default (English).
--
-- 1. User.preferredLang: the column default was 'hi', so every account silently
--    got Hindi even though the app default is English. Change the default AND
--    correct existing rows that hold the wrong default (the value was never set
--    by a real user choice — the mobile app never sent it before).
-- 2. WorkerProfile.languages: same default mismatch ('hi' -> 'en'). Existing
--    rows are left untouched (they may reflect real spoken languages once the
--    settings sync starts writing them); only the new-row default changes.

ALTER TABLE "User" ALTER COLUMN "preferredLang" SET DEFAULT 'en';
UPDATE "User" SET "preferredLang" = 'en' WHERE "preferredLang" = 'hi';

ALTER TABLE "WorkerProfile" ALTER COLUMN "languages" SET DEFAULT ARRAY['en']::TEXT[];
