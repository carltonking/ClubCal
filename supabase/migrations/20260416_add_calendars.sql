-- Create calendars table
CREATE TABLE IF NOT EXISTS calendars (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  club_id uuid REFERENCES clubs(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Add calendar_id to events (nullable — events without a calendar appear in the main club feed only)
ALTER TABLE events ADD COLUMN IF NOT EXISTS calendar_id uuid REFERENCES calendars(id) ON DELETE SET NULL;

-- Enable RLS
ALTER TABLE calendars ENABLE ROW LEVEL SECURITY;

-- Club owners can manage their own calendars.
-- Drop-first so the migration is idempotent: the calendars table and these
-- policies predate migration tracking (created via the Supabase dashboard), so
-- a plain CREATE POLICY would fail with "already exists" on push.
DROP POLICY IF EXISTS "clubs can manage own calendars" ON calendars;
CREATE POLICY "clubs can manage own calendars"
  ON calendars
  USING (club_id IN (SELECT id FROM clubs WHERE user_id = auth.uid()))
  WITH CHECK (club_id IN (SELECT id FROM clubs WHERE user_id = auth.uid()));

-- Anyone can read calendars (for iCal feed lookups)
DROP POLICY IF EXISTS "public can read calendars" ON calendars;
CREATE POLICY "public can read calendars"
  ON calendars FOR SELECT
  USING (true);
