# Supabaseコメント運用メモ

このメモは、プレ公開後に追加検討する機能と、削除済みコメントの確認・完全削除運用をまとめたものです。

本番データを変更するSQLは、ここではまだ実行しません。

## 現在の削除仕様

- 投稿者による削除は `deleted_at` を設定するソフトデリートです。
- 削除時にも `page_key` は変更しません。
- 削除済みコメントは通常表示、検索、最新コメント3件、ランダムコメントから除外します。
- 削除済み親コメントの返信も通常表示から除外します。
- 必要な場合のみ、管理人がUUIDを確認して完全削除します。
- 完全削除時は `ON DELETE CASCADE` により関連返信・リアクションも削除されます。
- 当面は自動定期削除を行わず、管理人による個別確認方式とします。
- 将来自動削除する場合は、`deleted_at` から90日経過後を候補にします。

## 自分の投稿機能の設計案

この機能はプレ公開後の追加候補です。現時点では未実装のまま維持します。

### 実装可能か

実装可能です。

現在のコメントRPCは、ブラウザに保存されている投稿者トークンを `x-author-token` ヘッダーで送り、DB側で `author_token` と比較して `owned: true/false` だけを返しています。

同じ仕組みで、`get_own_comments()` のような専用RPCを作れば、現在のブラウザの投稿者トークンと一致するコメントだけをDB側で抽出できます。

### 推奨方式

- フロントエンドは `author_token` を表示しない
- RPCレスポンスにも `author_token` を含めない
- 専用 `get_own_comments()` RPCを使う
- 全コメントをブラウザへ取得してから絞り込まない
- データは複製しない
- 同じブラウザに保存された `author_token` がある場合だけ、RPC内で本人投稿として照合できる
- 別端末、別ブラウザ、シークレットモード終了後、ブラウザデータ削除後は過去投稿を取得できない
- 容量への影響はほぼない
- プレ公開後、必要性を確認してから実装する

### RPC案

```sql
create or replace function public.get_own_comments()
returns table (
  id uuid,
  page_key text,
  parent_id uuid,
  nickname text,
  body text,
  tags text[],
  created_at timestamptz,
  updated_at timestamptz,
  reactions jsonb
)
language sql
security definer
set search_path = public
as $$
  select
    c.id,
    c.page_key,
    c.parent_id,
    c.nickname,
    c.body,
    c.tags,
    c.created_at,
    c.updated_at,
    coalesce(
      (
        select jsonb_object_agg(
          reaction_counts.emoji,
          jsonb_build_object(
            'count', reaction_counts.reaction_count,
            'reacted', reaction_counts.reacted
          )
        )
        from (
          select
            r.emoji,
            count(*)::integer as reaction_count,
            bool_or(r.author_token = public.current_author_token()) as reacted
          from public.prototype_comment_reactions r
          where r.comment_id = c.id
          group by r.emoji
        ) reaction_counts
      ),
      '{}'::jsonb
    ) as reactions
  from public.prototype_comments c
  left join public.prototype_comments parent
    on c.parent_id = parent.id
  where c.author_token = public.current_author_token()
    and public.current_author_token() <> ''
    and c.deleted_at is null
    and c.page_key not like 'deleted:%'
    and (
      c.parent_id is null
      or (
        parent.id is not null
        and parent.deleted_at is null
        and parent.page_key not like 'deleted:%'
      )
    )
  order by c.created_at desc;
$$;

grant execute on function public.get_own_comments() to anon;
```

### 画面案

- トップページまたは専用ページに「自分の投稿」リンクを置く
- 現在のブラウザで投稿したコメントだけを一覧表示する
- コメントカードから投稿先ページへ移動できるようにする
- ブラウザデータ削除後、別端末、別ブラウザ、シークレットモード終了後は過去投稿を本人のものとして取得できないことを明記する

### 無料枠・速度への影響

- 追加データ保存は不要なので、ストレージ容量への影響はありません。
- 自分の投稿だけをDB側で抽出するため、全件取得より軽いです。
- 投稿数が増える場合は `author_token, created_at` のインデックス追加を検討します。

