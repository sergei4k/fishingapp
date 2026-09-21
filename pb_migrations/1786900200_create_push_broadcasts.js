/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = new Collection({
    type: "base",
    name: "push_broadcasts",
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
  });

  collection.fields.add(new TextField({ name: "key", required: true, max: 80 }));
  collection.fields.add(new SelectField({ name: "audience", required: true, values: ["all", "ru", "en"], maxSelect: 1 }));
  collection.fields.add(new SelectField({ name: "status", required: true, values: ["sending", "sent", "failed"], maxSelect: 1 }));
  collection.fields.add(new TextField({ name: "title_ru", max: 80 }));
  collection.fields.add(new TextField({ name: "body_ru", max: 500 }));
  collection.fields.add(new TextField({ name: "title_en", max: 80 }));
  collection.fields.add(new TextField({ name: "body_en", max: 500 }));
  collection.fields.add(new NumberField({ name: "recipient_count" }));
  collection.fields.add(new NumberField({ name: "delivered_count" }));
  collection.fields.add(new NumberField({ name: "failed_count" }));
  collection.fields.add(new DateField({ name: "sent_at" }));
  collection.indexes = ["CREATE UNIQUE INDEX `idx_push_broadcasts_key` ON `push_broadcasts` (`key`)"];

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("push_broadcasts");
  return app.delete(collection);
});
