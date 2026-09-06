function canPublishCatch(isPublic, image) {
  return !isPublic || String(image || "").trim().length > 0;
}

module.exports = { canPublishCatch };
