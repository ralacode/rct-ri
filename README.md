# RC Tools（rct_ri）

## クラウド開発（Tauri なし・スマホで確認）

画面と API は Tauri の中の HTTP サーバー（axum、8080 番）で動いています。
Tauri のウィンドウを使わずにこのサーバーだけを起動できるので、
Claude Code on the web などのクラウド環境で開発し、スマホのプレビューで確認できます。

```bash
./scripts/cloud-dev.sh --reset
```

- 画面を build し、`rct_server`（`--no-default-features` で Tauri を外したビルド）を起動します。
- DB は `.dev-data/` に作られます（`RCT_DATA_DIR` で変更可能、git 管理外）。
- 初回は開発用担当者と、`ris/rt_order/` のサンプル CSV（架空データ）を入れます。
  - ログイン: ID `00000001` / パスワード `devpassword`
- `src/lib/secret-utils.ts` がなければ、ダミー値の `secret-utils.example.ts` をコピーします。
- 本物の患者データはクラウドに置かないでください。

ショートカット・自動起動・ウィンドウ制御などの Tauri の機能は、Windows 実機で `pnpm tauri dev` を使って確認します。

---

# Astro Starter Kit: Minimal

```sh
npm create astro@latest -- --template minimal
```

> 🧑‍🚀 **Seasoned astronaut?** Delete this file. Have fun!

## 🚀 Project Structure

Inside of your Astro project, you'll see the following folders and files:

```text
/
├── public/
├── src/
│   └── pages/
│       └── index.astro
└── package.json
```

Astro looks for `.astro` or `.md` files in the `src/pages/` directory. Each page is exposed as a route based on its file name.

There's nothing special about `src/components/`, but that's where we like to put any Astro/React/Vue/Svelte/Preact components.

Any static assets, like images, can be placed in the `public/` directory.

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:4321`      |
| `npm run build`           | Build your production site to `./dist/`          |
| `npm run preview`         | Preview your build locally, before deploying     |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `npm run astro -- --help` | Get help using the Astro CLI                     |

## 👀 Want to learn more?

Feel free to check [our documentation](https://docs.astro.build) or jump into our [Discord server](https://astro.build/chat).
