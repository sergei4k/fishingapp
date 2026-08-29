/// <reference path="../pb_data/types.d.ts" />

// Native "Sign in with Apple" endpoint.
//
// The iOS app uses expo-apple-authentication to get an authorizationCode on
// device, then POSTs it here. We exchange that code with Apple SERVER-SIDE
// (authenticated with our client secret). A successful exchange proves the
// code is genuine, so we can trust the returned id_token's claims without
// verifying its RS256 signature ourselves (PocketBase's JS engine can't do
// RSA/JWKS verification). We then find-or-create the users record and return
// a standard PocketBase auth response ({ token, record }).
//
// Setup on the PocketBase server (env vars):
//   APPLE_CLIENT_ID      -> the bundle id, e.g. com.strikefeed.myapp
//   APPLE_CLIENT_SECRET  -> the client-secret JWT (ES256, signed with the .p8).
//                           Expires (~6 months) — regenerate and update before
//                           it lapses.
//
// Endpoint: POST https://strikefeed.tech/apple-signin
//   body: { "code": "<authorizationCode>", "fullName": "Jane Doe" | null }

routerAdd("POST", "/apple-signin", (e) => {
  const clientId = ($os.getenv("APPLE_CLIENT_ID") || "com.strikefeed.myapp").trim();
  const clientSecret = ($os.getenv("APPLE_CLIENT_SECRET") || "").trim();
  if (!clientSecret) {
    console.log("[apple-signin] APPLE_CLIENT_SECRET not set — cannot verify");
    return e.json(503, { error: "apple_not_configured" });
  }

  let info;
  try {
    info = e.requestInfo();
  } catch (err) {
    console.log("[apple-signin] failed to read request:", err);
    return e.json(400, { error: "bad_request" });
  }

  const code = (info.body && info.body.code) || "";
  const fullName = (info.body && info.body.fullName) || "";
  if (!code) {
    return e.json(400, { error: "missing_code" });
  }

  // 1. Exchange the authorization code with Apple. Native flows do NOT send a
  //    redirect_uri, so we intentionally omit it (sending one causes
  //    invalid_grant for native app clients).
  const form =
    "grant_type=authorization_code" +
    "&code=" + encodeURIComponent(code) +
    "&client_id=" + encodeURIComponent(clientId) +
    "&client_secret=" + encodeURIComponent(clientSecret);


  let res;
  try {
    res = $http.send({
      url: "https://appleid.apple.com/auth/token",
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
      timeout: 20,
    });
  } catch (err) {
    console.log("[apple-signin] Apple token endpoint unreachable:", err);
    return e.json(502, { error: "apple_unreachable" });
  }

  if (res.statusCode !== 200) {
    console.log("[apple-signin] token exchange failed:", res.statusCode, res.raw);
    return e.json(401, { error: "apple_rejected" });
  }

  const idToken = res.json && res.json.id_token;
  if (!idToken) {
    console.log("[apple-signin] no id_token in Apple response");
    return e.json(401, { error: "no_id_token" });
  }

  // 2. Decode the id_token claims. Authenticity is already established by the
  //    successful exchange above, so an unverified decode is sufficient here.
  let claims;
  try {
    claims = $security.parseUnverifiedJWT(idToken);
  } catch (err) {
    console.log("[apple-signin] failed to parse id_token:", err);
    return e.json(401, { error: "bad_id_token" });
  }

  if (claims.iss !== "https://appleid.apple.com" || claims.aud !== clientId) {
    console.log("[apple-signin] claim mismatch", claims.iss, claims.aud);
    return e.json(401, { error: "claim_mismatch" });
  }

  const appleSub = claims.sub || "";
  const email = (claims.email || "").toLowerCase();
  if (!appleSub) {
    return e.json(401, { error: "no_sub" });
  }

  // 3. Find-or-create the users record. Apple returns the same (possibly
  //    private-relay) email for a given user on every sign-in, so email is a
  //    stable link key with the existing schema.
  const collection = e.app.findCollectionByNameOrId("users");
  let record = null;

  if (email) {
    try {
      record = e.app.findAuthRecordByEmail("users", email);
    } catch {
      record = null;
    }
  }

  if (!record) {
    if (!email) {
      // No email and no existing account to link to — nothing we can key on.
      return e.json(422, { error: "no_email" });
    }
    record = new Record(collection);
    record.set("email", email);
    record.set("emailVisibility", false);
    record.setPassword($security.randomString(40)); // required; unused (OAuth login)
    record.setVerified(true);
    record.set("onboarding_pending", true);
    if (fullName) record.set("name", fullName);
    try {
      e.app.save(record);
    } catch (err) {
      console.log("[apple-signin] failed to create user:", err);
      return e.json(500, { error: "create_failed" });
    }
    console.log("[apple-signin] created user for", email);
  } else if (fullName && !record.getString("name")) {
    // Backfill name on first Apple sign-in for a pre-existing account.
    record.set("name", fullName);
    try { e.app.save(record); } catch (_) {}
  }

  // 4. Issue a standard PocketBase auth response ({ token, record }).
  return $apis.recordAuthResponse(e, record, "apple", null);
});
