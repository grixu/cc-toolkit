CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  amount_minor BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
