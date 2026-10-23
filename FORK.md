# How this fork works

`brereh/vis-core` is a fork of Transport for the North's vis-core. It exists so that projects such as the LCRTM data tool can use changes before Transport for the North releases them.

## Branches

| Branch | Purpose |
| --- | --- |
| `fork-dev` | The fork's working branch. Pull requests go here. Each merge publishes `@brereh/vis-core`. |
| `dev` | An exact copy of Transport for the North's `dev`. Only ever synced from upstream; never commit to it directly. |
| `main` | An exact copy of Transport for the North's `main`. |

Only two files exist on `fork-dev` and nowhere upstream: this one and `.github/workflows/publish-fork-package.yml`. Never cherry-pick either onto an upstream branch.

## Keeping up with Transport for the North

1. Sync `dev` with "Sync fork" on GitHub, or fetch `upstream/dev` and fast-forward.
2. Merge `dev` into `fork-dev` through a pull request, so the tests run.

## Sending a change upstream

1. Create a branch from Transport for the North's `dev`, not from `fork-dev`.
2. Cherry-pick the commits you want onto it.
3. Open the pull request from that branch to `Transport-for-the-North/vis-core` `dev`.

Never open a pull request from `fork-dev` to Transport for the North: it would carry every fork-only commit.

## The package

- Name: `@brereh/vis-core` on GitHub Packages (`npm.pkg.github.com`).
- Version: `<upstream version>-brereh.<run number>`, for example `0.14.0-brereh.3`, tagged `fork-v<version>` on the commit it was built from. The `latest` dist-tag is the newest build.
- To install it under the upstream name, so imports stay `@transport-for-the-north/vis-core`, add `@brereh:registry=https://npm.pkg.github.com` to `.npmrc` and use an alias:

  ```json
  "@transport-for-the-north/vis-core": "npm:@brereh/vis-core@0.14.0-brereh.3"
  ```

  The install token needs `read:packages`.

## Actions

The fork's own workflow is `Fork CI and package`. Transport for the North's `Test and Publish to GitHub Packages` workflow is disabled in this fork's Actions settings: its publish job needs their release bot secrets and would fail on every sync of `dev`.
