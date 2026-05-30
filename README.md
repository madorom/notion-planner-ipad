# Notion Planner for iPad

iPad Safariで使いやすい、Notionデータベース連携の手帳・カレンダーWebアプリです。

## Local Setup

```bash
npm install
cp .env.example .env.local
npm run dev -- --port 3000
```

`.env.local` には次を設定します。

```env
NOTION_TOKEN=
APP_PASSWORD=
AUTH_SECRET=
```

- `NOTION_TOKEN`: NotionのInternal Integration Token
- `APP_PASSWORD`: アプリのログイン用パスワード
- `AUTH_SECRET`: ログインCookie署名用の長いランダム文字列

`AUTH_SECRET` は次のように作れます。

```bash
openssl rand -base64 32
```

## Notion Setup

1. Notionで対象データベースを開く
2. 右上の `...` から `コネクト` / `Connections` を開く
3. Integrationを追加する
4. アプリに `Database ID / Data Source ID` を入力する
5. タイトル・日付プロパティをマッピングする

## Vercel Deploy

VercelのProject Settings -> Environment Variablesに、次を設定します。

```env
NOTION_TOKEN
APP_PASSWORD
AUTH_SECRET
```

`NOTION_TOKEN` はサーバー側だけで使用され、ブラウザやlocalStorageには保存されません。
