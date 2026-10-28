CREATE TABLE channels (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   uuid NOT NULL REFERENCES users (id),
  kind       text NOT NULL CHECK (kind IN ('email', 'sms', 'slack')),
  handle     varchar(32) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
