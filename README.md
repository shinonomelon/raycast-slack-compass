# Slack Compass

Slack Compass finds Slack channels, people, and group DMs from Raycast. It also searches messages, posts messages, replies in threads, and adds or removes your reactions. It connects directly to the official Slack Web API and does not need slack-cli.

Search supports fuzzy name matching, favorites, sections, filtering by sender and recipient, aliases, a triage list for mentions and DMs, and lookups of which channels a person has joined or who is in a channel.

## Requirements

- A Slack workspace where you can create or install a Slack app
- A Slack User OAuth Token (`xoxp-`) with the scopes listed below
- The Slack desktop app, which Slack Compass uses to open conversations
- macOS and Raycast

## Setup

### 1. Install Slack Compass

Open the Raycast Store, search for **Slack Compass**, and install it. To run it from source instead, see [Run from source](docs/reference.md#run-from-source).

### 2. Get a Slack user token

1. Create an app in the [Slack app dashboard](https://api.slack.com/apps) and choose your workspace.
2. Under **OAuth & Permissions → User Token Scopes**, add these eight scopes:

   ```text
   channels:read
   groups:read
   im:read
   mpim:read
   users:read
   search:read
   chat:write
   im:write
   ```

   To add or remove reactions, also add these two optional scopes. If you do not use reactions, you do not need them:

   ```text
   reactions:read
   reactions:write
   ```

3. Click **Install to Workspace**, then copy the **User OAuth Token** (`xoxp-`). Workspaces that require app approval need an admin to approve the app first. Bot tokens (`xoxb-`) do not work.

The token lets Slack Compass read and write Slack as you. Do not paste it into GitHub or chat. After you copy it into Raycast, clear it from your clipboard history.

### 3. Add the token to Raycast

Open **Search Slack**. Raycast asks for the **Slack Access Token** the first time; paste the token there. You can change it later in Raycast Settings → **Extensions → Slack Compass**. The first launch takes a moment while it loads conversations and people.

If you changed your Slack handle in the past, enter your old handles in **Previous Handles**, separated by commas.

## Common tasks

Return opens the selected item in Slack. ⌘Return shows or hides details. ⌘N opens the post form for a conversation or person. You can also pick any of these from Actions.

| Task                                      | What to do                                                                                                                                                                       |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Open a channel or person                  | Type a name, select the row, press Return                                                                                                                                        |
| Read a message                            | Type a search term or `in:#channel-name`, select a result, press ⌘Return                                                                                                         |
| Post a message or send a DM               | Select a conversation or person, choose Write, write the message, choose Post and Open in Slack                                                                                  |
| Reply in a thread                         | Select a message, choose Reply in Thread, write the reply, choose Post and Open in Slack                                                                                         |
| Add a reaction                            | Select a message, choose Add Reaction…, pick an emoji (⌘⇧E opens the picker)                                                                                                     |
| Remove your reaction                      | Select a message, choose Remove My Reaction…, pick one of your reactions                                                                                                         |
| Triage messages addressed to you          | Clear the search bar, select an item under Mentions & DMs, choose Mark as Handled                                                                                                |
| Search your posts or messages sent to you | Open Actions → Choose Search Filters…, set Sender to Me or Recipient to Mentions and DMs to Me, choose Show Messages. Remove Sender Filter or Remove Recipient Filter clears one |
| Find channels a person is in              | Select a person, choose View Channels with This Person. Choose Add Person to narrow the list to channels all selected people share                                               |
| See who is in a channel                   | Select a channel, choose View Members                                                                                                                                            |

[Using Slack Compass](docs/usage.md) lists every action and shortcut. [Choosing a search scope](docs/search-scopes.md) explains how to filter by favorites, sections, channels, DMs, sender, and recipient.

Message details show the thread leading up to the selected message. Reading earlier messages needs optional history scopes. See [Using Slack Compass](docs/usage.md).

## Settings

Open the settings from Raycast Settings → Extensions → Slack Compass.

| Setting                      | Description                                                                                                                                                                                                                                           |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Slack Access Token           | Required. Your Slack User OAuth Token (`xoxp-`).                                                                                                                                                                                                      |
| Previous Handles             | Optional. Previous Slack handles, separated by commas.                                                                                                                                                                                                |
| Background Refresh Frequency | How often the Refresh Slack Directory command refreshes channels: 30 Minutes (default), 1 Hour, 3 Hours, or Off. People refresh every 24 hours. See [Choose a background refresh frequency](docs/reference.md#choose-a-background-refresh-frequency). |
| Slack API Distribution       | Unknown (60 Seconds) by default. Choose Verified Internal or Marketplace (1.3 Seconds) only if your Slack app is internal to your workspace or approved for the Slack Marketplace. See [Rate limits](docs/reference.md#rate-limits).                  |

Slack Compass stores its cache and settings in `~/Library/Application Support/com.raycast.macos/extensions/slack-compass/`. See [Settings, stored data, and troubleshooting](docs/reference.md).

## Troubleshooting

- If Slack Compass shows "Delivery has not been confirmed", the message may have been sent. Choose Open Conversation (or Open Parent Message for a reply) and check Slack before you send it again. Sending again can post the same message twice.
- For `missing_scope`, add the scope that Slack Compass names to User Token Scopes, reinstall the app, and update the token in Raycast if it changed.
- Raycast updates Store extensions automatically. If you run Slack Compass from source, see [Run from source](docs/reference.md#run-from-source) to update it.

See [Settings, stored data, and troubleshooting](docs/reference.md#troubleshooting) for more. If a problem remains, open a [GitHub issue](https://github.com/shinonomelon/raycast-slack-hub/issues) with the steps you took and the error shown. Do not include tokens or real message text.

## Development

Use Node.js 22.22.2 or later.

To get the source, see [Run from source](docs/reference.md#run-from-source).

```bash
npm ci
npm run dev    # watch and load the extension into Raycast
npm test       # run all src/**/*.test.ts files
npm run lint   # needs network access to fetch the Raycast schema
```

Also run `npx tsc --noEmit` and `npm run build` before you submit a change. Most tests use sample Slack responses and make no network calls. Passing tests do not replace checking against the real Slack API and Raycast.

Slack Compass records request counts locally to help diagnose rate limits. It stores only the API method, the calling action, and counts for requests, 429 responses, wait time, merged reads, and cache hits. It never stores message text, search queries, conversation IDs, user IDs, or credentials. The data is saved per day, for up to 7 days and 256 rows, in `request-metrics.json` in the extension's support folder. To investigate a rate limit, find the action in `source` and the API in `method`, then compare `requests`, `rateLimited`, `waitMs`, `coalesced`, and `cacheHits` before and after the action.

Do not put tokens or real Slack messages in tests, logs, or issues.

## Known limitations

Slack Compass does not support drafts, history around a message outside its thread, channel bookmarks, or Slack Lists. Reactions cover standard emoji only: you cannot pick a workspace custom emoji or remove someone else's reaction. Track these features in [GitHub Issues](https://github.com/shinonomelon/raycast-slack-hub/issues).
