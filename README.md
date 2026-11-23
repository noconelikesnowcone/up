# Up

Shows who is up on the Nextup floor board, in the Omarchy bar.

The bar shows the first names of the top two people on the POSITION list. Click it for every full name. The person at the top also shows when their turn ends. Nobody else has a time. People already with a guest stay on the board and are not listed here.

The end time is formatted by `timeFormat` on the `giaodn.up` entry in `~/.config/omarchy/shell.json`. `HHmm` prints 1501. `HH:mm` prints 15:01. `h:mma` prints 3:01pm.

The list is requested from Nextup once a minute. Chromium does not have to be open. The `extension/` directory and `host.py` are not part of the install.

## Install

```bash
omarchy plugin add https://github.com/noconelikesnowcone/up --enable
```

That adds the bar widget and nothing else. It does not sign in, start the reader, or edit other settings. Move it with `omarchy bar move giaodn.up --section left`.

### Reader

The widget only displays a list. A user service reads Nextup once a minute and writes `~/.local/state/omarchy/giaodn.up.json`.

In 1Password, add a login named Thenextup in the Personal vault, with the username and password fields filled in. Then open Settings, Developer, and turn on Integrate with 1Password CLI. Unlock 1Password when the bar says Locked. `reader.json` points at that item. The password stays in 1Password.

If Nextup sends a text or email code, click the bar and enter it. The code is used once and is not kept. A 1Password field labeled Code is read only when Nextup asks for one.

Start the reader yourself:

```bash
ln -s ~/.config/omarchy/plugins/giaodn.up/giaodn-up.service ~/.config/systemd/user/giaodn-up.service
systemctl --user daemon-reload
systemctl --user enable --now giaodn-up.service
```

## Remove

Stop the reader before removing the widget. `omarchy plugin remove` deletes the plugin checkout and does not stop the service.

```bash
systemctl --user disable --now giaodn-up.service
rm -f ~/.config/systemd/user/giaodn-up.service
systemctl --user daemon-reload
omarchy plugin remove giaodn.up
```

The position list and the signed-in session stay in `~/.local/state/omarchy/` until you delete them:

```bash
rm -f ~/.local/state/omarchy/giaodn.up.json
rm -rf ~/.local/state/omarchy/giaodn.up
```

Removal does not change the 1Password item.

## License

MIT. Copyright (c) 2026 Giao Nguyen. See [LICENSE](LICENSE).

## Dependencies

No sudo or pkexec is required.

- Omarchy, with its shell
- Python 3, standard library only
- Node.js, used to order the position list
- 1Password CLI (`op`), with Integrate with 1Password CLI turned on
- A Nextup login stored in 1Password
- Network access to `https://login.thenextup.com`
