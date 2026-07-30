-- Pinico schema. Paste into Supabase > SQL Editor and run once.
-- RLS is intentionally OFF: all DB access is server-side via the service role
-- key. There are no client-side queries. Revisit before any real user.

CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth0_user_id TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  full_name TEXT,
  jira_account_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE async_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  status_text TEXT NOT NULL,
  blockers_text TEXT,
  date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recall_bot_id TEXT UNIQUE NOT NULL,
  meeting_url TEXT NOT NULL,
  status TEXT DEFAULT 'scheduled', -- 'scheduled' | 'in_call' | 'completed'
  duration_minutes INT DEFAULT 0,
  -- Track B appends live transcript chunks here; flushed on each extraction.
  transcript_buffer TEXT DEFAULT '',
  -- Last chunk arrival, so the extractor can detect a speech pause.
  last_chunk_at TIMESTAMP WITH TIME ZONE,
  stripe_customer_id TEXT,
  -- Who dispatched this bot — needed for persona lookup in agent.ts
  user_id UUID REFERENCES profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID REFERENCES meetings(id),
  jira_ticket_key TEXT NOT NULL,
  summary TEXT NOT NULL,
  description TEXT,
  assignee_email TEXT,
  priority TEXT DEFAULT 'High',
  -- Normalized summary. The unique index below is what actually stops the
  -- same spoken blocker becoming three tickets.
  dedupe_key TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX tickets_dedupe ON tickets (meeting_id, dedupe_key);

-- ---- V2 additions (HANDOFF-V2.md §6) ----

-- Agent context — what the bot knows about the user it represents.
CREATE TABLE agent_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) UNIQUE,
  current_work TEXT NOT NULL DEFAULT '',
  active_blockers TEXT DEFAULT '',
  recent_wins TEXT DEFAULT '',
  communication_style TEXT DEFAULT 'Direct and professional',
  delegation_instructions TEXT DEFAULT '',
  topics_to_track TEXT DEFAULT '',
  questions_for_team TEXT DEFAULT '',
  meeting_goal TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
