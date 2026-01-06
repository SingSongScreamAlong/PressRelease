-- =============================================================================
-- ReadAllAboutIt - PostgreSQL Schema
-- =============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------
-- Keywords: Seed topics for query discovery
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS keywords (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    keyword VARCHAR(255) NOT NULL UNIQUE,
    category VARCHAR(100),
    priority INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_keywords_active ON keywords(is_active);
CREATE INDEX idx_keywords_category ON keywords(category);

-- -----------------------------------------------------------------------------
-- Queries: Discovered search queries/questions
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS queries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    keyword_id UUID REFERENCES keywords(id) ON DELETE CASCADE,
    query TEXT NOT NULL UNIQUE,
    normalized_query TEXT NOT NULL,
    
    -- Scoring
    intent_score DECIMAL(3, 2) DEFAULT 0,
    evergreen_score DECIMAL(3, 2) DEFAULT 0,
    ymyl_risk_score DECIMAL(3, 2) DEFAULT 0,
    combined_score DECIMAL(3, 2) DEFAULT 0,
    
    -- Classification
    is_ymyl BOOLEAN DEFAULT false,
    ymyl_category VARCHAR(50),
    topic_category VARCHAR(100),
    
    -- Status
    status VARCHAR(20) DEFAULT 'pending', -- pending, approved, rejected, published
    review_notes TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_queries_status ON queries(status);
CREATE INDEX idx_queries_score ON queries(combined_score DESC);
CREATE INDEX idx_queries_ymyl ON queries(is_ymyl);
CREATE INDEX idx_queries_keyword ON queries(keyword_id);

-- -----------------------------------------------------------------------------
-- Jobs: Pipeline run tracking
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_type VARCHAR(50) NOT NULL, -- discover, generate, publish, refresh
    status VARCHAR(20) DEFAULT 'pending', -- pending, running, completed, failed
    
    -- Metrics
    items_processed INTEGER DEFAULT 0,
    items_succeeded INTEGER DEFAULT 0,
    items_failed INTEGER DEFAULT 0,
    
    -- Timing
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Error tracking
    error_message TEXT,
    error_stack TEXT,
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_jobs_type ON jobs(job_type);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_created ON jobs(created_at DESC);

-- -----------------------------------------------------------------------------
-- Posts: Published content tracking
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    query_id UUID REFERENCES queries(id) ON DELETE SET NULL,
    
    -- WordPress data
    wp_post_id INTEGER,
    slug VARCHAR(255) NOT NULL UNIQUE,
    title TEXT NOT NULL,
    
    -- Content versioning
    content_hash VARCHAR(64),
    version INTEGER DEFAULT 1,
    
    -- Status
    status VARCHAR(20) DEFAULT 'draft', -- draft, published, archived
    
    -- Publishing timeline
    first_published_at TIMESTAMP WITH TIME ZONE,
    last_published_at TIMESTAMP WITH TIME ZONE,
    last_refreshed_at TIMESTAMP WITH TIME ZONE,
    next_refresh_at TIMESTAMP WITH TIME ZONE,
    
    -- Quality metrics
    word_count INTEGER,
    heading_count INTEGER,
    has_faq BOOLEAN DEFAULT false,
    has_sources BOOLEAN DEFAULT false,
    quality_score DECIMAL(3, 2),
    
    -- Metadata
    category VARCHAR(100),
    tags TEXT[],
    meta_description TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_posts_query ON posts(query_id);
CREATE INDEX idx_posts_wp_id ON posts(wp_post_id);
CREATE INDEX idx_posts_slug ON posts(slug);
CREATE INDEX idx_posts_status ON posts(status);
CREATE INDEX idx_posts_refresh ON posts(next_refresh_at);
CREATE INDEX idx_posts_category ON posts(category);

-- -----------------------------------------------------------------------------
-- Sources: Citation references per post
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
    
    url TEXT NOT NULL,
    title TEXT,
    domain VARCHAR(255),
    
    -- Verification
    is_verified BOOLEAN DEFAULT false,
    last_checked_at TIMESTAMP WITH TIME ZONE,
    http_status INTEGER,
    
    retrieved_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sources_post ON sources(post_id);
CREATE INDEX idx_sources_domain ON sources(domain);

-- -----------------------------------------------------------------------------
-- Metrics: Placeholder for future Search Console integration
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
    
    date DATE NOT NULL,
    impressions INTEGER DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    ctr DECIMAL(5, 4) DEFAULT 0,
    position DECIMAL(5, 2),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(post_id, date)
);

CREATE INDEX idx_metrics_post ON metrics(post_id);
CREATE INDEX idx_metrics_date ON metrics(date DESC);

-- -----------------------------------------------------------------------------
-- Content similarity tracking (for deduplication)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS content_fingerprints (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
    
    fingerprint_type VARCHAR(20) NOT NULL, -- shingle, minhash
    fingerprint TEXT NOT NULL,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_fingerprints_post ON content_fingerprints(post_id);
CREATE INDEX idx_fingerprints_hash ON content_fingerprints(fingerprint);

-- -----------------------------------------------------------------------------
-- Publishing log (audit trail)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS publish_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
    
    action VARCHAR(20) NOT NULL, -- create, update, refresh
    wp_response JSONB,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_publish_log_post ON publish_log(post_id);
CREATE INDEX idx_publish_log_action ON publish_log(action);

-- -----------------------------------------------------------------------------
-- Functions: Auto-update timestamps
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers
CREATE TRIGGER update_keywords_updated_at
    BEFORE UPDATE ON keywords
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_queries_updated_at
    BEFORE UPDATE ON queries
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_posts_updated_at
    BEFORE UPDATE ON posts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
