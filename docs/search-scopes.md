# Choosing a search scope

[Back to usage](usage.md)

You can narrow message search by favorites, sections, channels, a DM, sender, and recipient. Sections are a way to organize channels inside Slack Compass. They do not sync with the sections in the Slack sidebar.

The filters you set appear in the title of the list, for example `Slack Compass · All / From: Alice / To: Me`. Your search term is not part of the filters, so you can change or remove a filter without retyping it.

## How to search

- **Search your favorite channels:** Open Search Slack → Actions → Choose Search Filters… → set Search Scope to Favorite Channels → Show Messages. Favorite people and group DMs are not included.
- **Search a section:** Choose Search Filters… → set Search Scope to Section → select a section → Show Messages. Add terms in the search bar to narrow the results.
- **Search one channel:** On a channel row, choose Search Messages in This Channel in Actions. You can also select the channel in Choose Search Filters…. This keeps a Sender and a Recipient of Mentions and DMs to Me, but removes a Recipient who is a person, because direct messages are not in channels.
- **Search your DM with one person:** Choose Search Filters… → set Search Scope to Direct Message → select the person under Direct Message With → Show Messages. This searches only your DM with that person (the same as `in:@name`).
- **Search one person's posts:** Choose Search Filters… → select a Sender → Show Messages. If you also set a scope, Slack Compass searches only that person's posts in that scope.
- **Search your own posts:** Choose Search Filters… → set Sender to Me → Show Messages.
- **Search messages sent to you:** Choose Search Filters… → set Recipient to Mentions and DMs to Me → Show Messages. This finds messages that mention you and DMs sent to you, and leaves out your own posts unless you also set a Sender. With a scope of channels, it finds only the mentions of you in those channels, because DMs are not in channels.
- **Search DMs sent to one person:** Choose Search Filters… → select a person as Recipient → Show Messages. This finds direct messages sent to that person (the same as `to:@name`). It works with the scope All or a DM. With a channel scope, Slack Compass shows a conflict, because DMs are not in channels.
- **Remove one filter:** In Actions, choose Remove Scope Filter, Remove Sender Filter, or Remove Recipient Filter. Each appears only while that filter is set, and each keeps your search term and the other filters. These actions are also available when there are no results.
- **Clear the filters:** Choose Search Filters… → Clear Filters and Apply. You can still use Actions when there are no results.

Apply saves the filters and returns to the previous screen. Show Messages also shows the regular search results. Slack Compass does not start a search with the filters while you are still choosing them.

## Manage sections

1. Choose Search Filters… → Actions → Manage Sections → Create Section. Enter a name and save.
2. In Manage Sections, select a section, choose Edit Channels, and save. A channel can belong to more than one section.
3. You can also edit memberships from a channel row: choose Section Membership in Actions.
4. In Manage Sections, use Actions to Rename or Delete Section. Slack Compass asks you to confirm before it deletes.

Favorites and section memberships are saved separately. Removing a favorite does not remove the channel from its sections. Slack Compass restores them when you reopen it with the same Slack account. It does not mix in settings from another account.

## Filters and fetch limits

A typed `in:` or `from:` and a selected filter must both match, so a post has to satisfy both. If they do not overlap, you get no results. Slack Compass shows a conflict for expressions that cannot be combined with a selected filter. It never falls back to searching everything when a section is empty or deleted.

Recipient works differently. A typed `to:` cannot be combined with a selected Recipient, so Slack Compass shows a conflict and does not search. Delete the `to:` text, or choose Remove Recipient Filter. When no Recipient is selected, a typed `to:` works as it always has. Slack Compass also shows a conflict, without searching, for combinations that can never match: a Recipient who is a person with a channel scope, a sender or recipient who is neither you nor the person in a DM scope (or in a typed `in:@name`), and the same person as both sender and recipient.

Recipient set to Mentions and DMs to Me runs two searches when the scope is All: one for mentions of you and one for DMs sent to you. With a DM scope, it runs one search for the DMs sent to you. Both leave out your own posts unless you set a Sender.

Regular search fetches up to 2 pages per search and stores up to 400 results in total. Choose Continue Search to continue searches that are not finished. The list shows limits and partial failures, and Fetch Status explains the constraints. The results are the newest of what was fetched, so they are not guaranteed to be the newest 400 across the whole scope. New posts or edits can move page boundaries, so some posts may be missed.
