/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("water_bodies");
  if (!collection.fields.getByName("mapbox_id")) {
    collection.fields.add(new TextField({ name: "mapbox_id", max: 200 }));
  }
  collection.indexes = [
    ...collection.indexes.filter((index) => !index.includes("idx_water_bodies_mapbox_id")),
    "CREATE UNIQUE INDEX `idx_water_bodies_mapbox_id` ON `water_bodies` (`mapbox_id`) WHERE `mapbox_id` != ''",
  ];
  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("water_bodies");
  collection.indexes = collection.indexes.filter((index) => !index.includes("idx_water_bodies_mapbox_id"));
  collection.fields.removeByName("mapbox_id");
  return app.save(collection);
});
