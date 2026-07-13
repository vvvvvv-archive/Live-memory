# Supabaseコメントバックアップ手順

プレ公開前や、コメント機能のSQL・権限・削除方式を変更する前に、必ずSupabase上のコメントデータをCSVで保存します。

この手順では本番テーブルの構造・権限・データは変更しません。

## 対象テーブル

- `public.prototype_comments`
- `public.prototype_comment_reactions`

## 重要な注意

- バックアップCSVには投稿者識別用の `author_token` が含まれる可能性があります。
- CSVファイルをGitHubリポジトリへ置かないでください。
- Discord、X、Google Driveの公開リンクなど、第三者が見られる場所へ置かないでください。
- 保存先は管理人だけがアクセスできるローカルフォルダ、または非公開のバックアップ保管場所にしてください。

## バックアップ前の件数確認SQL

SupabaseのSQL Editorで、以下を実行して件数を控えてください。

```sql
select count(*) as prototype_comments_count
from public.prototype_comments;

select count(*) as prototype_comment_reactions_count
from public.prototype_comment_reactions;
```

ページ別件数も確認する場合は、以下を実行します。

```sql
select page_key, count(*) as comment_count
from public.prototype_comments
group by page_key
order by page_key;
```

削除済みデータの件数確認には、以下を使います。

```sql
select
  count(*) filter (where deleted_at is not null) as deleted_at_count,
  count(*) filter (where page_key like 'deleted:%') as moved_deleted_count
from public.prototype_comments;
```

現在の削除方式は `deleted_at` を使うソフトデリートです。`page_key like 'deleted:%'` は旧方式データの残存確認用です。現在の運用では削除時に `page_key` を変更しません。

## CSV出力手順

1. Supabaseの対象プロジェクトを開く。
2. 左メニューから `Table Editor` を開く。
3. `prototype_comments` テーブルを開く。
4. 画面上の `Export` または `Download CSV` を選び、CSVとして保存する。
5. 同じ手順で `prototype_comment_reactions` もCSV保存する。
6. 保存したCSVの件数が、バックアップ前の件数確認SQLと一致しているか確認する。

## 推奨ファイル名

日付とテーブル名が分かる名前にします。

```text
2026-07-13_prototype_comments_before_security_update.csv
2026-07-13_prototype_comment_reactions_before_security_update.csv
```

## 保存場所

例:

```text
ローカルPCの非公開フォルダ
外付けドライブ
管理人だけが見られる非公開クラウドフォルダ
```

避ける場所:

```text
GitHub公開リポジトリ
公開URLを知っていれば誰でも見られる共有フォルダ
SNSやチャット
```

## 復旧が必要になった場合

1. 復旧前に、現在の `prototype_comments` と `prototype_comment_reactions` を再度CSV保存する。
2. 復旧したいCSVの件数・作成日・対象テーブルを確認する。
3. 既存データへ重複登録しないよう、復旧方法を決める。
4. 親コメントと返信の関係を壊さないよう、`prototype_comments` を先に復旧する。
5. コメント復旧後、`prototype_comment_reactions` を復旧する。
6. 復旧後に件数確認SQLを実行する。

## 復旧後の確認SQL

```sql
select count(*) as prototype_comments_count
from public.prototype_comments;

select count(*) as prototype_comment_reactions_count
from public.prototype_comment_reactions;
```

返信の親コメントが存在するか確認します。

```sql
select child.id, child.parent_id
from public.prototype_comments child
left join public.prototype_comments parent
  on child.parent_id = parent.id
where child.parent_id is not null
  and parent.id is null;
```

リアクションの対象コメントが存在するか確認します。

```sql
select reaction.id, reaction.comment_id
from public.prototype_comment_reactions reaction
left join public.prototype_comments comment
  on reaction.comment_id = comment.id
where comment.id is null;
```

## 変更前チェックリスト

- [ ] `prototype_comments` のCSVを保存した
- [ ] `prototype_comment_reactions` のCSVを保存した
- [ ] 保存したCSVを公開リポジトリへ置いていない
- [ ] 件数確認SQLの結果を控えた
- [ ] ページ別件数を必要に応じて控えた
- [ ] 削除済みデータの件数を控えた
- [ ] 復旧時に使う保存場所が分かる

## 管理メモ

CSVには `author_token` が含まれる可能性があります。これは投稿者本人判定に使う情報なので、第三者へ共有しないでください。

投稿者削除済みコメントは、バックアップCSV内では `deleted_at` が入った行として保存されます。必要な場合のみ、管理人がUUIDを確認して完全削除します。完全削除時は `ON DELETE CASCADE` により関連返信・リアクションも削除されます。
