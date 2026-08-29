/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const users = app.findCollectionByNameOrId("_pb_users_auth_");
  users.fields.add(new BoolField({
    name: "onboarding_pending",
    required: false,
  }));
  app.save(users);

  const collection = new Collection({
    id: "pbc_3482107659",
    name: "user_onboarding_preferences",
    type: "base",
    system: false,
  });

  // PocketBase 0.28 requires fields to be added through the FieldsList API.
  collection.fields.add(new RelationField({
    name: "user_id",
    collectionId: "_pb_users_auth_",
    cascadeDelete: true,
    maxSelect: 1,
    required: true,
  }));
  collection.fields.add(new SelectField({
    name: "primary_goal",
    values: ["log_catches", "discover_spots", "follow_anglers", "plan_trips"],
    maxSelect: 1,
    required: true,
  }));
  collection.fields.add(new JSONField({
    name: "fishing_styles",
    maxSize: 2000,
    required: true,
  }));
  collection.fields.add(new SelectField({
    name: "preferred_start_tab",
    values: ["index", "social", "add", "weather"],
    maxSelect: 1,
    required: true,
  }));
  collection.fields.add(new TextField({ name: "location_city", max: 80 }));
  collection.fields.add(new TextField({ name: "location_region", max: 120 }));
  collection.fields.add(new TextField({ name: "location_country", max: 120 }));
  collection.fields.add(new NumberField({ name: "location_longitude", min: -180, max: 180 }));
  collection.fields.add(new NumberField({ name: "location_latitude", min: -90, max: 90 }));
  collection.fields.add(new SelectField({
    name: "language",
    values: ["ru", "en"],
    maxSelect: 1,
    required: true,
  }));

  // Save the schema first so PocketBase can resolve user_id in the rules.
  app.save(collection);
  collection.indexes = [
    "CREATE UNIQUE INDEX `idx_onboarding_preferences_user` ON `user_onboarding_preferences` (`user_id`)",
  ];
  collection.createRule = '@request.auth.id != "" && user_id = @request.auth.id';
  collection.listRule = "user_id = @request.auth.id";
  collection.viewRule = "user_id = @request.auth.id";
  collection.updateRule = "user_id = @request.auth.id && @request.body.user_id = @request.auth.id";
  collection.deleteRule = "user_id = @request.auth.id";

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_3482107659");
  app.delete(collection);

  const users = app.findCollectionByNameOrId("_pb_users_auth_");
  users.fields.removeByName("onboarding_pending");
  return app.save(users);
});
