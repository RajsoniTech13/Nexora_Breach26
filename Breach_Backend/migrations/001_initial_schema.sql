
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    avatar_url TEXT,
    upi_id VARCHAR(100),
    is_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    cover_image TEXT,
    created_by UUID REFERENCES users(id),
    currency VARCHAR(3) DEFAULT 'INR',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TYPE member_role AS ENUM ('admin', 'member');
CREATE TABLE group_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID REFERENCES groups(id),
    user_id UUID REFERENCES users(id),
    role member_role DEFAULT 'member',
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(group_id, user_id)
);

CREATE TYPE account_type AS ENUM ('user_payable', 'user_receivable', 'group_expense');
CREATE TABLE ledger_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID REFERENCES groups(id),
    user_id UUID REFERENCES users(id),
    type account_type NOT NULL,
    current_balance DECIMAL(12,2) DEFAULT 0.00
);

CREATE TYPE split_method AS ENUM ('equal', 'percentage', 'custom');
CREATE TABLE expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID REFERENCES groups(id),
    paid_by UUID REFERENCES users(id),
    amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) DEFAULT 'INR',
    description VARCHAR(255) NOT NULL,
    category VARCHAR(50),
    split_type split_method NOT NULL,
    receipt_url TEXT,
    expense_date DATE NOT NULL,
    is_deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE expense_splits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    expense_id UUID REFERENCES expenses(id),
    user_id UUID REFERENCES users(id),
    owed_amount DECIMAL(12,2) NOT NULL,
    percentage DECIMAL(5,2),
    is_settled BOOLEAN DEFAULT false
);

CREATE TYPE settlement_status AS ENUM ('pending', 'completed', 'failed');
CREATE TABLE settlements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID REFERENCES groups(id),
    from_user UUID REFERENCES users(id),
    to_user UUID REFERENCES users(id),
    amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) DEFAULT 'INR',
    status settlement_status DEFAULT 'pending',
    payment_reference VARCHAR(255),
    payment_method VARCHAR(50),
    settled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TYPE entry_side AS ENUM ('debit', 'credit');
CREATE TYPE ref_type AS ENUM ('expense', 'settlement', 'refund');
CREATE TABLE ledger_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID REFERENCES ledger_accounts(id),
    reference_id UUID NOT NULL,
    reference_type ref_type NOT NULL,
    amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
    entry_type entry_side NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TYPE action_enum AS ENUM (
    'expense_added',
    'expense_updated',
    'expense_deleted',
    'settlement_made',
    'member_added',
    'member_removed'
);
CREATE TABLE activity_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID REFERENCES groups(id),
    user_id UUID REFERENCES users(id),
    action_type action_enum NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_expenses_grp ON expenses(group_id) WHERE is_deleted = false;
CREATE INDEX idx_expense_splits_exp ON expense_splits(expense_id);
CREATE INDEX idx_settlements_grp ON settlements(group_id);
CREATE INDEX idx_ledger_entries_ref ON ledger_entries(reference_id, reference_type);
CREATE INDEX idx_group_members_user ON group_members(user_id);
CREATE INDEX idx_activity_log_grp ON activity_log(group_id);
