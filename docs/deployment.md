# Production deployment and rollback

Production deploys are manual and must happen while the venue is closed and no
visitors are present. The GitHub `production` environment must have required
reviewers configured, and `FLY_API_TOKEN` must be stored as an environment
secret. Provisioning the Fly application and its runtime secrets belongs to
STEP-024.

To deploy, run the **Deploy production** workflow, enter the existing Fly app
name, and confirm the deploy-window check. Approval of the protected
`production` environment is a separate required gate. The workflow builds the
commit SHA into the OCI image label and `BUILD_VERSION`, then Fly retains the
release history needed for rollback.

## Rollback

1. Stop new sessions and confirm the venue remains closed.
2. Inspect releases with `fly releases --app <app>` and identify the last known
   good version.
3. Run `fly releases rollback <version> --app <app>`.
4. Wait for both `/healthz` and `/readyz` to return HTTP 200, then verify the
   display, phone, and admin routes load and `/api/status` reports the expected
   `buildVersion`.
5. Reopen only after the display reconnects and is back at the attract screen.

Rollback briefly interrupts the single WebSocket server and aborts an active
session, which is why the same closed-venue deploy window is mandatory.
