# Automated snapshot capture runbook

## Required Supabase dashboard configuration

Do these steps before applying the migration. Do not put the secret in a
`.env`, a Cloudflare variable, or any browser setting.

The migration enables the required `pg_cron` and `pg_net` extensions itself.
If your Supabase plan or organization policy prevents extension creation,
enable both in **Database → Extensions** before running `supabase db push`.

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

## Scheduler-health alert

Portfolio Time Machine shows an operational alert after two completed XNYS
sessions pass without a confirmed automated capture. The alert is global
system-health information; it does not reveal scheduler credentials, requests,
or financial data.

Possible causes include a rejected scheduler authorization, an authorized
worker failure after authorization, a zero-portfolio worker result, one or
more expected portfolios still lacking that session's snapshot, `pg_cron` not
firing, provider or storage failures, and exhausted committed XNYS calendar
coverage. The worker fails closed outside reviewed calendar coverage, so an
expired calendar eventually produces this alert.

The committed calendar ends on **2027-12-31**. Extend it from NYSE's published
holiday and early-close calendar before that date. Once coverage is exhausted,
the worker fails closed and the health alert fires even if there are no later
calendar rows to count.

Inspect Cron job history and the Edge Function's safe logs, then repair the
underlying cause. The next successful capture that confirms snapshots for every
expected portfolio clears the alert automatically. There is no manual reset.
Saving a snapshot or adding a historical backfill remains available while the
alert is displayed.

## Rotation

Generate a new random value, update the Edge Function secret, then update the
Vault `snapshot_capture_scheduler_secret` to the same value. Do this during a
quiet window so no Cron invocation sees mismatched values. Never disclose a
secret in logs, screenshots, tickets, or commits.
