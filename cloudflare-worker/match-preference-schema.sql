-- Existing installations only; fresh installations use schema.sql.
ALTER TABLE jobs ADD COLUMN match_gender TEXT NOT NULL DEFAULT 'auto' CHECK(match_gender IN ('auto','male','female'));
