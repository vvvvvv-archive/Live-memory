# コメント機能の移行メモ

## 現在の方針

- 画面に表示するコメント欄は、Supabaseを使う独自コメント欄です。
- Giscusはページ上には表示しません。
- ただし、復帰できるようにGiscus生成処理は `js/comment-tools.js` の `createArchivedGiscusElement(memoryId)` に残しています。

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

現在は以下を合流して扱います。

- 既存の `data/memories.json`
- Supabaseの `prototype_comments`

新しい独自コメントは `js/comment-data.js` で検索用データへ変換されます。

## 削除方式

投稿者本人の削除は、行を物理削除せず、`page_key` を `deleted:{commentId}` へ移動して元ページから非表示にします。

