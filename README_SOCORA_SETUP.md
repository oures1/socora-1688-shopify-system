# SOCORA Shopify 商品登録システム

この配布物は、既存の 1688/Taobao → Shopify 登録・発注管理システムを SOCORA 用に新規コピーしたものです。

## 既存版から引き継いだ主なルール

- Chrome拡張で1688 / Taobao / Tmallの商品ページを取得
- 管理番号は `S0001` から採番
- 商品URLと管理番号の重複を登録前に確認
- サーバー側でも同じ商品URLの別管理番号登録を拒否
- 送料38元、手数料6元、為替24円、販売価格3倍の初期ルール
- Shopify登録時は販売チャンネルを取得できる公開先すべてへ公開
- Shopify側の在庫追跡は標準OFF
- システム内では在庫確認・発注判断用の在庫情報を保持
- 保存前バックアップを作成
- 発注用 `smallorder.xlsx` テンプレートを同梱

## SOCORA用に変えたところ

- 管理システム名: `socora-order-admin`
- 公開商品URL: `https://socora-online.com/products/...`
- Shopify管理ストアスラッグ初期値: `y9wpse-tn`
- Vendor初期値: `socora`
- Chrome拡張名とアイコンをSOCORA用に変更
- Chrome拡張の保存キーをSOCORA用に分離
- 新規空データで開始できるよう、ローカル保存ガードの下限を0に設定

## Renderで必要な環境変数

最低限、以下を設定してください。

```text
ADMIN_PASSWORD=任意の管理画面パスワード
SESSION_SECRET=長いランダム文字列
SHOPIFY_STORE_DOMAIN=y9wpse-tn.myshopify.com
SHOPIFY_ADMIN_STORE_SLUG=y9wpse-tn
SHOPIFY_CLIENT_ID=c35b7826f31f9def03847b389a24ab75
SHOPIFY_CLIENT_SECRET=Shopify Dev Dashboardのクライアントシークレット
```

本番保存にSupabaseを使う場合:

```text
STORE_BACKEND=supabase
SUPABASE_URL=https://zamyrtauhahrofqkpkiv.supabase.co
SUPABASE_SERVICE_ROLE_KEY=SOCORA行だけ読み書きできるSupabase publishable key
SUPABASE_STORE_TABLE=admin_store
SUPABASE_STORE_KEY=socora
```

ローカルだけで試す場合:

```text
STORE_BACKEND=local
LOCAL_STORE_MIN_PRODUCT_NO=0
LOCAL_STORE_MIN_ORDER_NO=0
```

## Chrome拡張の初期設定

- ストアスラッグ: `y9wpse-tn`
- 管理Web URL: `https://socora-order-admin.onrender.com`
- 為替: `24`

RenderのURLを別名にした場合は、拡張機能の設定画面で管理Web URLをそのURLに変更してください。
