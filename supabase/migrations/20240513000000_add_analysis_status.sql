-- Add analysis status tracking columns to meetings table

-- First, create the enum type if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'analysis_status_type') THEN
    CREATE TYPE analysis_status_type AS ENUM ('not_started', 'in_progress', 'completed', 'failed');
  END IF;
END $$;

-- Add the new columns to the meetings table
ALTER TABLE meetings
ADD COLUMN IF NOT EXISTS analysis_status analysis_status_type DEFAULT 'not_started'::analysis_status_type,
ADD COLUMN IF NOT EXISTS analysis_error TEXT;

-- Update existing meetings with analysis status
UPDATE meetings
SET analysis_status = 
  CASE 
    WHEN has_analysis = true THEN 'completed'::analysis_status_type
    ELSE 'not_started'::analysis_status_type
  END; 