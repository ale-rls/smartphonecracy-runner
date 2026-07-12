# Persistence boot configuration

Production persistence is enabled only when `DATABASE_URL` is set. Also set
`INSTALLATION_CLOSES_AT` to the installation's fixed public closing timestamp
(ISO 8601 with an offset). The server derives the participant-data deletion
deadline as exactly 90 days after that timestamp; changing it requires the
approved retention policy to be updated first.

At boot, the server applies `infra/migrations/001_persistence.sql`, registers
the repository scenario, marks any sessions left active by a prior crash as
ended with a recovery event, and only then starts listening. Persistence queue
degradation and recovery are logged and written to `health_events`. Shutdown
flushes are bounded by `PERSISTENCE_FLUSH_TIMEOUT_MS` (default: 5000 ms).

Without `DATABASE_URL`, development and test startup remains database-free.
