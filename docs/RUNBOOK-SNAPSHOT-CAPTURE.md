# Automated snapshot capture runbook

## Required Supabase dashboard configuration

Do these steps before applying the migration. Do not put the secret in a
`.env`, a Cloudflare variable, or any browser setting.

1. In Supabase Dashboard, open the project, then **Project Settings → Edge
   Functions → Secrets**.
2. Create `SNAPSHOT_CAPTURE_SCHEDULER_SECRET` with a newly generated random
   value of at least 32 bytes (for example, a password-manager generated 48+
   character value). Save it. This is the value the Edge Function checks.
3. Still in the dashboard, open **SQL Editor → New query**. Replace both
   placeholders locally in the query editor only, then run it:

   ```sql
   select vault.create_secret(
     'https://YOUR_PROJECT_REF.supabase.co/functions/v1/snapshot-capture',
     'snapshot_capture_url'
   );
   select vault.create_secret(
     'YOUR_SAME_SCHEDULER_SECRET',
     'snapshot_capture_scheduler_secret'
   );
   ```

   The second value must exactly match the Edge Function secret from step 2.
   The Vault values are intentionally not repository configuration; Cron reads
   them only at execution time.
4. Deploy the private function, then apply the database migration:

   ```text
   supabase functions deploy snapshot-capture --no-verify-jwt
   supabase db push
   ```

   This order matters because the migration enables Cron, which must never be
   able to invoke an endpoint before the private function exists.

5. In **Database → Cron Jobs**, confirm `snapshot-capture-weekdays` is enabled
   and runs as `*/15 * * * 1-5`. It invokes only after the function verifies a
   real completed XNYS session; early closes and DST come from the committed
   calendar.
6. After a completed market session, inspect **Edge Functions →
   snapshot-capture → Logs** and **Database → Cron Jobs → job history**. A
   success response is generic by design. On a provider/outage miss, open
   Portfolio Time Machine: the recorded date is marked as a backfill-required
   gap. Use the existing Add Historical Snapshot flow; do not use current
   holdings to fill it.

## Rotation

Generate a new random value, update the Edge Function secret, then update the
Vault `snapshot_capture_scheduler_secret` to the same value. Do this during a
quiet window so no Cron invocation sees mismatched values. Never disclose a
secret in logs, screenshots, tickets, or commits.
