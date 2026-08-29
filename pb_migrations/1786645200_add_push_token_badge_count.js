/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2199035174");
  collection.fields.add(new NumberField({
    name: "badge_count",
    min: 0,
    max: 99,
    onlyInt: true,
  }));

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2199035174");
  collection.fields.removeByName("badge_count");

  return app.save(collection);
});
