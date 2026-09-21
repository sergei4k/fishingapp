/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("user_onboarding_preferences");
  collection.fields.add(new SelectField({
    name: "referral_source",
    values: ["instagram", "app_store_feed", "play_store_feed", "vkontakte", "threads", "google_search", "yandex", "friend", "other"],
    maxSelect: 1,
  }));
  collection.fields.add(new TextField({ name: "referral_source_other", max: 120 }));
  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("user_onboarding_preferences");
  collection.fields.removeByName("referral_source");
  collection.fields.removeByName("referral_source_other");
  return app.save(collection);
});
