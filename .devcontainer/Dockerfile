# Dev container for working with Claude Code away from your Mac: the agent sees only this project, not your
# home folder, SSH keys, keychain or other repos. Pinned: the base image by digest, Gitleaks and Node.js by
# release and SHA-256, Claude Code and its npm packages by claude-code/package-lock.json (integrity hashes, installed
# with npm ci; Dependabot proposes new versions after a week). Not pinned: the Ubuntu packages (from the pinned
# image's release).
# Dependabot (devcontainers and docker ecosystems) proposes updates to the base image.
FROM mcr.microsoft.com/devcontainers/base:2-ubuntu-24.04@sha256:d94c97dd9cacf183d0a6fd12a8e87b526e9e928307674ae9c94139139c0c6eae

ARG GITLEAKS_VERSION=8.30.1
# Claude Code needs Node.js 22 or newer; Ubuntu 24.04's package is 18. A 22 LTS release at least a week old.
ARG NODE_VERSION=22.23.4

# python3/jq: the guard hook; shellcheck: the Verify commands; bubblewrap/socat: Claude Code's sandbox on Linux;
# xz-utils: unpacks Node.js (below); gh: PRs and issues (as the agent account, with its token).
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 jq shellcheck bubblewrap socat xz-utils gh \
 && rm -rf /var/lib/apt/lists/*

# Gitleaks, so the pre-commit hook can run (it refuses every commit without it). Checked against the release's
# published checksums for each architecture.
RUN set -eu; \
    case "$(dpkg --print-architecture)" in \
      amd64) asset=linux_x64;   sum=551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb ;; \
      arm64) asset=linux_arm64; sum=e4a487ee7ccd7d3a7f7ec08657610aa3606637dab924210b3aee62570fb4b080 ;; \
      *) echo "unsupported architecture" >&2; exit 1 ;; \
    esac; \
    curl -fsSLo /tmp/gitleaks.tgz "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_${asset}.tar.gz"; \
    echo "${sum}  /tmp/gitleaks.tgz" | sha256sum -c -; \
    tar -xzf /tmp/gitleaks.tgz -C /usr/local/bin gitleaks; \
    rm /tmp/gitleaks.tgz

# Node.js, for Claude Code, from nodejs.org, checked against the release's published checksums.
RUN set -eu; \
    case "$(dpkg --print-architecture)" in \
      amd64) asset=linux-x64;   sum=1805bcd35e6815559bd2eb97db438d3fdb0eb3a5e6a977b7c1badca76337e9ce ;; \
      arm64) asset=linux-arm64; sum=6287aa46b6c375d816e63ae66d024fbbfd70404825aabdfdf898a970871d2f4b ;; \
      *) echo "unsupported architecture" >&2; exit 1 ;; \
    esac; \
    curl -fsSLo /tmp/node.tar.xz "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-${asset}.tar.xz"; \
    echo "${sum}  /tmp/node.tar.xz" | sha256sum -c -; \
    tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 --no-same-owner; \
    rm /tmp/node.tar.xz

# Claude Code from claude-code/package-lock.json: npm ci installs exactly those packages and checks each one's
# integrity hash (no version is resolved at build time).
COPY claude-code/package.json claude-code/package-lock.json /opt/claude-code/
RUN cd /opt/claude-code \
 && npm ci --no-audit --no-fund \
 && ln -s /opt/claude-code/node_modules/.bin/claude /usr/local/bin/claude

# The volume for Claude Code's settings is mounted here; created now so it belongs to vscode, not root.
RUN mkdir -p /home/vscode/.claude && chown vscode:vscode /home/vscode/.claude

USER vscode
