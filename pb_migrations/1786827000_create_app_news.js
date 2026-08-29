/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const publishedRule = 'status = "published" && publish_at <= @now && (expires_at = "" || expires_at > @now)';
  const collection = new Collection({
    type: "base",
    name: "app_news",
    listRule: publishedRule,
    viewRule: publishedRule,
    createRule: null,
    updateRule: null,
    deleteRule: null,
  });

  collection.fields.add(new SelectField({
    name: "status",
    values: ["draft", "published", "archived"],
    maxSelect: 1,
    required: true,
  }));
  collection.fields.add(new SelectField({
    name: "content_type",
    values: ["update", "promotion", "announcement"],
    maxSelect: 1,
    required: true,
  }));
  collection.fields.add(new TextField({ name: "title_en", max: 160, required: true }));
  collection.fields.add(new TextField({ name: "title_ru", max: 160 }));
  collection.fields.add(new TextField({ name: "body_en", max: 12000, required: true }));
  collection.fields.add(new TextField({ name: "body_ru", max: 12000 }));
  collection.fields.add(new FileField({
    name: "cover",
    maxSelect: 1,
    maxSize: 5242880,
    mimeTypes: ["image/jpeg", "image/png", "image/webp"],
    thumbs: ["1200x800"],
  }));
  collection.fields.add(new TextField({ name: "cta_label_en", max: 80 }));
  collection.fields.add(new TextField({ name: "cta_label_ru", max: 80 }));
  collection.fields.add(new URLField({ name: "cta_url" }));
  collection.fields.add(new DateField({ name: "publish_at", required: true }));
  collection.fields.add(new DateField({ name: "expires_at" }));
  collection.indexes = [
    "CREATE INDEX `idx_app_news_publish_at` ON `app_news` (`publish_at`)",
    "CREATE INDEX `idx_app_news_status_publish_at` ON `app_news` (`status`, `publish_at`)",
  ];

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("app_news");
  return app.delete(collection);
});
