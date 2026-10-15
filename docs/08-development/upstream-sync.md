# Syncing with upstream flashpoint-web

Dotcom Arcade is a heavily modified fork of
[flashpoint-web](https://github.com/darkraise/flashpoint-web) by darkraise
(branch `master`). Most of upstream's code is still used here: the backend, the
frontend's data layer, the player, and the account and admin pages. Upstream's
fixes and features to those parts should keep coming in, so the two projects
don't drift apart.

## What's whose

Comparing this repository with the last upstream commit merged into it:

- **Unchanged here:** most of the backend, the API client, hooks, stores and
  types, the player, the account and admin views, and most docs. Upstream
  changes to these merge as they are.
- **Changed here:** files upstream also owns that this project has modified.
  The main ones:
  - `GameService` (mature filter, release ranges, shuffle, related games);
  - `server.ts` and `config.ts` (stream proxy, update check);
  - `App.tsx` (portal routes);
  - `GamePlayer` (streaming, saves);
  - the browse layout and filters;
  - the rebrand across names and docs.

  Upstream changes to these need merging by hand.
- **Removed here:**
  - the Flash and HTML5 sections;
  - the GitHub stars endpoint;
  - the old homepage pieces;
  - the dev compose file;
  - upstream's CI workflow and design notes.

  These stay removed.
- **Only here:**
  - `streaming/`;
  - `scripts/`;
  - `frontend/src/components/portal/`;
  - `views/GamePage.tsx`;
  - `lib/saves/flashSaves.ts`;
  - `.gitea/`;
  - the discovery backend;
  - migrations 009 and up.

  Upstream never touches these, but a change elsewhere can still need matching
  work here.

`scripts/upstream-status.sh` lists upstream's new commits and puts every file
they touch in one of these groups, so this list doesn't need keeping up to date
by hand.

## When

Run `scripts/upstream-status.sh` when upstream publishes a release, and at
least monthly. Sync when it shows new commits.

## How

1. On a branch from `main`, merge upstream:

   ```sh
   scripts/upstream-status.sh
   git checkout -b upstream-sync-$(date +%Y-%m-%d) origin/main
   git merge refs/remotes/upstream/master
   ```

2. Resolve conflicts by group:
   - **Changed here:** keep this project's behavior and take upstream's fix or
     feature with it. Where they truly conflict, prefer this project's
     behavior, and note what was left out in the pull request.
   - **Removed here:** keep the file deleted
     (`git rm <file>`). If upstream's change matters elsewhere, such as a bug
     fix in shared logic, port that part to where the code lives now.
   - **New upstream:** take it, unless it belongs to something removed here.
     New UI usually lands in the old application layout. Decide whether it
     belongs in the portal, and if so, follow up with a portal version.
   - **Branding:** keep "Dotcom Arcade", our image and container names, and our
     update check (`APP_UPDATE_URL`); don't take back upstream's.
3. Migrations: keep upstream's migration files under their own names, even
   when a number clashes with ours. The migrations table records full names,
   so `009_app_tagline` and an upstream `009_something` both run, in name
   order. Renaming an upstream migration would run it a second time on
   databases that already applied it. Check that ours and theirs don't depend
   on each other's order.
4. Check the result:
   - backend and frontend typecheck, tests and build;
   - the session manager's tests if `streaming/` was affected;
   - `docker compose up -d --build` with and without the `streaming` profile;
   - the docs, for anything the merge made inaccurate.
5. Open a pull request listing upstream's commits and how each conflict was
   resolved. **Merge it with a merge commit, not squash or rebase.** The merge
   records how far upstream has been synced, so the next run of
   `scripts/upstream-status.sh` starts from the right place.

## Sending changes upstream

Fixes made here to code upstream still shares, such as backend bugs, may be
worth offering upstream. Do that separately, from a branch based on upstream's
`master`, and only when the project's maintainer decides to.
