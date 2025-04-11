-- Add anonymous column to feedback table
ALTER TABLE public.feedback 
ADD COLUMN IF NOT EXISTS anonymous boolean DEFAULT false NOT NULL;

-- Add comment to explain the purpose of the column
COMMENT ON COLUMN public.feedback.anonymous IS 'Indicates if the user wants to submit feedback anonymously'; 