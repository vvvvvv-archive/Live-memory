# Supabase Stage3: anon直接SELECT権限の停止

この手順は、コメント用テーブルに入っている `author_token` を一般利用者が直接取得できないようにするための最終権限変更です。

Stage3は実行済みです。この文書は、権限状態を再確認するための手順として残しています。

## 目的

- `anon` が `public.prototype_comments` を直接 `select` できないようにする
- `anon` が `public.prototype_comment_reactions` を直接 `select` できないようにする
- コメントの取得・投稿・返信・編集・削除・リアクションはRPC経由で維持する
- `author_token` をHTML、JavaScriptレスポンス、検索データへ出さない

## 変更しないもの

- テーブル構造
- 既存コメント
- 既存リアクション
- `page_key`
- Giscus関連の識別子や設定
- RLS設定
- RPC関数

## 実行ファイル

- 権限変更SQL: `docs/supabase-comments-rpc-stage3.sql`
- ロールバックSQL: `docs/supabase-comments-rpc-stage3-rollback.sql`

現在はStage3適用後のため、通常運用では権限変更SQL・ロールバックSQLを再実行しません。

## 権限状態の確認SQL

Supabase SQL Editorで、必要に応じて以下を実行します。

```sql
select
  has_table_privilege('anon', 'public.prototype_comments', 'select') as anon_can_select_comments,
  has_table_privilege('anon', 'public.prototype_comment_reactions', 'select') as anon_can_select_reactions;

select
  has_function_privilege('anon', 'public.current_author_token()', 'execute') as can_current_author_token,
  has_function_privilege('anon', 'public.get_public_comments(text)', 'execute') as can_get_public_comments,
  has_function_privilege('anon', 'public.create_public_comment(text, uuid, text, text, text[])', 'execute') as can_create_public_comment,
  has_function_privilege('anon', 'public.update_own_comment(uuid, text, text[])', 'execute') as can_update_own_comment,
  has_function_privilege('anon', 'public.delete_own_comment(uuid)', 'execute') as can_delete_own_comment,
  has_function_privilege('anon', 'public.toggle_comment_reaction(uuid, text)', 'execute') as can_toggle_comment_reaction;

select count(*) as prototype_comments_count
from public.prototype_comments;

select count(*) as prototype_comment_reactions_count
from public.prototype_comment_reactions;
```

期待値:

- `anon_can_select_comments` と `anon_can_select_reactions` は `false`。
- RPCのexecute権限はすべて `true`。
- コメント件数・リアクション件数が想定と一致すること。

## Stage3実行SQL

Stage3は適用済みです。通常運用では再実行しません。内容確認用としてSQLを残しています。

```sql
revoke select on table public.prototype_comments from anon;
revoke select on table public.prototype_comment_reactions from anon;

grant execute on function public.current_author_token() to anon;
grant execute on function public.get_public_comments(text) to anon;
grant execute on function public.create_public_comment(text, uuid, text, text, text[]) to anon;
grant execute on function public.update_own_comment(uuid, text, text[]) to anon;
grant execute on function public.delete_own_comment(uuid) to anon;
grant execute on function public.toggle_comment_reaction(uuid, text) to anon;
```

## 適用後チェックSQL

### 1. anonの直接SELECT権限が外れていること

```sql
select
  has_table_privilege('anon', 'public.prototype_comments', 'select') as anon_can_select_comments,
  has_table_privilege('anon', 'public.prototype_comment_reactions', 'select') as anon_can_select_reactions;
```

期待値:

- `anon_can_select_comments`: `false`
- `anon_can_select_reactions`: `false`

### 2. anonとして直接SELECTできないこと

SQL Editorで以下を1つずつ実行します。どちらも permission denied になれば正常です。

```sql
begin;
set local role anon;
select author_token
from public.prototype_comments
limit 1;
rollback;
```

```sql
begin;
set local role anon;
select author_token
from public.prototype_comment_reactions
limit 1;
rollback;
```

### 3. RPCはanonで実行できること

```sql
begin;
set local role anon;
select *
from public.get_public_comments(null)
limit 3;
rollback;
```

期待値:

- コメントデータが取得できること
- 返却列に `author_token` が含まれないこと
- `owned` はトークンなしのSQL Editor確認では基本的に `false`

### 4. RPC結果にauthor_tokenが含まれないこと

```sql
select coalesce(bool_or(to_jsonb(result_row) ? 'author_token'), false) as rpc_exposes_author_token
from (
  select *
  from public.get_public_comments(null)
  limit 10
) result_row;
```

期待値:

- `rpc_exposes_author_token`: `false`

### 5. 件数が変わっていないこと

```sql
select count(*) as prototype_comments_count
from public.prototype_comments;

select count(*) as prototype_comment_reactions_count
from public.prototype_comment_reactions;
```

期待値:

- Stage3実行前に控えた件数と同じ。
- Stage3は権限変更だけなので、件数は変わりません。

## GitHub Pages確認チェックリスト

Stage3実行後、GitHub Pagesで以下を確認します。

- [ ] コメントが表示される
- [ ] 新規投稿できる
- [ ] 返信できる
- [ ] 投稿者本人が編集できる
- [ ] 投稿者本人が削除できる
- [ ] リアクションを追加できる
- [ ] リアクションを解除できる
- [ ] 検索でコメント本文がヒットする
- [ ] New Momentsに最新コメント3件が表示される
- [ ] Memoryのランダムコメント表示が動く
- [ ] 別ブラウザでは他人のコメントを編集・削除できない
- [ ] 通常SELECTで `author_token` を取得できない
- [ ] Giscusが画面へ同時表示されていない

## ロールバック手順

Stage3実行後にコメント機能が動かない場合は、原因調査の前に一時復旧として `docs/supabase-comments-rpc-stage3-rollback.sql` を実行できます。

```sql
grant select on table public.prototype_comments to anon;
grant select on table public.prototype_comment_reactions to anon;
```

ロールバックで戻すのは、Stage3で外したSELECT権限だけです。

ロールバックしても以下は変更されません。

- RPC関数
- コメントデータ
- リアクションデータ
- テーブル構造
- Giscus関連

## 注意事項

- `service_role` キーは使いません。
- RLSは無効化しません。
- テーブルやデータは削除しません。
- `page_key` は変更しません。
- Stage3後、フロントエンドは必ずRPC経由でコメントを取得します。
