-- Migration: Add refinement columns to post_history
-- Tracks refined content produced by the RefinementStep (GPT-5.4).

ALTER TABLE post_history
  ADD COLUMN IF NOT EXISTS refined_content TEXT,
  ADD COLUMN IF NOT EXISTS refinement_notes TEXT,
  ADD COLUMN IF NOT EXISTS refinement_prompt TEXT;

COMMENT ON COLUMN post_history.refined_content    IS 'Post content after GPT-5.4 refinement pass';
COMMENT ON COLUMN post_history.refinement_notes   IS 'Explanation / reasoning returned by the refinement model';
COMMENT ON COLUMN post_history.refinement_prompt  IS 'The refinement prompt used for this post';
