# Releasing relwolf

relwolf releases itself with the GitHub provider.

1. Add a `RELWOLF_TOKEN` secret: a personal access token with _contents_ and _pull requests_ write access, **not**
   `GITHUB_TOKEN`, so that tag pushes trigger the image and documentation workflows.
2. Enable _Automatically delete head branches_ in the repository settings.
3. Make the GHCR package `ghcr.io/lupiq/relwolf` public.
4. In the repository settings, set _Pages → Source_ to **GitHub Actions** and the custom domain to `relwolf.lupiq.io`
   (DNS: a `CNAME` record pointing to `lupiq.github.io`).

On a merged release pull request, the tag `vX.Y.Z` triggers:

- `publish.yml`: multi-arch image to `ghcr.io/lupiq/relwolf` and the floating major tag (`v1`),
- `docs.yml`: build and deploy of this site to GitHub Pages.

To force a version, see [Controlling the next version](/guide/release-as).
