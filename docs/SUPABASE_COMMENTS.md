# Supabaseコメント機能 現在仕様

この文書は、現在運用中のSupabaseコメント機能の概要です。

## 現在の状態

- コメント欄はSupabaseを使う独自コメント機能です。
- `js/comment-backend-config.js` の `enabled` は `true` です。
- 投稿・取得・返信・編集・削除・リアクションはRPC経由で行います。
- `anon` は元テーブル `prototype_comments` / `prototype_comment_reactions` を直接SELECTできません。
- `author_token` は公開レスポンスへ返しません。
- Giscusは画面には表示していませんが、復帰用コードと識別子は残しています。

## 使用する主なRPC

- `get_public_comments(target_page_key text)`
- `create_public_comment(target_page_key text, target_parent_id uuid, input_nickname text, input_body text, input_tags text[])`
- `update_own_comment(target_comment_id uuid, input_body text, input_tags text[])`
- `delete_own_comment(target_comment_id uuid)`
- `toggle_comment_reaction(target_comment_id uuid, input_emoji text)`

## 保存される内容

- `page_key`: コメント欄を識別するページID
- `parent_id`: 返信先コメントID
- `nickname`: ニックネーム
- `body`: コメント本文
- `tags`: メンバー名タグ
- `author_token`: 投稿者本人判定用トークン
- `created_at`: 投稿日時
- `updated_at`: 更新日時
- `deleted_at`: 投稿者削除時刻
- リアクション情報

## 本人編集・削除

投稿者本人の判定は、ブラウザに保存された投稿者トークンとDB内の `author_token` をRPC内で比較して行います。

- 同じ端末・同じブラウザなら編集・削除できます。
- 別端末や別ブラウザでは本人判定できません。
- シークレット／プライベートブラウズ終了後は本人判定できなくなります。
- ブラウザデータを削除した場合も本人判定できなくなります。
- `author_token` 自体は画面や公開レスポンスへ返しません。

## 削除仕様

- 投稿者による削除は `deleted_at` を設定するソフトデリートです。
- 削除時にも `page_key` は変更しません。
- 削除済みコメントは通常表示、検索、最新コメント3件、ランダムコメントから除外します。
- 削除済み親コメントに紐づく返信も通常表示から除外します。
- 必要な場合のみ、管理人がUUIDを確認して完全削除します。
- 完全削除時は `ON DELETE CASCADE` により関連返信・リアクションも削除されます。
- 当面は自動定期削除を行わず、管理人による個別確認方式とします。
- 将来自動削除する場合は、`deleted_at` から90日経過後を候補にします。

## 旧方式について

過去の試作段階では、削除時に `page_key = deleted:{commentId}` へ移動する方式を使っていました。

現在この方式は使用していません。旧方式データは完全削除済みで、現在の確認結果では `page_key` が `deleted:` で始まるコメントは0件です。

## 注意点

- `anon` keyは公開される前提のキーです。
- `service_role` keyは絶対にサイトへ置かないでください。
- RLSは無効化しません。
- コメントデータのバックアップCSVには `author_token` が含まれる可能性があるため、公開場所へ置かないでください。
