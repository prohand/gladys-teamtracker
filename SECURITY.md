# Security policy

## Supported versions

Only the latest release of the Team Tracker integration receives security fixes.
Update the integration from Gladys before reporting an issue.

| Version      | Supported |
| ------------ | --------- |
| 1.x (latest) | Yes       |
| older        | No        |

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or forum
post.

Report it privately through GitHub: open the **Security** tab of
[prohand/gladys-teamtracker](https://github.com/prohand/gladys-teamtracker/security),
then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only asks the
maintainer for a private contact, without any detail of the problem, and send the report
there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens and addresses first).

You should get a first answer within 7 days. A fix is released as a new version of the
integration, and the advisory is published once users can update.

## Scope

In scope: the code of this repository and the Docker image it publishes.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)) and the
ESPN API the integration reads.

## How the integration limits its exposure

- It holds no secret: the ESPN API needs no account and no key.
- It only makes outgoing HTTPS requests to `site.api.espn.com` (scores) and
  `a.espncdn.com` (team logos). A logo URL found in an ESPN answer is fetched only when
  it points to an ESPN image host.
- What users type (league codes, team abbreviations) is checked against a strict
  character set before it reaches a URL.
- It writes only to `/data` (one small JSON file), runs as an unprivileged user on a
  read-only root filesystem, and exposes no port.
