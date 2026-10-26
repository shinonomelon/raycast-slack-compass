# Settings, stored data, and troubleshooting

[Back to the README](../README.md)

## Required API scopes

A scope is a permission you give your Slack app. Each API that Slack Compass calls needs these User Token Scopes.

| Feature                                        | Official API            | User Token Scope                                                                                  |
| ---------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------- |
| Check you and the workspace                    | `auth.test`             | No extra scope                                                                                    |
| List public and private channels and group DMs | `conversations.list`    | `channels:read`, `groups:read`, `mpim:read`                                                       |
| Joined public channels                         | `users.conversations`   | `channels:read`                                                                                   |
| A person's joined channels, channels in common | `users.conversations`   | `channels:read`, `groups:read`                                                                    |
| Channel members                                | `conversations.members` | `channels:read`, `groups:read`                                                                    |
| List people                                    | `users.list`            | `users:read`                                                                                      |
| Message search, Mentions & DMs                 | `search.messages`       | `search:read`                                                                                     |
| Read position                                  | `conversations.info`    | `channels:read`, `groups:read`, `im:read`, `mpim:read` (depends on conversation type)             |
| Post, reply in a thread                        | `chat.postMessage`      | `chat:write`                                                                                      |
| Earlier thread messages in details             | `conversations.replies` | `channels:history`, `groups:history`, `im:history`, `mpim:history` (depends on conversation type) |
| Start a DM with a person                       | `conversations.open`    | `im:write`                                                                                        |
| List your reactions on a message               | `reactions.get`         | `reactions:read` (optional)                                                                       |
| Add your reaction                              | `reactions.add`         | `reactions:write` (optional)                                                                      |
| Remove your reaction                           | `reactions.remove`      | `reactions:write` (optional)                                                                      |

Regular message search does not need the history scopes. Add them only if you want to read earlier thread messages in details. The reaction scopes are also optional: skip them if you do not use Add Reaction… and Remove My Reaction….

After you add a scope, reinstall the app. If the token changes, update it in Raycast settings too. Slack Compass does not fetch email addresses, so `users:read.email` is not needed.

## Stored data

| Location                                     | Contents                                                                                                                                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Raycast password preference                  | The User OAuth Token. It is sent only to Slack and never saved in logs or caches                                                                                                      |
| Raycast Cache (per workspace ID and user ID) | The conversation and people lists, joined public channels, read positions, times rows were opened, handled marks, the last Mentions & DMs result, and an estimate of unread favorites |
| Authentication Cache                         | The `auth.test` result. The key is a hash of the token, so the raw token is not included                                                                                              |
| Shared Cache                                 | The deadline for pausing search, and the record used to order frequently opened items                                                                                                 |
| The extension's `prefs.json`                 | Favorites, aliases, the replacement dictionary, and the joined filter                                                                                                                 |

The cache and saved files are in `~/Library/Application Support/com.raycast.macos/extensions/slack-compass/`. The cache is not encrypted. The last Mentions & DMs result includes up to the first 300 characters of each message. The unread result for favorites does not store message text.

Slack Compass keeps a person's joined channels and a channel's members in memory for 2 minutes. It separates them by authenticated client and by person, and it stores only fully fetched results. Refresh does not reuse them.

It converts message text from Markdown to Block Kit and plain notification text in memory. It uses no temporary files or external processes for posting. It does not delete CLI settings, keys, or temporary files left by earlier versions.

On first launch, favorites, aliases, and the dictionary start empty. Slack Compass does not read settings from other extensions or old caches that cannot be tied to an account. It uses its own settings and the per-account caches.

## Update and uninstall

