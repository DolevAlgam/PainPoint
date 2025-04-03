-- Migration to add citations field to pain_points table
ALTER TABLE IF EXISTS pain_points
ADD COLUMN IF NOT EXISTS citations TEXT; 