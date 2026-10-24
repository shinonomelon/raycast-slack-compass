# Choosing a search scope

[Back to usage](usage.md)

You can narrow message search by favorites, sections, channels, and sender. Sections are a way to organize channels inside Slack Compass. They do not sync with the sections in the Slack sidebar.

## How to search

- **Search your favorite channels:** Open Search Slack → Actions → Choose Search Filters → set Search Scope to Favorite Channels → Show Messages. Favorite people and group DMs are not included.
- **Search a section:** Choose Search Filters → set Search Scope to Section → select a section → Show Messages. Add terms in the search bar to narrow the results.
- **Search one channel:** On a channel row, choose Search Messages in This Channel in Actions. You can also select the channel in Choose Search Filters.
- **Search one person's posts:** Choose Search Filters → select a Sender → Show Messages. If you also set a scope, Slack Compass searches only that person's posts in that scope.
- **Clear the filters:** Choose Search Filters → Clear Filters and Apply. You can still use Actions when there are no results.

Apply saves the filters and returns to the previous screen. Show Messages also shows the regular search results. Slack Compass does not start a search with the filters while you are still choosing them.

## Manage sections

1. Choose Search Filters → Actions → Manage Sections → Create Section. Enter a name and save.
2. In Manage Sections, select a section, choose Edit Channels, and save. A channel can belong to more than one section.
3. You can also edit memberships from a channel row: choose Section Membership in Actions.
4. In Manage Sections, use Actions to Rename or Delete Section. Slack Compass asks you to confirm before it deletes.

Favorites and section memberships are saved separately. Removing a favorite does not remove the channel from its sections. Slack Compass restores them when you reopen it with the same Slack account. It does not mix in settings from another account.

## Filters and fetch limits

A typed `in:` or `from:` and a selected filter must both match, so a post has to satisfy both. If they do not overlap, you get no results. Slack Compass shows a conflict for expressions that cannot be combined with a selected filter. It never falls back to searching everything when a section is empty or deleted.

Regular search fetches up to 2 pages per search and stores up to 400 results in total. Choose Continue Search to continue searches that are not finished. The list shows limits and partial failures, and Fetch Status explains the constraints. The results are the newest of what was fetched, so they are not guaranteed to be the newest 400 across the whole scope. New posts or edits can move page boundaries, so some posts may be missed.
