# Using Slack Compass

[Back to the README](../README.md)

This page covers search syntax, shortcuts, and how to triage mentions and DMs.

## Basics and keys

Open **Search Slack** in Raycast.

In the list, Return opens the selected item in Slack. ⌘Return shows or hides details. This works the same for messages, conversations, and people. ⌘N opens the Write form for a conversation or a person, and for regular members in the membership lists. Inside a form, ⌘Return still submits the post.

- As you type a name, conversations (channels, private channels, and group DMs) and people appear. Favorites and conversations with unread messages come first. A red tag at the right of a row shows the unread count. A `+` in `3+` means there are more than that.
- Names and the suggestions for `in:`, `from:`, and `to:` support fuzzy matching. `prj` finds `project_alpha`, and so do `project_alpa` and `project_alhpa`. Fuzzy matching also applies to aliases and dictionary terms. Exact, prefix, and substring matches stay on top. Typo and skip matches for letters and digits come after them.
- A skip match needs at least 3 characters, in order, with a matched span no longer than twice the input length. Typo correction applies only to words of 4 or more letters and digits. It allows one inserted, deleted, or replaced character, or one swap of adjacent characters, in the whole word or in each word of a name. It does not correct Japanese typos or handle reading conversions. When you separate several words with spaces, only candidates that match every word appear.
- A fuzzy suggestion for a filter becomes a real term only after you select it and run Use This Candidate. Slack Compass never confirms a misspelled recipient on its own. Searching message text still uses Slack's own search.
- When you type a term or `in:`, `from:`, or `to:`, message results appear below the conversations, newest first. One request returns up to 100 results. Narrow older results with terms or dates.
- With nothing typed, **Mentions & DMs (Past 7 Days)** appears at the top. It covers mentions of you and DMs and group DMs addressed to you. Your own posts are excluded. It lists unread items. To avoid missing anything, it also lists thread replies and items whose read state is unknown. It does not include `@here`, `@channel`, or user-group mentions.

You can use these forms in the search bar:

| Form                                                          | Meaning                                                            |
| ------------------------------------------------------------- | ------------------------------------------------------------------ |
| `in:#channel-name`                                            | Messages in that channel. `in:@name` means the DM with that person |
| `from:@handle`                                                | Messages from that person                                          |
| `to:@handle`                                                  | Messages addressed to that person                                  |
| `from:me`, `to:me`                                            | Your messages, messages addressed to you                           |
| `-from:@handle`                                               | A leading `-` excludes the match                                   |
| `after:`, `before:`, `on:`, `during:`, `has:`, `is:`, `with:` | Passed to Slack search as written                                  |

While you type `in:` and similar terms, suggestions appear at the top. Select one and choose Use This Candidate to confirm it.

Click Actions at the bottom of the window to see the actions for the selected row. To open Actions with a key, use the shortcut set in Raycast.

### Read the thread leading up to a message

1. Select a search result or an item under Mentions & DMs and press ⌘Return. The detail shows the channel name, then the sender, time, and text.
2. The selected message stays at the top. Earlier messages from the same thread follow, newest first. Replies after the selected message and messages outside the thread are not included.
3. If the detail says more messages remain, choose Load More Earlier Messages in Actions. Each load fetches 15 messages, up to 150 messages over 10 pages. Slack returns the oldest messages first, so while the fetch is incomplete the messages just before the selected one may be missing.
4. To fetch again, choose Refresh Details. Slack Compass keeps fetched data for the same detail in memory for 2 minutes. Refresh Details fetches it again.

