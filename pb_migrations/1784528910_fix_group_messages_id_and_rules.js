/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_4124649342")

  const idField = collection.fields.getByName("id")
  idField.autogeneratePattern = "[a-z0-9]{15}"
  idField.min = 15
  idField.max = 15

  collection.createRule = "@request.auth.id != \"\" && @request.body.user_id = @request.auth.id"
  collection.deleteRule = "@request.auth.id != \"\" && user_id = @request.auth.id"

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_4124649342")

  const idField = collection.fields.getByName("id")
  idField.autogeneratePattern = ""
  idField.min = 0
  idField.max = 0

  collection.createRule = "@request.auth.id != \"\""
  collection.deleteRule = "user_id = @request.auth.id"

  return app.save(collection)
})
