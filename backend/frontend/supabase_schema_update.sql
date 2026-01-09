-- Add resume columns to interview_bookings table
-- Run this in Supabase SQL Editor

ALTER TABLE interview_bookings 
ADD COLUMN IF NOT EXISTS resume_text TEXT,
ADD COLUMN IF NOT EXISTS resume_url TEXT;

-- Verify the columns were added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'interview_bookings' 
AND column_name IN ('resume_text', 'resume_url');

