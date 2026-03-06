-- Supabase Schema for Social Media Content Orchestrator
-- Run this in your Supabase SQL Editor to create the required tables

-- Pipeline Runs Table
-- Stores the state and results of each pipeline execution
CREATE TABLE IF NOT EXISTS pipeline_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT DEFAULT 'running',
  dry_run BOOLEAN DEFAULT FALSE,
  news_items JSONB DEFAULT '[]'::jsonb,
  posts JSONB DEFAULT '[]'::jsonb,
  image_sets JSONB DEFAULT '[]'::jsonb,
  publish_results JSONB DEFAULT '[]'::jsonb,
  error_log JSONB DEFAULT '[]'::jsonb,
  agent_statuses JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE pipeline_runs ENABLE ROW LEVEL SECURITY;

-- Create policy for service role access (or adjust for your auth needs)
CREATE POLICY "Allow all operations for authenticated users" ON pipeline_runs
  FOR ALL USING (true);

-- Create index for faster queries
CREATE INDEX idx_pipeline_runs_started_at ON pipeline_runs(started_at DESC);
CREATE INDEX idx_pipeline_runs_status ON pipeline_runs(status);

-- Approval Queue Table
-- Stores posts that require human approval before publishing
CREATE TABLE IF NOT EXISTS approval_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id TEXT UNIQUE NOT NULL,
  post_data JSONB NOT NULL,
  images_data JSONB,
  status TEXT DEFAULT 'pending',
  reviewer_notes TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE approval_queue ENABLE ROW LEVEL SECURITY;

-- Create policy for service role access
CREATE POLICY "Allow all operations for authenticated users" ON approval_queue
  FOR ALL USING (true);

-- Create indexes
CREATE INDEX idx_approval_queue_status ON approval_queue(status);
CREATE INDEX idx_approval_queue_submitted_at ON approval_queue(submitted_at DESC);
CREATE INDEX idx_approval_queue_post_id ON approval_queue(post_id);

-- Analytics Table
-- Tracks performance metrics for published posts
CREATE TABLE IF NOT EXISTS analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  post_url TEXT,
  published_at TIMESTAMPTZ NOT NULL,
  impressions JSONB DEFAULT '{}'::jsonb,
  engagement JSONB DEFAULT '{}'::jsonb,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS)
ALTER TABLE analytics ENABLE ROW LEVEL SECURITY;

-- Create policy for service role access
CREATE POLICY "Allow all operations for authenticated users" ON analytics
  FOR ALL USING (true);

-- Create indexes
CREATE INDEX idx_analytics_post_id ON analytics(post_id);
CREATE INDEX idx_analytics_platform ON analytics(platform);
CREATE INDEX idx_analytics_published_at ON analytics(published_at DESC);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_pipeline_runs_updated_at
  BEFORE UPDATE ON pipeline_runs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_approval_queue_updated_at
  BEFORE UPDATE ON approval_queue
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Optional: Create a view for recent pipeline summaries
CREATE OR REPLACE VIEW pipeline_summaries AS
SELECT 
  id,
  started_at,
  completed_at,
  status,
  dry_run,
  jsonb_array_length(news_items) as news_count,
  jsonb_array_length(posts) as post_count,
  jsonb_array_length(image_sets) as image_set_count,
  jsonb_array_length(publish_results) as publish_count,
  jsonb_array_length(error_log) as error_count
FROM pipeline_runs
ORDER BY started_at DESC;

-- Optional: Create a view for pending approvals
CREATE OR REPLACE VIEW pending_approvals AS
SELECT 
  id,
  post_id,
  post_data->>'platform' as platform,
  post_data->>'content' as content_preview,
  submitted_at,
  status
FROM approval_queue
WHERE status = 'pending'
ORDER BY submitted_at DESC;
