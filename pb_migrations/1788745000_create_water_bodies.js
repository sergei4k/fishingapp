/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = new Collection({
    type: "base",
    name: "water_bodies",
    listRule: "",
    viewRule: "",
    createRule: null,
    updateRule: null,
    deleteRule: null,
  });

  collection.fields.add(new TextField({ name: "osm_id", required: true, max: 40 }));
  collection.fields.add(new TextField({ name: "name", max: 200 }));
  collection.fields.add(new SelectField({
    name: "water_type",
    required: true,
    values: ["lake", "pond", "reservoir", "river", "stream", "canal", "other"],
    maxSelect: 1,
  }));
  collection.fields.add(new NumberField({ name: "lat", required: true }));
  collection.fields.add(new NumberField({ name: "lon", required: true }));
  collection.fields.add(new TextField({ name: "region", required: true, max: 60 }));
  collection.fields.add(new TextField({ name: "source", required: true, max: 30 }));
  collection.indexes = [
    "CREATE UNIQUE INDEX `idx_water_bodies_osm_id` ON `water_bodies` (`osm_id`)",
    "CREATE INDEX `idx_water_bodies_region_lat_lon` ON `water_bodies` (`region`, `lat`, `lon`)",
  ];

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("water_bodies");
  return app.delete(collection);
});
