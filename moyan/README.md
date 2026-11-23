# moyan

不安、波及効果、反芻時間、アクション、答え合わせを記録し、分析画面で振り返る静的Webアプリです。ログインせずに使う場合の記録は、同じブラウザ・同じ公開URLの `localStorage` に保存されます。Googleログインを選んだ場合は、アカウントの記録をCloudflare D1で同期できます。

## iPhoneから公開する

1. Cloudflareの **Workers & Pages** で、対象アカウントの `workers.dev` サブドメインを有効にします。
2. Cloudflareの **My Profile → API Tokens** で **Edit Cloudflare Workers** テンプレートを使い、対象のCloudflareアカウントに限定したトークンを作成します。
3. GitHubのリポジトリで **Settings → Secrets and variables → Actions → New repository secret** を開き、`CLOUDFLARE_API_TOKEN` と `CLOUDFLARE_ACCOUNT_ID` を登録します。Account IDは Cloudflare の **Workers & Pages** で確認できます。
4. PRを `main` にマージします。**Actions → Deploy moyan** で実行結果を確認し、サマリーの公開URLをSafariで開きます。Secretsをマージ後に登録した場合は、同じ画面の **Run workflow** で `main` を選んで再実行できます。

iPhoneでGitHubの編集・設定ボタンが見つからない場合は、Safariの「デスクトップ用Webサイトを表示」を使えます。

## ローカル確認

`moyan/` で `npx wrangler@4.50.0 dev` を実行します。公開URLとは保存領域が異なります。

## Googleログインと同期

未ログインの記録はブラウザ内に留まります。Googleログイン後に作成した記録と、設定で明示的に取り込んだ記録はCloudflare D1に保存されます。ログアウトすると未ログイン時の画面に戻ります。計測中のタイマーは端末間で共有されません。アカウントの記録をすべて削除する場合は、ログインした状態で設定の削除ボタンを使います。

1. Google Cloud Console の **Google Auth Platform → Clients** で種類が **Web application** の OAuth クライアントを作成します。承認済みリダイレクト URI に `https://moyan.tishikawa-com.workers.dev/api/auth/callback` を登録します。テスト公開の場合は、使うGoogleアカウントを **Audience → Test users** に追加します。
2. Cloudflare の **Workers & Pages → moyan → Settings → Variables and Secrets** に `GOOGLE_CLIENT_ID` と `GOOGLE_CLIENT_SECRET` を登録します。クライアントシークレットは **Secret** を選択します。値はリポジトリに保存しません。
3. 新規D1環境を用意する場合は、デプロイ前に `moyan/` で `npx wrangler@4.50.0 d1 migrations apply moyan-sync --remote` を実行します。ローカル環境では `--local` を使います。