```sql
create index if not exists prototype_comments_author_token_created_at_idx
on public.prototype_comments (author_token, created_at desc);
```

このインデックスは速度改善用です。機能実装時に必要性を見て判断します。

## 削除済みコメントの確認

### 現在のコード上の状態

- 新規削除は `delete_own_comment()` RPCで `deleted_at = now()` を設定します。
- JavaScript側の削除処理は `page_key` を書き換えていません。
- `get_public_comments()` RPCは `deleted_at is null` のコメントだけを返します。
- 検索、New Moments、ランダム表示は `get_public_comments()` RPCを使うため、削除済みコメントは出ません。
- 親コメントが削除済みの場合、その返信も通常取得では返しません。
- 削除済みコメントに紐づくリアクションはDB内に残る可能性がありますが、通常取得では削除済みコメント自体が返らないため一般表示されません。

### 管理人確認SQL

Stage3後は、通常のanon直接SELECTでは確認できません。Supabase SQL Editorで管理人として実行してください。

```sql
select count(*) as moved_deleted_count
from public.prototype_comments
where page_key like 'deleted:%';
```

```sql
select count(*) as deleted_at_count
from public.prototype_comments
where deleted_at is not null;
```

```sql
select
  id,
  page_key,
  parent_id,
  nickname,
  left(body, 80) as body_preview,
  created_at,
  updated_at,
  deleted_at
from public.prototype_comments
where page_key like 'deleted:%'
   or deleted_at is not null
order by coalesce(deleted_at, updated_at, created_at) desc;
```

### テストコメントについて

プレ公開前に確認済みの削除済みテストコメント4件は完全削除済みです。

今後テストコメントを削除する場合も、推測ではなく対象UUIDを確認してから個別に削除します。

### 親コメントを完全削除する際の返信の扱い

`prototype_comments.parent_id` は `on delete cascade` です。

親コメントを物理削除すると、その返信コメントも一緒に削除されます。関連リアクションも、コメントIDへの外部キーが `on delete cascade` なので一緒に削除されます。

安全のため、完全削除前には必ず削除対象の親コメント・返信・リアクション件数を確認します。

## 完全削除の運用案

投稿者本人の削除は、今後も `deleted_at` によるソフトデリートを基本にします。

管理人が必要な場合のみ、Supabase Table EditorまたはSQL Editorで完全削除します。フロントエンドに `service_role` キーは置きません。

### 案1: 管理人が個別に確認して完全削除

特徴:

- 削除対象を1件ずつ確認できる
- 誤削除リスクが低い
- プレ公開初期に向いている
- 件数が増えると手間がかかる

事前確認SQL:

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
where c.id = 'ここに削除対象コメントID'::uuid;
```

完全削除SQL案:

```sql
begin;

delete from public.prototype_comments
where id = 'ここに削除対象コメントID'::uuid
  and deleted_at is not null;

commit;
```

`deleted_at is not null` を条件に入れることで、未削除コメントを誤って完全削除しにくくします。

### 案2: deleted_atから90日経過したコメントを将来自動削除

特徴:

- 運用の手間が少ない
- DB容量を自動的に整理しやすい
- 誤削除に気づく猶予を残せる
- プレ公開時点では実施しない
- 将来導入する場合は90日経過後を候補にする

候補確認SQL:

```sql
select
  id,
  page_key,
  parent_id,
  nickname,
  left(body, 120) as body_preview,
  created_at,
  deleted_at
from public.prototype_comments
where deleted_at < now() - interval '90 days'
order by deleted_at asc;
```

完全削除SQL案:

```sql
begin;

delete from public.prototype_comments
where deleted_at < now() - interval '90 days';

commit;
```

プレ公開直後は、案1の個別確認方式を採用します。投稿数が増え、運用上必要になった場合のみ90日定期削除を検討します。

## 容量への影響

- `deleted_at` 方式では削除済み本文がDBに残るため、容量は少しずつ増えます。
- 現在の想定規模では、Supabase無料枠をすぐ圧迫する可能性は低いです。
- リアクションは1行あたり小さく、容量影響はコメント本文より小さいです。
- 完全削除を行うと、対象コメント・返信・関連リアクションの行が削除され、容量整理になります。
