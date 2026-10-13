CREATE TABLE saas.usage_projection (
  source_id text NOT NULL CHECK (length(source_id) BETWEEN 1 AND 64), generation text NOT NULL CHECK (length(generation) BETWEEN 1 AND 64),
  scope text NOT NULL CHECK (length(scope) BETWEEN 1 AND 96), metric text NOT NULL CHECK (metric IN ('db.physical_bytes','db.logical_bytes','service.rss_bytes','service.cpu_usec','request.admitted','request.rejected','admission.conflicts','admission.duration')),
  unit text NOT NULL CHECK (unit IN ('bytes','microseconds','count','milliseconds')), value double precision CHECK (value >= 0 AND value < 'Infinity'::double precision),
  source text NOT NULL CHECK (source IN ('postgres.size','process.self','admission')), quality text NOT NULL CHECK (quality IN ('DIRECT','ESTIMATED','UNAVAILABLE')),
  as_of timestamptz NOT NULL, bucket timestamptz NOT NULL, granularity text NOT NULL CHECK (granularity IN ('minute','hour')),
  coverage double precision NOT NULL CHECK (coverage BETWEEN 0 AND 1), discontinuity boolean NOT NULL,
  sequence bigint NOT NULL CHECK (sequence > 0),
  PRIMARY KEY (source_id,generation,scope,metric,granularity,bucket),
  CHECK ((quality='UNAVAILABLE' AND value IS NULL AND coverage=0) OR (quality<>'UNAVAILABLE' AND value IS NOT NULL))
);
CREATE INDEX usage_retention ON saas.usage_projection(granularity,bucket);
REVOKE ALL ON saas.usage_projection FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON saas.usage_projection TO saas_measure;
GRANT SELECT ON saas.usage_projection TO saas_api;
