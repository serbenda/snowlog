# Security policy

## Reporting a vulnerability

Please **do not open a public issue**. Use GitHub's private reporting:
**Security → Report a vulnerability** in this repository.

Include a description of the problem, steps to reproduce it and its possible impact. I will reply as soon as possible.

## Supported versions

Only the latest version published on `main`.

## Repository measures

Full details in [docs/SECURITY_GUIDE.md](docs/SECURITY_GUIDE.md).


- `main` protected: no direct pushes, PR required and CI green.
- Secret scanning (Gitleaks) and authorship check on every PR.
- Security hook for AI agents, tested in CI.
- Minimal permissions (`contents: read`) by default in workflows.
