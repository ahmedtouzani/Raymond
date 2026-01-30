-- Migration to create role_menus and role_menu_options tables

CREATE TABLE IF NOT EXISTS role_menus (
    id SERIAL PRIMARY KEY,
    guild_id VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL, -- Internal name
    title VARCHAR(256) NOT NULL,
    description TEXT,
    type VARCHAR(20) DEFAULT 'BUTTON', -- 'BUTTON' or 'SELECT'
    mode VARCHAR(20) DEFAULT 'TOGGLE', -- 'TOGGLE' or 'SINGLE'
    message_id VARCHAR(255),
    channel_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS role_menu_options (
    id SERIAL PRIMARY KEY,
    menu_id INTEGER REFERENCES role_menus(id) ON DELETE CASCADE,
    role_id VARCHAR(255) NOT NULL,
    label VARCHAR(80),
    emoji VARCHAR(255),
    style VARCHAR(20), -- For Buttons
    description VARCHAR(100) -- For Select Menus
);

COMMENT ON TABLE role_menus IS 'Stores configurations for interactive self-role menus.';
COMMENT ON TABLE role_menu_options IS 'Stores the individual role options within a menu.';
