# TinyWins — Synchronize Home Selection with Insights

Fix Insights visibility to respect the graph-selection controls on Home.

1. Only items selected using the graph icon on Home should appear in regular Insights, including the horizontal activity selector and all combined charts.

2. When an item is deselected:
   - Immediately remove it from the Insights activity selector.
   - Remove it from all combined graphs.
   - Preserve its recordings, historical data and settings.

3. When reselected, restore its individual Insights with its complete historical data.

4. If the user is currently viewing an item that becomes deselected, automatically switch to All Insights.

5. If no items are selected, display a friendly empty state explaining that items can be added to Insights from Home.

6. Maintain the existing maximum of five selected items. Persist selections across restarts.

7. Use one shared, persisted selection source for Home, the Insights selector and all combined charts. Ensure changes appear immediately without restarting or manually refreshing.

8. Preserve the existing archived-task-only Insights navigation. Archived items must not appear in regular Insights.

Test selection, deselection, navigation, persistence and all combined charts.

Do not modify graph calculations, chart designs, daily recordings or unrelated functionality.
