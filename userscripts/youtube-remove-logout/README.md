# YouTube Remove Logout

Personal userscript for removing the logout entry from the YouTube account
menu.

## Scope

- Removes only account-menu entries that point to YouTube's `/logout`
  endpoint.
- Does not rely on visible text, so it is not tied to a specific YouTube UI
  language.
- Does not intercept requests, credentials, cookies, or account state.
- Does not remove other account links such as account switching, settings, or
  YouTube Studio.

## Files

- `youtube-remove-logout.user.js`: Tampermonkey userscript.
- `src/remove-logout-core.js`: Shared DOM cleanup helper used by tests.
- `test/remove-logout-core.test.js`: Node test suite for selector behavior.

## Verification

```powershell
node --check .\userscripts\youtube-remove-logout\youtube-remove-logout.user.js
node --test .\userscripts\youtube-remove-logout\test\remove-logout-core.test.js
```
