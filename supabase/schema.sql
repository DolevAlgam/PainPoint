-- Create schema for the PainPoint application

-- Enable RLS (Row Level Security)
alter default privileges revoke execute on functions from public;

-- Create tables for the PainPoint application

-- Companies table
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  industry TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Contacts table
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Meetings table
CREATE TABLE IF NOT EXISTS meetings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  time TIME NOT NULL,
  notes TEXT,
  status TEXT NOT NULL CHECK (status IN ('scheduled', 'completed', 'analyzed')) DEFAULT 'scheduled',
  has_recording BOOLEAN DEFAULT FALSE,
  has_transcript BOOLEAN DEFAULT FALSE,
  has_analysis BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Recordings table
CREATE TABLE IF NOT EXISTS recordings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  duration NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Transcripts table
CREATE TABLE IF NOT EXISTS transcripts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  recording_id UUID REFERENCES recordings(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Pain Points table
CREATE TABLE IF NOT EXISTS pain_points (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  root_cause TEXT NOT NULL,
  impact TEXT NOT NULL CHECK (impact IN ('High', 'Medium', 'Low', 'Not explicitly mentioned')), -- Can also indicate if no impact level was specified
  citations TEXT, -- Stores direct quotes from the transcript that support this pain point
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Industries table (for predefined list)
CREATE TABLE IF NOT EXISTS industries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Roles table (for predefined list)
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Create a function to add default data for new users
CREATE OR REPLACE FUNCTION add_default_data_for_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Add default industries
  BEGIN
    INSERT INTO industries (name, user_id) VALUES 
    ('Software', NEW.id),
    ('Technology', NEW.id),
    ('SaaS', NEW.id),
    ('Finance', NEW.id),
    ('Healthcare', NEW.id),
    ('Education', NEW.id),
    ('Retail', NEW.id),
    ('E-commerce', NEW.id),
    ('Manufacturing', NEW.id),
    ('Logistics', NEW.id),
    ('Real Estate', NEW.id),
    ('Media', NEW.id),
    ('Entertainment', NEW.id),
    ('Hospitality', NEW.id),
    ('Telecommunications', NEW.id),
    ('Marketing', NEW.id),
    ('Consulting', NEW.id),
    ('Nonprofit', NEW.id),
    ('Government', NEW.id),
    ('Automotive', NEW.id),
    ('Energy', NEW.id),
    ('Agriculture', NEW.id),
    ('Biotechnology', NEW.id),
    ('Fashion', NEW.id),
    ('Sports', NEW.id),
    ('Travel', NEW.id),
    ('Food & Beverage', NEW.id),
    ('Other', NEW.id);
  EXCEPTION WHEN OTHERS THEN
    -- Log error but continue execution
    RAISE NOTICE 'Error inserting industries: %', SQLERRM;
  END;

  -- Add default roles
  BEGIN
    INSERT INTO roles (name, user_id) VALUES 
    ('CEO', NEW.id),
    ('CTO', NEW.id),
    ('COO', NEW.id),
    ('CIO', NEW.id),
    ('Product Manager', NEW.id),
    ('Engineering Manager', NEW.id),
    ('Software Engineer', NEW.id),
    ('Data Scientist', NEW.id),
    ('DevOps Engineer', NEW.id),
    ('QA Engineer', NEW.id),
    ('Project Manager', NEW.id),
    ('Marketing Manager', NEW.id),
    ('Sales Manager', NEW.id),
    ('Business Analyst', NEW.id),
    ('Financial Analyst', NEW.id),
    ('HR Manager', NEW.id),
    ('Operations Manager', NEW.id),
    ('Customer Support Specialist', NEW.id),
    ('Account Manager', NEW.id),
    ('Content Strategist', NEW.id),
    ('Graphic Designer', NEW.id),
    ('UX/UI Designer', NEW.id),
    ('Data Engineer', NEW.id),
    ('Network Administrator', NEW.id),
    ('IT Support Specialist', NEW.id),
    ('Research Analyst', NEW.id),
    ('Executive Assistant', NEW.id),
    ('Other', NEW.id);
  EXCEPTION WHEN OTHERS THEN
    -- Log error but continue execution
    RAISE NOTICE 'Error inserting roles: %', SQLERRM;
  END;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Catch any other errors so the user creation still succeeds
  RAISE NOTICE 'Error in add_default_data_for_new_user: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a trigger to execute this function when a new user signs up
CREATE OR REPLACE TRIGGER add_default_data_on_signup
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION add_default_data_for_new_user();

-- Set up RLS (Row Level Security)

-- Enable RLS on all tables
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pain_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE industries ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

-- Create policies for each table

-- Companies policies
CREATE POLICY companies_select ON companies FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY companies_insert ON companies FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY companies_update ON companies FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY companies_delete ON companies FOR DELETE USING (auth.uid() = user_id);

-- Contacts policies
CREATE POLICY contacts_select ON contacts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY contacts_insert ON contacts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY contacts_update ON contacts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY contacts_delete ON contacts FOR DELETE USING (auth.uid() = user_id);

-- Meetings policies
CREATE POLICY meetings_select ON meetings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY meetings_insert ON meetings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY meetings_update ON meetings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY meetings_delete ON meetings FOR DELETE USING (auth.uid() = user_id);

-- Recordings policies
CREATE POLICY recordings_select ON recordings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY recordings_insert ON recordings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY recordings_update ON recordings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY recordings_delete ON recordings FOR DELETE USING (auth.uid() = user_id);

-- Transcripts policies
CREATE POLICY transcripts_select ON transcripts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY transcripts_insert ON transcripts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY transcripts_update ON transcripts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY transcripts_delete ON transcripts FOR DELETE USING (auth.uid() = user_id);

-- Pain Points policies
CREATE POLICY pain_points_select ON pain_points FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY pain_points_insert ON pain_points FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY pain_points_update ON pain_points FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY pain_points_delete ON pain_points FOR DELETE USING (auth.uid() = user_id);

-- Industries policies (allow all users to see predefined industries)
DROP POLICY IF EXISTS industries_select ON industries;
CREATE POLICY industries_select ON industries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY industries_insert ON industries FOR INSERT WITH CHECK (auth.uid() = user_id);
ALTER TABLE industries DROP CONSTRAINT IF EXISTS industries_name_key;
ALTER TABLE industries ADD CONSTRAINT industries_name_user_id_key UNIQUE (name, user_id);
CREATE POLICY industries_update ON industries FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY industries_delete ON industries FOR DELETE USING (auth.uid() = user_id);

-- Roles policies (allow all users to see predefined roles)
DROP POLICY IF EXISTS roles_select ON roles;
CREATE POLICY roles_select ON roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY roles_insert ON roles FOR INSERT WITH CHECK (auth.uid() = user_id);
ALTER TABLE roles DROP CONSTRAINT IF EXISTS roles_name_key;
ALTER TABLE roles ADD CONSTRAINT roles_name_user_id_key UNIQUE (name, user_id);
CREATE POLICY roles_update ON roles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY roles_delete ON roles FOR DELETE USING (auth.uid() = user_id); 