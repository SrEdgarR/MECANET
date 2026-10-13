-- Owner and application reader grants are assigned by the private preparer.
CREATE SCHEMA catalog;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA catalog FROM PUBLIC;
CREATE TABLE catalog.products (
  id uuid PRIMARY KEY,
  sku text UNIQUE NOT NULL CHECK (length(sku) BETWEEN 1 AND 64),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200)
);
