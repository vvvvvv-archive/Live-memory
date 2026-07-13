# Supabaseコメント管理手順

この文書は、管理人がコメントを確認・管理するときの手順です。

## 現在の状態

- コメント機能はSupabase RPC経由で動作しています。
- `anon` は元テーブルを直接SELECTできません。
- `author_token` は公開レスポンスへ返しません。
- 投稿者本人による削除は `deleted_at` を設定するソフトデリートです。
- `page_key` は削除時にも変更しません。
- 当面は自動定期削除を行わず、管理人による個別確認方式で運用します。

## コメント一覧の確認

Supabase SQL Editorで管理人として確認します。

```sql
select
  id,
  page_key,
  parent_id,
  nickname,
  left(body, 120) as body_preview,
  tags,
  created_at,
  updated_at,
  deleted_at
from public.prototype_comments
order by created_at desc
limit 100;
```

## 削除済みコメントの確認

```sql
select
  id,
  page_key,
  parent_id,
  nickname,
  left(body, 120) as body_preview,
  created_at,
  updated_at,
  deleted_at
from public.prototype_comments
where deleted_at is not null
order by deleted_at desc;
```

現在の運用では、`page_key = deleted:{id}` 方式は使用していません。旧方式データが残っていないか確認する場合のみ、以下を使います。

```sql
select count(*) as moved_deleted_count
from public.prototype_comments
where page_key like 'deleted:%';
```

## 問題コメントの非表示

管理人判断で非表示にする場合も、まずはソフトデリート扱いにします。

```sql
update public.prototype_comments
set
  deleted_at = coalesce(deleted_at, now()),
  updated_at = now()
where id = 'ここに対象コメントID'::uuid
  and deleted_at is null;
```

この操作では `page_key` を変更しません。

## 完全削除

完全削除は、必要な場合のみ対象UUIDを確認してから実行します。

完全削除時は、DBの外部キー設定により関連返信・リアクションも `ON DELETE CASCADE` で削除されます。

事前確認:

```sql
select
  c.id,
  c.parent_id,
  c.page_key,
  c.nickname,
  left(c.body, 120) as body_preview,
  c.created_at,
  c.deleted_at,
  (
    select count(*)
    from public.prototype_comments child
    where child.parent_id = c.id
  ) as reply_count,
  (
    select count(*)
    from public.prototype_comment_reactions r
    where r.comment_id = c.id
       or r.comment_id in (
        select child.id
        from public.prototype_comments child
        where child.parent_id = c.id
      )
  ) as related_reaction_count
from public.prototype_comments c
where c.id = 'ここに対象コメントID'::uuid;
```

完全削除:

```sql
begin;

delete from public.prototype_comments
where id = 'ここに対象コメントID'::uuid
  and deleted_at is not null;

commit;
```

未削除コメントを誤って完全削除しないよう、`deleted_at is not null` を条件に含めます。

## 関連リアクションの扱い

コメントを完全削除すると、対象コメントのリアクションも外部キーにより削除されます。

リアクションだけを個別に確認する場合:

```sql
select
  id,
  comment_id,
  emoji,
  created_at
from public.prototype_comment_reactions
where comment_id = 'ここに対象コメントID'::uuid;
```

## 触ってはいけない列

通常運用で手動変更しない列:

- `id`
- `page_key`
- `parent_id`
- `author_token`
- `created_at`

特に `author_token` は投稿者本人判定に使うため、第三者へ共有しないでください。

## 誤操作時

1. すぐに追加操作を止める。
2. 現在の `prototype_comments` と `prototype_comment_reactions` をCSV保存する。
3. `docs/SUPABASE_BACKUP.md` の復旧手順を確認する。
4. 復旧前に、対象コメントID・親子関係・リアクション件数を確認する。

## 将来の自動削除について

プレ公開時点では自動定期削除を行いません。

将来自動削除する場合は、`deleted_at` から90日経過後のコメントを候補にします。導入前に必ずバックアップを取得し、削除候補一覧を確認してください。
