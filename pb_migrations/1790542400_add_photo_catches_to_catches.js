/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const catches = app.findCollectionByNameOrId("catches");
  if (!catches.fields.getByName("photo_catches")) {
    catches.fields.add(new JSONField({ name: "photo_catches", maxSize: 100_000 }));
  }
  return app.save(catches);
}, (app) => {
  const catches = app.findCollectionByNameOrId("catches");
  catches.fields.removeByName("photo_catches");
  return app.save(catches);
});
