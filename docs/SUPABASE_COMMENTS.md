# 独自コメント機能 Supabase設定メモ

V6 2021の独自コメント欄を、全ユーザー共通で保存するための準備メモです。

## 現在の状態

- `js/comment-backend-config.js` の `enabled` は `false` です。
- この状態では、今まで通りブラウザ内だけに保存されます。
- Supabase設定後に `enabled: true` へ変更すると、共有コメント保存へ切り替わります。

## 1. Supabaseで用意するもの

1. Supabaseで新しいProjectを作成
2. SQL Editorで `docs/supabase-comments.sql` を実行
3. Project Settings > API から以下を確認
   - Project URL
   - anon public key
4. `js/comment-backend-config.js` に設定

```js
window.VVVVVV_COMMENT_BACKEND = {
  provider: "supabase",
  enabled: true,
  supabaseUrl: "https://xxxxxxxx.supabase.co",
  supabaseAnonKey: "公開anon key"
};
```

すでにテーブルを作成済みで権限エラーが出る場合は、SQL Editorで以下だけ追加実行してください。

```sql
grant usage on schema public to anon;
grant select, insert, update on public.prototype_comments to anon;
grant select, insert, delete on public.prototype_comment_reactions to anon;
```

## 2. 保存される内容

- ページID
- 親コメントID
- ニックネーム
- コメント本文
- メンバー名タグ
- 投稿者本人判定用トークン
- 投稿日時
- 更新日時
- 削除日時
- リアクション

## 3. 本人編集・削除について

投稿者本人の判定は、ブラウザに保存された投稿者トークンで行います。

- 同じ端末・同じブラウザなら編集・削除できます。
- 別端末やブラウザを変えた場合は本人判定できません。
- 管理人削除は、Supabase管理画面から対象行の `deleted_at` を設定する運用を想定しています。

## 4. 注意点

- anon keyは公開される前提のキーです。
- `service_role` keyは絶対にサイトへ置かないでください。
- SQLのRLSポリシーで、投稿者トークンが一致する場合のみ編集・削除できるようにしています。
- 本格運用前に、スパム対策・NGワード・通報フローを追加検討してください。
