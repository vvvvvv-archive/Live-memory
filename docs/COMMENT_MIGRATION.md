# コメント機能の移行メモ

## 現在の方針

- 画面に表示するコメント欄は、Supabaseを使う独自コメント欄です。
- Giscusはページ上には表示しません。
- ただし、復帰できるようにGiscus生成処理は `js/comment-tools.js` の `createArchivedGiscusElement(memoryId)` に残しています。
- Giscusの既存識別子や設定は削除していません。

## 復帰が必要になった場合

各コメントページで、独自コメント欄を差し込んでいる箇所をGiscus差し込みに戻します。

現在:

```js
appendPrototypeCommentsIfEnabled(container, groupId, liveId, memoryId);
```

復帰時の考え方:

```js
container.appendChild(createArchivedGiscusElement(memoryId));
```

必要に応じて、注意事項や投稿管理リンクも同じコンテナへ追加してください。

## 検索・最新コメント・ランダム表示

現在はSupabase RPC `get_public_comments()` から取得したコメントを、`js/comment-data.js` で検索用データへ変換しています。

- 検索: RPC経由のコメント本文を対象にします。
- 最新コメント3件: `created_at` 降順で表示します。
- ランダムコメント: コメントが1件以上あるページだけを対象にします。
- 削除済みコメントや削除済み親コメントの返信はRPC側で除外されます。

## 削除方式

現在の投稿者削除は、`deleted_at` を設定するソフトデリートです。

- `page_key` は削除時にも変更しません。
- 削除済みコメントは通常表示、検索、最新コメント、ランダムコメントから除外します。
- 削除済み親コメントの返信も通常表示から除外します。

過去の試作段階では `page_key = deleted:{commentId}` 方式を使っていましたが、現在は使用していません。
