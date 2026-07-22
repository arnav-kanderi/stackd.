-- stackd. Section 1 — core schema
-- Verbatim from stackd-master-spec.md §5. Do not modify column names, types, or defaults.

-- Opportunities
create table if not exists opportunities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null, -- Internship | Summer Program | Job | Competition | Scholarship
  description text,
  link text,
  logo_url text,
  deadline date,
  eligibility_grade text[],
  eligibility_citizenship text,
  eligibility_gpa_min numeric,
  eligibility_location text,
  eligibility_other text,
  interest_tags text[],
  est_completion_time text,
  application_requirements text[], -- must map cleanly to user_documents.doc_type values
  is_active boolean default true,
  created_at timestamp default now()
);

-- Users
create table if not exists profiles (
  id uuid primary key references auth.users(id),
  grade text,
  location text,
  gender text,
  citizenship_status text,
  gpa numeric,
  interest_tags text[],
  career_exam_results jsonb,
  linkedin_imported boolean default false,
  subscription_tier text default 'free',          -- 'free' | 'premium'
  subscription_source text default 'individual',   -- 'individual' | 'school'
  stack_count int default 0,                       -- enforces the 10-item free cap
  created_at timestamp default now()
);

-- Document vault
create table if not exists user_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  doc_type text, -- 'resume' | 'transcript' | 'essay' | 'activity_list'
  storage_path text,
  parsed_content jsonb, -- cached AI-parsed output, computed once per upload
  updated_at timestamp default now()
);

-- Recommendation contacts
create table if not exists recommendation_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  name text,
  email text,
  relationship text,
  status text default 'not_requested' -- not_requested | requested | received
);

-- My Stack
create table if not exists stack_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  opportunity_id uuid references opportunities(id),
  status text default 'Saved', -- Saved | In Progress | Ready to Submit | Due Soon | Stackd
  match_score numeric,          -- cached, recomputed only on profile/opportunity change
  match_breakdown jsonb,
  created_at timestamp default now(),
  unique(user_id, opportunity_id)
);

-- Checklist items per stacked opportunity
create table if not exists checklist_items (
  id uuid primary key default gen_random_uuid(),
  stack_item_id uuid references stack_items(id),
  task_name text,
  is_complete boolean default false
);

-- Chat history
create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  role text, -- 'user' | 'assistant'
  content text,
  created_at timestamp default now()
);
