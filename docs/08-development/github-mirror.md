# GitHub mirror

Dotcom Arcade is developed on a private forge. `mirror/github-mirror.sh`
publishes its `main` and the tags on `main` to
[github.com/branderson/dotcom-arcade](https://github.com/branderson/dotcom-arcade),
hourly, from a host that can push to GitHub. Issues and pull requests are off
there. Actions stays on, since it builds the images that `ghcr.io/branderson/`
serves (see [publishing images](../09-deployment/docker-deployment.md#publishing-images)).

The mirror's `main` is the forge's plus one commit, which adds a read-only notice
under the README's title. Every forge commit is in the mirror unchanged, and
each sync fast-forwards. If the README loses its `# ` title, the sync stops
instead of publishing without the notice.

## Setup

1. Set up the timer as described at the top of
   `mirror/dotcom-arcade-github-mirror.service`. Give it a deploy key with write
   access to the GitHub repository.
2. Run `github-mirror.sh --dry-run` to build what a sync would publish without
   pushing it.
3. Once the first sync has pushed, run `github-mirror.sh --settings` (needs
   `gh`). It turns off issues, pull requests, projects, wiki and discussions.
4. The first image build creates its packages as private. In each package's
   settings on GitHub, set its visibility to public.

The timer runs a copy of the script, not the checkout's. Reinstall it after
reviewing a change to `mirror/`.
