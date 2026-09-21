// Keep the official StrikeFeed account in every new user's following list.
// This runs at the PocketBase boundary so all signup methods get the same behavior.

onRecordAfterCreateSuccess((e) => {
  try {
    const newUser = e.record;
    const mainUsername = ($os.getenv("STRIKEFEED_MAIN_USERNAME") || "StrikeFeed").trim();
    const mainAccount = e.app.findRecordByFilter(
      "users",
      "username = {:username}",
      { username: mainUsername },
    );

    // The official account must never follow itself if it is recreated.
    if (newUser.id !== mainAccount.id) {
      const existingFollow = e.app.findRecordsByFilter(
        "follows",
        "follower_id = {:followerId} && following_id = {:followingId}",
        "",
        1,
        0,
        { followerId: newUser.id, followingId: mainAccount.id },
      );

      if (existingFollow.length === 0) {
        const follows = e.app.findCollectionByNameOrId("follows");
        const follow = new Record(follows);
        follow.set("follower_id", newUser.id);
        follow.set("following_id", mainAccount.id);
        e.app.save(follow);
      }
    }
  } catch (err) {
    // A missing/misconfigured main account must not block signup.
    console.log("auto-follow main account error:", err);
  }
  e.next();
}, "users");
