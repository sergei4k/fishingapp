/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("water_bodies");
  const field = collection.fields.getByName("water_type");
  field.values = ["lake", "pond", "reservoir", "river", "stream", "canal", "basin", "lagoon", "sea", "ocean", "bay", "sound", "gulf", "strait", "other"];
  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("water_bodies");
  const field = collection.fields.getByName("water_type");
  field.values = ["lake", "pond", "reservoir", "river", "stream", "canal", "basin", "lagoon", "other"];
  return app.save(collection);
});
