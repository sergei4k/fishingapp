/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("_pb_users_auth_")

  collection.fields.addAt(1, new Field({
    "hidden": false,
    "id": "file2398457016",
    "maxSelect": 1,
    "maxSize": 5242880,
    "mimeTypes": [
      "image/jpeg",
      "image/png",
      "image/webp"
    ],
    "name": "banner",
    "presentable": false,
    "protected": false,
    "required": false,
    "system": false,
    "thumbnail": "1200x400",
    "type": "file"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("_pb_users_auth_")

  collection.fields.removeById("file2398457016")

  return app.save(collection)
})