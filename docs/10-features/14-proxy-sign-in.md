# Proxy Sign-In

## Overview

If an authenticating reverse proxy sits in front of Dotcom Arcade, such as
Authentik, Authelia or oauth2-proxy, the app can sign users in as whoever the
proxy says they are, so they don't log in twice. The proxy handles the login,
including any OAuth or OpenID Connect provider behind it, and passes the
username along in a header.

## Configuration

| Variable                  | Default | Description                                                              |
| ------------------------- | ------- | ------------------------------------------------------------------------ |
| `TRUSTED_HEADER_USERNAME` | -       | Header holding the username                                              |
| `TRUSTED_HEADER_EMAIL`    | -       | Optional header holding the email used for new accounts                  |
| `TRUSTED_PROXIES`         | -       | Comma-separated proxy addresses or CIDR ranges allowed to set the header |

Proxy sign-in is off unless both `TRUSTED_HEADER_USERNAME` and
`TRUSTED_PROXIES` are set.

The headers each proxy sets:

| Proxy                                      | Username header        | Email header            |
| ------------------------------------------ | ---------------------- | ----------------------- |
| Authentik (forward auth)                   | `X-authentik-username` | `X-authentik-email`     |
| Authelia (forward auth)                    | `Remote-User`          | `Remote-Email`          |
| oauth2-proxy (`--set-xauthrequest`)        | `X-Auth-Request-User`  | `X-Auth-Request-Email`  |

With nginx forward auth, copy the header from the auth response into the
request to the app. Authentik's generated nginx snippet already does this;
adding the lines again sends each header twice. For oauth2-proxy:

```nginx
auth_request_set $user  $upstream_http_x_auth_request_user;
auth_request_set $email $upstream_http_x_auth_request_email;
proxy_set_header X-Auth-Request-User  $user;
proxy_set_header X-Auth-Request-Email $email;
```

## Security

The app believes the header only on connections from `TRUSTED_PROXIES`, checked
against the connection's own address, not `X-Forwarded-For`. So:

- The proxy must always set the header, overwriting anything a client sends.
- The app must not be reachable from untrusted networks except through the
  proxy.
- If the header arrives more than once with different values, the request is
  refused.

## Accounts

- **Matching:** users are matched by username, so an existing account with that
  name is signed in.
- **New accounts:** otherwise an account is created. The first one becomes
  admin, as with registration. New accounts get a random password.
- **Passwords:** while signed in through the proxy, users can set a password
  from Settings without knowing the current one. They can then log in with it
  when reaching the app without the proxy, such as on a LAN.
