# 独自コメント機能 試作メモ

## 現在の位置づけ

この試作は、既存のGiscusコメント機能を置き換えるものではありません。

`comment-prototype.html` は独立した検証ページで、コメントはブラウザのLocalStorageに保存されます。既存ページ、Giscus、検索、`data/memories.json` には影響しません。

## 試作で確認できること

- ログイン不要の投稿フォーム
- ニックネーム任意、未入力時は「名無しさん」
- コメント本文
- 返信は1段階
- リアクション: 😊 / 😍 / 😭 / 👏 / 🔥
- 投稿者本人だけ編集・削除
- 短時間連投制限
- NGワード制限
- URL投稿制限
- 文字数制限

## 試作の制限

- LocalStorage保存のため、端末・ブラウザをまたいで共有されません。
- 管理人用の削除画面はありません。
- 本番用のバックアップはありません。
- 本物のスパム対策にはサーバー側チェックが必要です。

## 本番採用時の推奨

現時点で一番現実的なのは、Cloudflare Workers + D1です。

理由:

- GitHub Pagesと併用しやすい
- 匿名投稿APIを作りやすい
- D1はSQLite系で、コメント・返信・リアクションの構造に向いている
- Workers側でNGワード、URL制限、連投制限、Turnstileなどを入れやすい
- 無料枠が比較的大きい
- データはSQLでエクスポートしやすい

## 比較

### Cloudflare Workers + D1

メリット:

- Workers Freeは100,000 requests/day
- D1 FreeはRows read 5 million/day、Rows written 100,000/day、Storage 5 GB
- サーバー側でスパム対策を実装しやすい
- バックアップはD1 exportや定期エクスポートで設計しやすい

デメリット:

- API実装が必要
- 管理画面を自作する必要がある
- GitHub Pagesだけでは完結しない

### Supabase

メリット:

- PostgreSQLで管理しやすい
- Freeで500 MB database、50,000 MAU、5 GB egress
- 管理画面が強い
- 将来的にログインを入れやすい

デメリット:

- Free projectは1週間非アクティブでpauseされる
- 匿名投稿を許す場合、RLS設計を慎重に作る必要がある
- 本番運用はPro移行の可能性がある

### Firebase Firestore

メリット:

- クライアント実装が比較的簡単
- SparkでFirestoreの無料枠がある
- リアルタイム表示が得意

デメリット:

- 匿名投稿のセキュリティルール設計が難しい
- 読み取り回数が増えるとコスト設計が読みにくい
- データ構造や集計はSQLより扱いづらい

## 本番化する場合に必要なテーブル案

### comments

- id
- page_key
- nickname
- body
- author_token_hash
- parent_id
- created_at
- updated_at
- deleted_at
- status

### reactions

- id
- comment_id
- emoji
- actor_token_hash
- created_at

### moderation_logs

- id
- comment_id
- action
- reason
- created_at

## スパム対策案

- IP + author_token単位の連投制限
- URL件数制限
- NGワード
- 文字数制限
- Cloudflare Turnstile
- 管理人による非表示
- 一定数通報で一時非表示

## バックアップ案

- Cloudflare D1 exportを定期実行
- GitHub Actionsで日次バックアップをリポジトリまたは外部ストレージへ保存
- CSV/JSONでコメント全件を書き出せる管理APIを用意

## 判断

プレ公開段階ではGiscus継続が安全です。

独自コメントは、投稿数が増えて「GitHubログインが投稿の障壁になっている」と明確に分かってから、本番バックエンド付きで再検討するのがよいです。
