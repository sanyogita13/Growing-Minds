CREATE TABLE organizations (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(120) UNIQUE NOT NULL,
    plan VARCHAR(50) NOT NULL DEFAULT 'pro',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(30) NOT NULL CHECK (role IN ('admin', 'hr')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, email)
);

CREATE TABLE jobs (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES users(id),
    title VARCHAR(255) NOT NULL,
    department VARCHAR(120),
    location VARCHAR(120),
    employment_type VARCHAR(60),
    description TEXT NOT NULL,
    required_skills JSONB NOT NULL DEFAULT '[]'::jsonb,
    preferred_skills JSONB NOT NULL DEFAULT '[]'::jsonb,
    min_experience_years NUMERIC(4,1),
    education_requirements JSONB NOT NULL DEFAULT '[]'::jsonb,
    scoring_weights JSONB NOT NULL DEFAULT '{"skill_match": 40, "experience": 30, "education": 15, "additional": 15}'::jsonb,
    status VARCHAR(30) NOT NULL DEFAULT 'draft',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE candidates (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    source VARCHAR(50) NOT NULL DEFAULT 'upload',
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    current_title VARCHAR(255),
    total_experience_years NUMERIC(4,1),
    highest_education VARCHAR(255),
    parsed_resume JSONB NOT NULL DEFAULT '{}'::jsonb,
    resume_text TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE candidate_files (
    id UUID PRIMARY KEY,
    candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    storage_key TEXT NOT NULL,
    uploaded_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE analyses (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    processing_status VARCHAR(40) NOT NULL DEFAULT 'queued',
    final_score NUMERIC(5,2),
    skill_match_score NUMERIC(5,2),
    experience_score NUMERIC(5,2),
    education_score NUMERIC(5,2),
    additional_score NUMERIC(5,2),
    semantic_similarity_score NUMERIC(5,2),
    pros JSONB NOT NULL DEFAULT '[]'::jsonb,
    cons JSONB NOT NULL DEFAULT '[]'::jsonb,
    strengths JSONB NOT NULL DEFAULT '[]'::jsonb,
    weaknesses JSONB NOT NULL DEFAULT '[]'::jsonb,
    recommendation VARCHAR(30),
    llm_explanation TEXT,
    bias_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (candidate_id, job_id)
);

CREATE TABLE activities (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID,
    action VARCHAR(100) NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE subscriptions (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL DEFAULT 'stripe',
    provider_customer_id VARCHAR(255),
    provider_subscription_id VARCHAR(255),
    seats INTEGER NOT NULL DEFAULT 5,
    resumes_quota INTEGER NOT NULL DEFAULT 1000,
    status VARCHAR(30) NOT NULL DEFAULT 'active',
    renewal_at TIMESTAMPTZ
);

CREATE INDEX idx_users_org ON users (organization_id);
CREATE INDEX idx_jobs_org ON jobs (organization_id);
CREATE INDEX idx_candidates_org ON candidates (organization_id);
CREATE INDEX idx_analyses_org_job ON analyses (organization_id, job_id);
CREATE INDEX idx_activities_org ON activities (organization_id, created_at DESC);
