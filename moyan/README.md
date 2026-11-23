# moyan

不安、波及効果、反芻時間、アクション、答え合わせを記録し、分析画面で振り返る静的Webアプリです。記録は同じブラウザ・同じ公開URLの `localStorage` に保存されます。外部サービスへの送信はありません。

## iPhoneから公開する

1. Cloudflareの **Workers & Pages** で、対象アカウントの `workers.dev` サブドメインを有効にします。
2. Cloudflareの **My Profile → API Tokens** で **Edit Cloudflare Workers** テンプレートを使い、対象のCloudflareアカウントに限定したトークンを作成します。
3. GitHubのリポジトリで **Settings → Secrets and variables → Actions → New repository secret** を開き、`CLOUDFLARE_API_TOKEN` と `CLOUDFLARE_ACCOUNT_ID` を登録します。Account IDは Cloudflare の **Workers & Pages** で確認できます。
4. PRを `main` にマージします。**Actions → Deploy moyan** で実行結果を確認し、サマリーの公開URLをSafariで開きます。Secretsをマージ後に登録した場合は、同じ画面の **Run workflow** で `main` を選んで再実行できます。

iPhoneでGitHubの編集・設定ボタンが見つからない場合は、Safariの「デスクトップ用Webサイトを表示」を使えます。

## ローカル確認

`moyan/` で `npx wrangler@4.50.0 dev` を実行します。公開URLとは保存領域が異なります。
