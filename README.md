# OnlySignal external availability check

This public repository holds **no app code, user data, credentials or paid service configuration**.
It checks two public Production GET routes from GitHub Actions, outside the app:

> **Enabled:** the first external run passed for both routes.
> [Verified run](https://github.com/hardrivdigital-crypto/onlysignal-uptime/actions/runs/40737036380).

- `/api/healthz/live`: HTTP 200, JSON and the expected API liveness marker.
- `/api/__clerk/v1/environment`: HTTP 200 and JSON from the sign-in route.

Scheduled approximately every five minutes. If a probe fails, it repeats after
20 seconds and opens one public issue for a confirmed failure. A later healthy
run closes that issue. The workflow also fails while either route remains down.
Watch this repository's Issues and enable GitHub Actions failure notifications
for alerts; GitHub notification delivery depends on account preferences.

GitHub may delay or drop scheduled runs, and public scheduled workflows can be
disabled after 60 days without repository activity. Check the Actions page
periodically; this is supplementary monitoring, not a guaranteed watchdog.
This detects a process/sign-in-route
problem, not all app failures. It does not diagnose the cause, restart, republish,
send notifications to end users, or guarantee a recovery time. Incidents and
check history are public. Standard GitHub-hosted runners in a **public** repo
are free under GitHub's published billing policy. Do not move this workflow
to the private OnlySignal repo without reviewing its billing.

Run `node check.mjs --self-test` for inert checks without network traffic or
GitHub issue changes.
