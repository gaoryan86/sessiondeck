# Security Policy

## Supported Versions

| Version | Supported |
| --- | --- |
| 0.1.x | Yes |
| < 0.1.0 | No |

## Reporting a Vulnerability

Please do not open public issues for security vulnerabilities.

Report privately with:

- Affected version/commit
- Reproduction steps
- Expected and actual behavior
- Impact assessment

Until a private security channel is configured, contact the maintainer directly and include `[SECURITY] SessionDeck` in the message title.

## Security Boundaries

- Recovery mode is read-only.
- Session naming/tagging writes sidecar metadata only.
- Delete operation moves files to system Trash and updates index.
