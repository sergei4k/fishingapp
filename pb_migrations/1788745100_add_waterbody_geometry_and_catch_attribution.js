/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const waterBodies = app.findCollectionByNameOrId("water_bodies");
  if (!waterBodies.fields.getByName("geometry")) {
    waterBodies.fields.add(new JSONField({ name: "geometry", maxSize: 5_000_000 }));
  }
  app.save(waterBodies);

  const catches = app.findCollectionByNameOrId("catches");
  if (!catches.fields.getByName("water_body_id")) {
    catches.fields.add(new TextField({ name: "water_body_id", max: 40 }));
  }
  if (!catches.fields.getByName("water_body_name")) {
    catches.fields.add(new TextField({ name: "water_body_name", max: 200 }));
  }
  return app.save(catches);
}, (app) => {
  const catches = app.findCollectionByNameOrId("catches");
  catches.fields.removeByName("water_body_id");
  catches.fields.removeByName("water_body_name");
  app.save(catches);

  const waterBodies = app.findCollectionByNameOrId("water_bodies");
  waterBodies.fields.removeByName("geometry");
  return app.save(waterBodies);
});
