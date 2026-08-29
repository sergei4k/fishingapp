/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("mc12wcp3it4a2zf")

  // add field
  collection.fields.addAt(4, new Field({
    "hidden": false,
    "id": "bool1884061780",
    "name": "muted",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "bool"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("mc12wcp3it4a2zf")

  // remove field
  collection.fields.removeById("bool1884061780")

  return app.save(collection)
})