Reading earlier messages needs `channels:history`, `groups:history`, `im:history`, or `mpim:history`, depending on the conversation type. See [Required API scopes](reference.md#required-api-scopes). Without these scopes, the text of search results still appears. On a rate limit, wait until the time shown, then choose Refresh Details.

Reading a detail does not mark the message as handled. The same actions work in a search within one channel.

### Search by scope, sender, and recipient

In Actions, choose Choose Search Filters…. You can pick All, Favorite Channels, a section, a channel, or a DM with one person. You can also pick a sender (including Me) and a recipient (Mentions and DMs to Me, or one person, which finds direct messages sent to that person). Choose Show Messages to search even with no search term. The filters you set appear in the empty search bar, for example `Search Slack · All / From: Alice / To: Me`, and next to the Messages heading once results appear.

To remove one filter while keeping your search term, choose Remove Scope Filter, Remove Sender Filter, or Remove Recipient Filter in Actions. They appear only while that filter is set. Typing `in:`, `from:`, and `to:` in the search bar still works. For sections, DMs, recipients, and how typed terms combine with selected filters, see [Choosing a search scope](search-scopes.md).

### Find channels from the people in them

- **Find channels a person is in:** Search for the person in Search Slack, choose View Channels with This Person, filter by channel name or alias, and open the channel in Slack. The list covers public channels and private channels you have joined. Archived channels are excluded. This is different from `from:`, which searches post history.
- **Find channels several people share:** In Joined Channels, choose Add Person, then select a person. The list shows only channels that all selected people have joined. You can select up to 5 people, and you can select yourself. Remove Person removes one person. Reset People goes back to the first person.
- **Find who is in a channel:** On a channel row, choose View Members, filter by name or handle, then open Slack, write a message, or view the channels that person is in. Bots appear as "Bot". IDs whose names cannot be loaded appear as "Status Unknown". Neither type shows DM or joined-channel actions.
- **Start from a message:** On a message, choose View Channels with Sender or View Channel Members. These actions do not appear when the sender is unknown or for DMs and group DMs.
- **Write or search in the channel you found:** In Joined Channels, choose Write to open the post form. Choose Search in This Conversation to open a message search for that conversation. You can also open the reply form. When you go back, your search term and selected row in Search Slack are still there.
- **Fetch membership again:** Choose Refresh. The screen shows the fetch time, and Slack Compass reuses a complete result for up to 2 minutes. Refresh never uses the cache. When a result from earlier stays on screen during a refresh or after a failure, the screen shows "Previous results". A failure is never treated as zero members. On a rate limit, wait the number of seconds shown and try again.

Typing in a list filters the data already loaded and supports fuzzy matching. Even an empty list lets you change the filter or choose Refresh from Actions. If you change the authentication settings, reopen Search Slack.

### Conversation and person actions

| Action                                              | What it does                                                                          |
| --------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Open in Slack                                       | Opens the item in Slack                                                               |
| Show Details / Hide Details                         | Shows or hides the type, handle, aliases, and other loaded data. Fetches nothing more |
| Write                                               | Opens the post form. On a person, it sends a DM                                       |
| Filter by This Conversation / Filter by This Person | Filters by the conversation or person                                                 |
| Add to Favorites / Remove from Favorites            | Adds or removes a favorite                                                            |
| Edit Aliases                                        | Sets aliases                                                                          |
| Edit Dictionary                                     | Edits the name replacement dictionary                                                 |
| Copy ID                                             | Copies the ID                                                                         |
| Reset Ranking                                       | Resets the usage-based ordering of that row                                           |

### Message actions

| Action                                         | What it does                                                                 |
| ---------------------------------------------- | ---------------------------------------------------------------------------- |
| Show Details / Hide Details                    | Shows or hides the full text in the sidebar. Reading does not mark it opened |
| Open in Slack                                  | Opens the message in Slack                                                   |
| Reply in Thread                                | Replies in the thread                                                        |
| Add Reaction…                                  | Opens a searchable emoji list. Choose an emoji to add it as your reaction    |
| Remove My Reaction…                            | Lists only your own reactions on the message. Choose one to remove it        |
| Mark as Handled / Unmark as Handled            | Adds or removes the "handled" mark                                           |
| Filter by This Conversation / Filter by Sender | Filters by the conversation or sender                                        |
| Open Permalink in Browser                      | Opens the message link in your browser                                       |
| Copy Permalink                                 | Copies the message link                                                      |

Rows marked as opened or handled leave your Mentions & DMs list the next time you open Search Slack. Marks expire after 14 days. A row also gets the "opened" mark after your reply is sent.

In saved Mentions & DMs results, long text is a preview of the first 300 characters. Reload Search (⌘R) fetches the full text. Regular message search shows the full text.

### Add or remove a reaction

Add Reaction… and Remove My Reaction… appear on every message row: search results, Mentions & DMs, and messages in a channel. They need the optional `reactions:write` scope, and Remove My Reaction… also needs `reactions:read`. See [Required API scopes](reference.md#required-api-scopes).

1. Select a message and choose Add Reaction… (⌘⇧E). Type part of an emoji name or a keyword such as `thanks`, then choose Add Reaction. The list has standard emoji only. Workspace custom emoji are not listed.
2. To take back your own reaction, choose Remove My Reaction…. Slack Compass asks Slack which reactions you added to that message and lists only those. You cannot remove other people's reactions.
3. On success, a toast confirms the change and the picker closes, so you are back on the message list.

Slack Compass tells these cases apart:

- **Missing permission** (`missing_scope`, `not_allowed_token_type`): add `reactions:read` and `reactions:write` to User Token Scopes, reinstall the app, and update the token in Raycast if it changed.
- **Token not accepted** (`invalid_auth`, `not_authed`, `token_revoked`, `token_expired`, `account_inactive`): check Slack Access Token in the extension preferences.
- **Already added or already removed** (`already_reacted`, `no_reaction`): you already have the state you asked for, so Slack Compass reports success and says nothing changed.
- **Message deleted or not visible** (`message_not_found`, `channel_not_found`, `not_in_channel`): nothing was changed.
- **Reactions not allowed on this message** (`not_reactable`, `thread_locked`, `is_archived`, `no_permission`, and similar): nothing was changed.
- **Emoji not recognized** (`invalid_name`): Slack does not know the emoji name. Nothing was changed.
- **Reaction limit reached** (`too_many_emoji`, `too_many_reactions`): the message already has the maximum number of reactions. Nothing was changed.
- **Rate limited**: Slack Compass shows when you can retry. Nothing was changed.
- **Other errors returned by Slack**: Slack Compass shows the error code. Nothing was changed.
- **Delivery not confirmed** (timeout, connection error, HTTP error, unreadable response, or a temporary Slack error such as `internal_error` or `service_unavailable`): Slack Compass does not send the request again. The toast says the reaction may or may not have been added or removed. Choose Open in Slack and check the message before you try again. The picker then offers only Open in Slack.

When Slack Compass lists your reactions for Remove My Reaction…, it also tells you when the list may be incomplete, or when some of your reactions have names it cannot remove. Remove those in Slack.

Adding or removing a reaction does not mark the message as opened or handled, and does not remove a mark.

### Reload, swap, and post

- **Swap Conversations and Messages:** swaps the order of conversations and messages.
- **Reload Search:** fetches search results, Mentions & DMs, read positions, and unread counts for favorites again.
- **Reload Conversations and People:** fetches the lists manually. Background refresh runs every 30 minutes by default. You can choose 30 Minutes, 1 Hour, 3 Hours, or Off in the settings. Conversations and membership refresh at the chosen frequency. People refresh after a day. If a fetch is interrupted or rate limited, Slack Compass keeps the saved list and resumes where it stopped.
- **Membership filter:** the dropdown at the right of the search bar offers All, Joined, and Not Joined.
- **Post and Open in Slack:** posts from the form and opens the post in Slack.
- **Preview:** shows the message before you post it.

### Shortcuts defined by Slack Compass

These keys are defined by the extension, and you can pick the same actions from Actions. For the standard keys that Raycast assigns, check what the screen shows.

| Key       | Action                                           |
| --------- | ------------------------------------------------ |
| Return    | Open the selected item in Slack                  |
| ⌘Return   | Show or hide details in the list                 |
| ⌘N        | Open the Write form for a conversation or person |
| Tab / ⌘F  | Filter by conversation or person                 |
| Shift+Tab | Swap Conversations and Messages                  |
| ⌘⇧R       | Reload Conversations and People                  |
| ⌘⇧D       | Mark or unmark as handled                        |
| ⌘⇧Return  | Reply in Thread                                  |
| ⌘⇧E       | Add Reaction…                                    |
| ⌘D        | Edit Dictionary                                  |
| ⌘⇧P       | Preview the post                                 |
| Control+X | Delete a dictionary rule                         |

Write messages in Markdown. Choose mentions in the separate Mention field, not in the message text. Posts appear in Slack as you, not as a bot.

## Not supported

Drafts, history before or after a message outside its thread, bookmarks, and Lists are not available. Reactions cover standard emoji only. Full-text results, posting, thread replies, reactions, and handling messages addressed to you work. To follow these features, see [GitHub Issues](https://github.com/shinonomelon/raycast-slack-compass/issues).
