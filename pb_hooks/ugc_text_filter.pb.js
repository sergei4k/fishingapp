/// <reference path="../pb_data/types.d.ts" />

// Enforce the same text safety rule at the PocketBase boundary. Client-side
// checks improve the user experience, but cannot protect against direct API
// requests or older app versions. Each handler imports its helper locally:
// PocketBase runs handlers in isolated runtimes.

onRecordCreateRequest((e) => {
  const u = require(`${__hooks}/group_chat_utils.js`);
  if (u.hasObjectionableText(u.recordOrBodyString(e, "text"))) throw new Error("objectionable content");
  e.next();
}, "comments");

onRecordUpdateRequest((e) => {
  const u = require(`${__hooks}/group_chat_utils.js`);
  if (u.hasObjectionableText(u.recordOrBodyString(e, "text"))) throw new Error("objectionable content");
  e.next();
}, "comments");

onRecordCreateRequest((e) => {
  const u = require(`${__hooks}/group_chat_utils.js`);
  const fields = ["description", "rod", "reel"];
  if (fields.some((key) => u.hasObjectionableText(u.recordOrBodyString(e, key)))) throw new Error("objectionable content");
  e.next();
}, "catches");

onRecordUpdateRequest((e) => {
  const u = require(`${__hooks}/group_chat_utils.js`);
  const fields = ["description", "rod", "reel"];
  if (fields.some((key) => u.hasObjectionableText(u.recordOrBodyString(e, key)))) throw new Error("objectionable content");
  e.next();
}, "catches");

// Reusable rod and reel rows, and the name snapshots stored on a catch.
onRecordCreateRequest((e) => {
  const u = require(`${__hooks}/group_chat_utils.js`);
  const fields = ["name", "model", "manufacturer"];
  if (fields.some((key) => u.hasObjectionableText(u.recordOrBodyString(e, key)))) throw new Error("objectionable content");
  e.next();
}, "tackle");

onRecordUpdateRequest((e) => {
  const u = require(`${__hooks}/group_chat_utils.js`);
  const fields = ["name", "model", "manufacturer"];
  if (fields.some((key) => u.hasObjectionableText(u.recordOrBodyString(e, key)))) throw new Error("objectionable content");
  e.next();
}, "tackle");

onRecordCreateRequest((e) => {
  const u = require(`${__hooks}/group_chat_utils.js`);
  if (u.hasObjectionableText(u.recordOrBodyString(e, "name")) || u.hasObjectionableText(u.recordOrBodyString(e, "description"))) throw new Error("objectionable content");
  e.next();
}, "groups");

onRecordUpdateRequest((e) => {
  const u = require(`${__hooks}/group_chat_utils.js`);
  if (u.hasObjectionableText(u.recordOrBodyString(e, "name")) || u.hasObjectionableText(u.recordOrBodyString(e, "description"))) throw new Error("objectionable content");
  e.next();
}, "groups");
