/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const comments = app.findCollectionByNameOrId("comments");
  if (!comments.fields.getByName("parent_id")) {
    comments.fields.add(new TextField({ name: "parent_id", max: 15 }));
    app.save(comments);
  }

  const commentLikes = new Collection({
    name: "comment_likes",
    type: "base",
    listRule: "",
    viewRule: "",
    createRule: "@request.auth.id != \"\" && @request.body.user_id = @request.auth.id",
    deleteRule: "@request.auth.id != \"\" && user_id = @request.auth.id",
  });
  commentLikes.fields.add(new TextField({ name: "comment_id", required: true, max: 15 }));
  commentLikes.fields.add(new TextField({ name: "user_id", required: true, max: 15 }));
  commentLikes.indexes = ["CREATE UNIQUE INDEX `idx_comment_likes_comment_user` ON `comment_likes` (`comment_id`, `user_id`)"];
  return app.save(commentLikes);
}, (app) => {
  const commentLikes = app.findCollectionByNameOrId("comment_likes");
  app.delete(commentLikes);

  const comments = app.findCollectionByNameOrId("comments");
  comments.fields.removeByName("parent_id");
  return app.save(comments);
});
