DROP VIEW IF EXISTS report_view;
DROP TABLE IF EXISTS jobs, priority_settings, sensitive_sites, assignments, report_audit, status_events,
    report_photos CASCADE;
ALTER TABLE IF EXISTS clusters DROP CONSTRAINT IF EXISTS clusters_primary_report_fk;
DROP TABLE IF EXISTS reports, clusters, otp_codes, refresh_tokens, users, zones, utilities CASCADE;
