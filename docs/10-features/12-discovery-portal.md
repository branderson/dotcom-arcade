# Discovery Portal

## Overview

The public pages use an arcade portal layout styled after 2010-era Flash game
sites, with a homepage built for discovery instead of lists of recent changes.
Account and admin pages keep the application layout.

## Shell

`PortalLayout` (`frontend/src/components/portal/`) wraps the homepage, browse,
game, player, favorites, playlists, downloaded and dashboard routes:

- A framed fixed-width page (1180px, desktop first)
- A wordmark built from the **Site Name** setting, with the optional **Tagline**
  setting underneath
- Search, and a user menu holding the library, account and admin links and the
  mature content switch
- Genre categories linking to browse by tag: Action, Adventure, Puzzle, Shooter,
  Platformer, Sports, Strategy, Driving, Escape the Room and Dress Up, plus
  Animations
- Keyboard shortcuts: `/` focuses search, `R` opens a random game

## Color Schemes

Portal colors are token sets in `components/portal/schemes.ts`. Each scheme sets
`--p-*` properties for the portal's own styles (`portal.css`) and overrides the
shadcn tokens (`--background`, `--primary`, ...) so shared components match. The
tokens are applied to `<body>` while the portal is mounted, which takes
precedence over the app theme on `<html>` and also reaches dialogs and menus
rendered into the body.

One scheme ships, **Chilled** (slate background, sage boxes). Adding a scheme
means adding an entry to `PORTAL_SCHEMES`; no component changes are needed.

Display text uses Fredoka (OFL, bundled via `@fontsource-variable/fredoka`);
body text uses Verdana.

## Homepage

- **Game of the Day:** the same pick for everyone on a given day, from the
  Flashpoint curated playlists, with a link to the previous day's pick
- **Time Machine:** games released in a given week, starting from a random day
  between 2005 and 2014. Users can step by week, jump to a random day, or click
  the date to pick any day. "See all" opens browse filtered to that week. Only
  games with a day-precise release date are included.
- **Jump back in:** the signed-in user's recently played games
- **Playlist shelves:** three random curated playlists with a sample of their
  games

See the [Discovery API](../06-api-reference/discovery-api.md).

## Default Ordering

Browse lists default to a shuffle instead of title order. The shuffle is seeded
and the seed is kept in the URL (`seed=`), so paging, back navigation and shared
links keep the same order; Reshuffle picks a new seed. Searches still default to
title order.

## Mature Content

Flashpoint's `extreme` game flag is not set in current metadata, so mature games
are identified the way the Flashpoint Launcher does: by the tag filter groups
marked `extreme` in `preferences.json` (falling back to
`.preferences.defaults.json`, then to the launcher's default groups:
Pornography, Fetishes, Violence, Bigotry and Pornography Extreme).

`MatureContentService` resolves those tags to game IDs once per database load.
Search, random, related games and discovery exclude them unless the request sets
`showExtreme=true`.

Users opt in with **Show mature games** in the user menu. The choice is stored
in the browser (`flashpoint-mature-content`), and for signed-in users also in
the account's `show_mature` setting, which is applied when they sign in on
another browser.
