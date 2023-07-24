CREATE TABLE user (
    user_id uuid PRIMARY KEY,
    name text,
    picture_url text,
    is_organization boolean DEFAULT false,
    email text,
    password_hash text,
    role text,
    created timestamp,
    last_updated timestamp,
    organization_id uuid,
    CONSTRAINT "FK_user.organization_id"
        FOREIGN KEY("organization_id")
        REFERENCES "user" ("id")
);

