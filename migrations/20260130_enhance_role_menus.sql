-- Migration to add visual customization columns to role_menus table

ALTER TABLE role_menus 
ADD COLUMN IF NOT EXISTS embed_color VARCHAR(20) DEFAULT '#2B2D31',
ADD COLUMN IF NOT EXISTS thumbnail TEXT,
ADD COLUMN IF NOT EXISTS image TEXT,
ADD COLUMN IF NOT EXISTS footer TEXT,
ADD COLUMN IF NOT EXISTS author_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS author_icon TEXT;
