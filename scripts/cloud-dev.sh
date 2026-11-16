#!/usr/bin/env bash
# クラウド（Claude Code on the web など）で、Tauri なしで画面と API を動かす。
# 画面を build して HTTP サーバー（8080 番）を起動し、ダミーデータを入れる。
#
#   ./scripts/cloud-dev.sh          # 前回のデータを残して起動
#   ./scripts/cloud-dev.sh --reset  # データを消して入れ直す
#
# ログイン: ID 00000001 / パスワード devpassword
set -euo pipefail

cd "$(dirname "$0")/.."
export RCT_DATA_DIR="${RCT_DATA_DIR:-$PWD/.dev-data}"
export RCT_DEV_SEED=1

if [[ "${1:-}" == "--reset" ]]; then
  rm -rf "$RCT_DATA_DIR"
fi

# 病院名・医師名は git に入れていない。なければダミー値で補う。
if [[ ! -f src/lib/secret-utils.ts ]]; then
  cp src/lib/secret-utils.example.ts src/lib/secret-utils.ts
fi

pnpm install --frozen-lockfile
pnpm build
exec cargo run --manifest-path src-tauri/Cargo.toml --no-default-features --bin rct_server
