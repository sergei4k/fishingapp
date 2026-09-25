/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("water_bodies");
  for (const name of ["min_lat", "max_lat", "min_lon", "max_lon"]) {
    if (!collection.fields.getByName(name)) {
      collection.fields.add(new NumberField({ name }));
    }
  }
  collection.indexes = [
    ...collection.indexes.filter((index) => !index.includes("idx_water_bodies_bounds")),
    "CREATE INDEX `idx_water_bodies_bounds` ON `water_bodies` (`min_lat`, `max_lat`, `min_lon`, `max_lon`)",
  ];
  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("water_bodies");
  collection.indexes = collection.indexes.filter((index) => !index.includes("idx_water_bodies_bounds"));
  for (const name of ["min_lat", "max_lat", "min_lon", "max_lon"]) {
    collection.fields.removeByName(name);
  }
  return app.save(collection);
});
