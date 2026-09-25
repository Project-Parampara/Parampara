CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password TEXT,
  email TEXT UNIQUE,
  picture TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cultural_sites (
  id SERIAL PRIMARY KEY,
  district TEXT NOT NULL,
  site_name TEXT NOT NULL,
  state TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (district, site_name, state)
);

DELETE FROM cultural_sites a
USING cultural_sites b
WHERE a.id > b.id
  AND LOWER(a.district) = LOWER(b.district)
  AND LOWER(a.site_name) = LOWER(b.site_name)
  AND LOWER(a.state) = LOWER(b.state);

CREATE UNIQUE INDEX IF NOT EXISTS cultural_sites_unique_location_idx
  ON cultural_sites (LOWER(district), LOWER(site_name), LOWER(state));

CREATE TABLE IF NOT EXISTS quiz_questions (
  id SERIAL PRIMARY KEY,
  state TEXT NOT NULL,
  question TEXT NOT NULL,
  options JSONB NOT NULL,
  answer TEXT NOT NULL,
  explanation TEXT NOT NULL DEFAULT '',
  UNIQUE (state, question)
);

CREATE INDEX IF NOT EXISTS cultural_sites_state_district_idx
  ON cultural_sites (LOWER(state), LOWER(district));

CREATE INDEX IF NOT EXISTS quiz_questions_state_idx
  ON quiz_questions (LOWER(state));
