# Up

Shows who is up on the Nextup floor board, in the Omarchy bar.

The bar shows the first names of the top two people on the POSITION list. Click it for each full name and the time Nextup has. People already with a guest stay on the board and are not listed here.

The list is requested from Nextup once a minute. The login comes from a 1Password item named Nextup. Chromium does not have to be open.

## Install

The widget is `giaodn.up`. The reader is the user service `giaodn-up`.

In 1Password, add a login named Thenextup in the Personal vault, with the username and password fields filled in. Then open Settings, Developer, and turn on Integrate with 1Password CLI. Unlock 1Password when the bar says Locked.

If Nextup sends a text or email code, click the bar and enter it. The code is used once and is not kept.

Move it with:

```bash
omarchy bar move giaodn.up --section left
```
