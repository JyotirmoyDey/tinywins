# Historical recording regression: current automation boundary

An independent `record-edit-history.yaml` cannot currently be written using only
selectors. The app has a historical editor at `src/app/history/[id].tsx`, but
Home, Insights, and task actions expose no UI action that opens it. The route
requires a newly created activity's random SQLite ID, and Maestro's UI commands
cannot extract that ID from the existing `activity-card-<id>` testID. Adding a
visible History action or a test-only database hook would change app behavior,
outside this test-only task.

Once that route is reachable through normal UI, automate this sequence without
`clearState`:

1. Create a uniquely named disposable activity and record today's middle level.
2. Open its History screen and record yesterday's lowest level.
3. Verify today's and yesterday's labels on their respective rows.
4. Edit yesterday to the highest level and verify today's label did not change.
5. Stop and relaunch the app, revisit History, and verify both dates and levels.
6. Delete only the disposable activity.

Until then, this is a manual regression check, not an automated PASS.
