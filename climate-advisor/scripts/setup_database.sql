-- Climate Advisor Database Setup Script
-- This script creates the required tables for the Climate Advisor service

-- Create enum type for message roles first
DO $$ BEGIN
    CREATE TYPE message_role AS ENUM ('user', 'assistant', 'system');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create threads table
CREATE TABLE IF NOT EXISTS threads (
    thread_id UUID PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    inventory_id VARCHAR(255),
    title VARCHAR(255),
    context JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create indexes for threads table
CREATE INDEX IF NOT EXISTS ix_threads_user_id ON threads (user_id);

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
    message_id UUID PRIMARY KEY,
    thread_id UUID NOT NULL REFERENCES threads(thread_id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL,
    text TEXT NOT NULL,
    tools_used JSONB,
    role message_role NOT NULL DEFAULT 'user',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create enum type for message roles if it doesn't exist
DO $$ BEGIN
    CREATE TYPE message_role AS ENUM ('user', 'assistant', 'system');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create indexes for messages table
CREATE INDEX IF NOT EXISTS ix_messages_thread_id ON messages (thread_id);

-- Grant permissions to climateadvisor user
GRANT ALL PRIVILEGES ON TABLE threads TO climateadvisor;
GRANT ALL PRIVILEGES ON TABLE messages TO climateadvisor;
