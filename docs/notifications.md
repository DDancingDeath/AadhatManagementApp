# Notifications (#12)

In-app only. The app runs on the free Firebase Spark plan with no Cloud
Functions, so nothing can wake a **closed** app (no FCM / web push). What works:

| Where | How |
|---|---|
| App open (phone or desktop) | 🔔 bell with unread badge, toast for 5 s when a new notification arrives |
| Inbox | tap the bell: newest first, 30 per page, "Show more", "Mark all read", tap a row to go to the item / bill list |
| Desktop browser, app open in another tab/window | optional system notification — Settings → Notifications (web only, not in the Android app) |
| App closed | nothing yet — needs Blaze + a Cloud Function (or a paid push service) — owner decision on #12 |

Read state changes only when the inbox is opened (rows shown) or a row is
tapped — never because a toast was shown.

## Data

Collection `notifications` (`dev_notifications` on localhost), one doc per
recipient. Doc id = `<eventId>_<userId>`, so writing the same event again
never creates a second notification for anyone. Fields: `userId`, `type`,
`read`, `timestamp` (server), `eventKey`, plus per-type fields below.

Reads: one live listener on the 20 newest unread (`userId == me`,
`read == false`, `orderBy timestamp desc`) and inbox pages via
`read in [false, true]` — both served by the existing
`userId + read + timestamp` index. Older than 30 days: hidden, and deleted
(at most 100, once a day per device). Code: `js/modules/notifications.js`,
text/rules in `js/utils/notification-format.js`, writes in
`FirebaseService.sendNotification / notifyRateChanges / notifyItemEdit`.

## Catalogue

| type | sent when | recipients | status |
|---|---|---|---|
| `rate_change` | an item rate is changed (edit dialog or inline rate box; old value = value when editing started) | everyone except the person who changed it; wholesale rates: owners and managers only | live |
| `item_edit` (`action: added/updated`) | item added, or its name / Hindi name / contact changed | owners (except the person who changed it) | live |
| `edit` (`documentType`) | a bill / sale / payment was edited | owners | text supported; no sender wired yet |
| `review_flag` | an open review-queue flag | owners/managers | planned |
| `cash_mismatch` | cash session closed with a difference | owners/managers | planned |
| `stale_outbox` | writes not synced for a long time on a device | that user + owners | planned |
| `print_failure` | a bill failed to print | that user | planned |
| `backup_failure` | nightly backup failed | owners | planned |
| `shop_reminder` | shop reminders (#56) | as configured | planned |

New types only need a sender: unknown types are shown with their `message` /
`messageHi` fields. Use a stable `eventId` per flag/event so it notifies at
most once. User-facing text is always English + Hindi.
