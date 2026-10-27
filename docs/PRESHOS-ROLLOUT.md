# PRESH Social candidate rollout (approval required)

This branch is based on Postiz v2.25.1. It does not deploy itself. Its PRESHos
counterpart must be reviewed and promoted through develop → staging → main first.
The Postiz schema and DISABLE_REGISTRATION are unchanged. Existing personal
workspaces, including the stray test workspace, are not deleted or modified.

## Prepare after Chris approves

1. Promote the PRESHos membership endpoint and its one-row service throttle
   migration through the normal pipeline. The route is
   `POST /api/v1/social/postiz-membership`; POST deliberately keeps identity out
   of access-log query strings. Keep the existing tenant Postiz integrations
   active and configured. `/me` under each tenant's existing Vault key determines
   its workspace; no shared default workspace is used.
2. Create a new random secret of at least 32 characters in the approved secret
   manager. Set `PRESHOS_MEMBERSHIP_SECRET` to that value in PRESHos and in the
   Railway Postiz service. Do not put it in Git, PR text, command output, or a
   `NEXT_PUBLIC_*` variable.
3. In Railway project `068caf9b-0e7f-4f55-9b38-89b784ad366f`, production service
   `postiz`, add `PRESHOS_MEMBERSHIP_URL=https://<approved-PRESHos-host>/api/v1/social/postiz-membership`.
   Keep the existing WorkOS OAuth URL/client variables, `FRONTEND_URL`,
   `DISABLE_REGISTRATION=true`, and `IS_GENERAL=true`. No WorkOS app edits needed.
4. Obtain `railway-image.txt` from the successful **PRESHos candidate image**
   Actions run for the reviewed commit. It contains
   `ghcr.io/presh-marketing/postiz-app@sha256:<digest>`. Confirm Railway has pull
   access to the GHCR package (the package may initially be private). Switch the
   image only to this digest, never `latest` or a mutable tag. Record the previous
   Railway digest for rollback.
5. Set `POSTIZ_GENERIC_OAUTH=true` only when both services and the shared secret
   are ready. `NEXT_PUBLIC_POSTIZ_OAUTH_DISPLAY_NAME=PRESHos` can stay as configured;
   the icon defaults to the vendored PRESHos asset. Approve Railway's deployment.

## Acceptance

Use two separate fresh browser profiles for two users with one active PRESHos
membership in the same tenant. Select **Sign in with PRESHos**. Both must land in
one existing workspace (for PRESH, the PRESHai workspace with its LinkedIn
channel), without a company-name form or a new empty workspace. Test an existing
Postiz user and a first-time user; verified email matching retains the existing
account's credentials. Confirm owner/admin → ADMIN and every other role → USER.
Then test a user without an active membership, a tenant without an active Social
connection, and a user with multiple active memberships: all must be refused.
A multiple-tenant user needs a future tenant-choice contract; WorkOS userinfo
currently has no tenant and this implementation never guesses. Membership and
role refresh occur on sign-in, not continuously during existing Postiz sessions.

Verify the login, navigation icon, PRESHos titles, cyan controls, Inter font and
favicon. Review PRESHos audit outcome codes and 429 handling. The service counter
is shared across instances and allows 120 authenticated lookups per minute; it
fails closed if its database is unavailable.

## Rollback

Turn the generic OAuth button off and restore the previously recorded Railway
image digest. Keep DISABLE_REGISTRATION=true. Existing users, channels, keys and
workspaces remain intact. The additive PRESHos endpoint can remain secret-gated;
remove its secret through the normal approved environment process if needed.

## Maintaining the patch and brand

Rebase the small auth hooks and tests onto a reviewed upstream release. To sync
branding after a PRESHos design change, run
`node scripts/sync-preshos-brand.mjs /path/to/preshos-checkout` and commit the
result in the same delivery. `public/preshos/source.json` records the exact
PRESHos source commit and hashes. The script copies the canonical app icon and
favicon and maps PRESHos CSS tokens; it refuses an unexpected font contract.
Brand assets are bundled and never fetched at runtime from another tenant.
