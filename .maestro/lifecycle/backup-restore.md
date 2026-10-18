# Backup and restore verification (manual)

This flow is deliberately manual. Android's system document picker and save
provider vary by OS and installed file apps, and restoring replaces the whole
TinyWins database. An unverified Maestro tap sequence could overwrite unrelated
data. Do not use `clearState` with the Expo development client.

Use a dedicated test device or first save a **baseline backup** of its current
data outside app-private storage and verify that the file exists. Keep both
passwords available until this check is complete.

1. From Profile → Backup & Restore, create an encrypted baseline backup. Choose
   **Save to Device**, then confirm the file is present in Downloads or another
   location that survives app restarts.
2. Create two uniquely named test activities with the default levels. Record
   today's middle level on each and confirm both selected labels on Home.
3. Export a second encrypted backup to a different external filename. Confirm
   the file exists and is nonempty.
4. Delete **only** the two test activities through their own menus. Confirm
   both are absent from Home and Archived; restart and confirm again.
5. Profile → Backup & Restore → Restore Backup. Select the second file in the
   native picker, enter its password, review the preview counts, then confirm
   Restore. Verify both test activities and their exact saved levels return,
   without duplicates. Restart and verify again.
6. To leave the device as it was, restore the baseline backup. Check an
   unrelated original activity and recording before discarding either file.

The SQLite backup round-trip and rollback paths are also covered by
`tests/backup.test.ts`. This manual check validates the native file-provider UI
and on-device persistence that the unit tests cannot cover.
