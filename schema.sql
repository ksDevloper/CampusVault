-- Cloudflare D1 Schema for CampusVault
-- Run this in the Cloudflare Dashboard -> Storage & Databases -> D1 -> campusvault-db -> Console

CREATE TABLE IF NOT EXISTS materials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    type TEXT NOT NULL,
    author TEXT NOT NULL,
    college TEXT NOT NULL,
    subject TEXT NOT NULL,
    description TEXT,
    date TEXT NOT NULL,
    fileName TEXT NOT NULL,
    rating_sum INTEGER DEFAULT 0,
    rating_count INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_materials_college ON materials(college);
CREATE INDEX IF NOT EXISTS idx_materials_subject ON materials(subject);
CREATE INDEX IF NOT EXISTS idx_materials_type ON materials(type);