Raycast updates Store extensions automatically. If you run Slack Compass from source, update it as described in [Run from source](#run-from-source).

To uninstall, remove Slack Compass in Raycast Settings → Extensions. If you ran it from source, you can also delete the source folder. If the extension's saved-data folder remains, deleting it removes your settings, cache, and data from earlier versions. To revoke the token, revoke it for your app in the [Slack app dashboard](https://api.slack.com/apps), or delete the app you no longer need.

## Choose a background refresh frequency

Open Raycast Settings → Extensions → Slack Compass → **Background Refresh Frequency**.

| Setting    | Behavior                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------- |
| 30 Minutes | Default. Refreshes channels and membership every 30 minutes                                             |
| 1 Hour     | Refreshes channels and membership every hour                                                            |
| 3 Hours    | Refreshes channels and membership every 3 hours                                                         |
| Off        | Makes no authentication or fetch calls in the background. Manual refresh and the first fetch still work |

The people list refreshes after 24 hours. This setting does not change the cache lifetimes for Mentions & DMs and message details. A change takes effect at the next background run. The operating system or power saving can delay a run.

A run that does not need to refresh makes no Slack calls. If a list fetch stops partway, Slack Compass saves the completed pages and the continuation position for up to 24 hours. It shows the previous list until the new one is complete. If Slack invalidates the continuation position, Slack Compass starts over.

## Rate limits

Slack Compass spaces out requests for each API. After a 429 response, it pauses that API in both the UI and background refresh until `Retry-After`. Other APIs that are not paused keep working. While it waits, it shows saved results and does not treat candidates it has not fetched as checked. It does not retry posts or reactions automatically.

By default, history and thread fetches are limited to one request per minute each. If you confirm that your Slack app is internal to your workspace or approved for the Slack Marketplace, you can choose **Verified Internal or Marketplace (1.3 Seconds)** under **Slack API Distribution**. Listing in the Raycast Store does not change this status. See [Slack's documentation](https://docs.slack.dev/reference/methods/conversations.replies/).

## Troubleshooting

- **No token or authentication failed:** Enter your User OAuth Token in Slack Access Token and open Search Slack again. For `invalid_auth`, `not_authed`, `token_revoked`, `token_expired`, or `account_inactive`, check the state of the token and the account. If earlier results exist, Slack Compass shows the saved lists. It stops new fetches and posting until authentication succeeds.
- **`missing_scope`:** Add the scope shown to User Token Scopes and reinstall the app. If the token changes, update it in Raycast settings too.
- **Rate limit or search timeout:** After the wait period shown, choose Reload Search in Actions. For a 429 response, Slack Compass uses Retry-After and stops calls to that API method. It does not retry posts or reactions automatically.
- **"Delivery has not been confirmed":** The post may have arrived. Use Open Conversation or Open Parent Message in the toast to open Slack and check. Sending again can post the same message twice.
- **Unknown read position:** A conversation whose Slack response has no `last_read` is treated as unknown. A failed fetch is never shown as zero unread.

If a problem remains, open a [GitHub issue](https://github.com/shinonomelon/raycast-slack-hub/issues) with the steps you took and the error shown on screen. Do not include tokens, real message text, or private conversation names.

## Development

See [Development](../README.md#development) in the README for tests, builds, and request metrics.

### Run from source

You need macOS, Raycast, git, and Node.js 22.22.2 or later.

```bash
git clone https://github.com/shinonomelon/raycast-slack-hub.git ~/raycast-slack-hub
cd ~/raycast-slack-hub
npm ci
npm run dev
```

When the terminal prints `built extension successfully`, the extension is imported. You can stop the command with Control+C. The extension stays in Raycast.

To update a source install, run these commands, then stop `npm run dev` with Control+C when the import finishes. Your Raycast settings stay in place.

```bash
cd ~/raycast-slack-hub
git pull --ff-only
npm ci
npm run dev
```

## Data from earlier versions

The code for Slack drafts, history screens that were waiting for verification, bookmarks, and Lists has been removed. Slack Compass does not delete existing files such as `drafts.json` and does not read them. If you delete the whole saved-data folder, you also lose your favorites and handled marks.
