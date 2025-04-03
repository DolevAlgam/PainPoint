-- Migration to update the impact column constraint in pain_points table
ALTER TABLE pain_points DROP CONSTRAINT IF EXISTS pain_points_impact_check;
ALTER TABLE pain_points ADD CONSTRAINT pain_points_impact_check CHECK (impact IN ('High', 'Medium', 'Low', 'Not explicitly mentioned')); 