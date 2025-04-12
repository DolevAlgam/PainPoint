-- Add transcript_outdated and analysis_outdated flags to meetings
ALTER TABLE meetings 
ADD COLUMN IF NOT EXISTS transcript_outdated BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS analysis_outdated BOOLEAN DEFAULT FALSE;

-- Comment for transcript_outdated
COMMENT ON COLUMN meetings.transcript_outdated IS 'Flag indicating that a new recording has been uploaded and the transcript needs to be regenerated';

-- Comment for analysis_outdated
COMMENT ON COLUMN meetings.analysis_outdated IS 'Flag indicating that a new recording has been uploaded and the pain point analysis needs to be regenerated'; 