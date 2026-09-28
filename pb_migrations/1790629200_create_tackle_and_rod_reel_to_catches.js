/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  // Reusable rod and reel library. Rows are private to their owner so the catch
  // stores a name snapshot instead of a reference nobody else could resolve.
  const tackle = new Collection({
    type: "base",
    name: "tackle",
    system: false,
  });

  tackle.fields.add(new RelationField({
    name: "user_id",
    collectionId: "_pb_users_auth_",
    cascadeDelete: true,
    maxSelect: 1,
    required: true,
  }));
  tackle.fields.add(new SelectField({
    name: "kind",
    values: ["rod", "reel"],
    maxSelect: 1,
    required: true,
  }));
  tackle.fields.add(new TextField({ name: "name", required: true, max: 120 }));
  tackle.fields.add(new TextField({ name: "model", required: true, max: 120 }));
  tackle.fields.add(new TextField({ name: "manufacturer", required: true, max: 120 }));

  // Save the schema first so PocketBase can resolve user_id in the rules.
  app.save(tackle);

  tackle.indexes = [
    "CREATE INDEX `idx_tackle_user_kind` ON `tackle` (`user_id`, `kind`)",
  ];
  tackle.listRule = "user_id = @request.auth.id";
  tackle.viewRule = "user_id = @request.auth.id";
  tackle.createRule = '@request.auth.id != "" && @request.body.user_id = @request.auth.id';
  tackle.updateRule = 'user_id = @request.auth.id && @request.body.user_id = @request.auth.id';
  tackle.deleteRule = "user_id = @request.auth.id";

  app.save(tackle);

  const catches = app.findCollectionByNameOrId("catches");
  if (!catches.fields.getByName("rod")) {
    catches.fields.add(new TextField({ name: "rod", max: 120 }));
  }
  if (!catches.fields.getByName("reel")) {
    catches.fields.add(new TextField({ name: "reel", max: 120 }));
  }
  return app.save(catches);
}, (app) => {
  const catches = app.findCollectionByNameOrId("catches");
  catches.fields.removeByName("rod");
  catches.fields.removeByName("reel");
  app.save(catches);

  const tackle = app.findCollectionByNameOrId("tackle");
  return app.delete(tackle);
});
