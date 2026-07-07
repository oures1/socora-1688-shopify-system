# SOCORA 1688発注データ管理 Webシステム アップロード手順

## 方針

このWebシステムは、コードと実データを分けて管理します。

- GitHub: Webシステムのコード、Chrome拡張機能、smallorderテンプレートを保存
- 実データ: `data/store.json` に保存
- 注文CSVや発送先住所などの実データはGitHubへアップロードしない

## ローカル起動

```bash
npm start
```

標準URL:

```text
http://localhost:4877/
```

## Docker起動

```bash
docker build -t socora-1688-order-admin .
docker run --rm -p 4877:4877 -v "$(pwd)/data:/app/data" socora-1688-order-admin
```

## クラウド運用

RenderなどのNode/Docker対応ホスティングへアップロードできます。

`data/store.json` をサーバー内ファイルとして使う場合、サーバー再起動や再デプロイで消えないように、永続ディスクまたは外部DBが必要です。永続ディスクを使わないホスティングでは、再デプロイ時にデータが消える可能性があります。

## Supabaseについて

Supabaseは、今後 `store.json` の代わりに商品・注文データを保存する場合に使います。Supabaseプロジェクトを作成するとAPIキーが発行されるため、作成前に確認してください。

最初のアップロードでは、GitHubにコードを置くところまでで問題ありません。実運用で複数PC・バックアップ・サーバー保存を行う場合は、Supabaseまたは永続ディスクを追加します。

## 推奨する本番構成

注文者名・住所・電話番号を扱うため、公開URLでは必ず認証を有効にします。

- Render: 管理システムをDockerで起動
- Supabase: `data/store.json` の代わりに `admin_store` テーブルへ保存
- パスワード認証: `ADMIN_PASSWORD` をRenderの環境変数に設定
- Shopify追跡反映: Shopifyの管理APIトークン、またはShopifyアプリのClient ID/SecretをRenderの環境変数だけに保存

SupabaseのSQL Editorで先に以下を実行します。

```text
supabase/schema.sql
```

ローカルの現在データをSupabaseに移す場合は、Supabaseの接続情報を環境変数に入れてから実行します。

```bash
SUPABASE_URL="https://..." \
SUPABASE_SERVICE_ROLE_KEY="..." \
node scripts/push_store_to_supabase.js data/store.json
```

Renderでは以下の環境変数を設定します。

```text
STORE_BACKEND=supabase
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
ADMIN_PASSWORD=...
SESSION_SECRET=...（任意。未設定でも動作します）
SHOPIFY_STORE_DOMAIN=y9wpse-tn.myshopify.com
SHOPIFY_ADMIN_ACCESS_TOKEN=...（ShopifyカスタムアプリのAdmin API access token。これがある場合はこちらだけで可）
SHOPIFY_CLIENT_ID=...（Admin API access tokenがない場合）
SHOPIFY_CLIENT_SECRET=...（Admin API access tokenがない場合）
SHOPIFY_API_VERSION=2026-04（任意）
SHOPIFY_TRACKING_COMPANY=Sagawa Express（任意）
SHOPIFY_AUTO_MEDIA_ENABLED=1（任意。0にした場合だけカラー画像の自動反映を停止）
SMALLORDER_TEMPLATE=/app/templates/smallorder.xlsx
PYTHON=python3
```

## GitHubに上げないもの

以下は個人情報や注文データを含む可能性があるため、アップロード対象外です。

```text
data/store.json
data/exports/
```
