# Mindflow

Mindflow は、ブラウザだけで使えるシンプルなマインドマップです。アカウント登録やサーバーは不要で、入力した内容はブラウザのローカルストレージに保存されます。

## できること

- テーマと子ノードの追加
- ノード名の編集
- 子ノードを含む削除（元に戻す操作に対応）
- ドラッグによる自由配置
- 親子関係を曲線で表示
- ブラウザへの自動保存
- PC・スマートフォン対応

## ローカルで確認

`public` フォルダを静的Webサーバーで配信してください。

```bash
python3 -m http.server 4173 --directory public
```

その後、`http://localhost:4173` を開きます。

## Cloudflare Pages

- フレームワーク: なし
- ビルドコマンド: なし
- 出力ディレクトリ: `public`
- 本番ブランチ: `main`

Wranglerで直接公開する場合:

```bash
npx wrangler pages deploy public --project-name mindflow-mvp
```

## データについて

マップの内容は、利用中のブラウザの `localStorage` にのみ保存されます。別の端末やブラウザとは同期されません。ブラウザのサイトデータを削除すると、マップも削除されます。
