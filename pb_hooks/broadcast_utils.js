const MAX_KEY_LENGTH = 80;
const MAX_TITLE_LENGTH = 80;
const MAX_BODY_LENGTH = 500;

function cleanText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength + 1) : "";
}

function validateBroadcastPayload(value) {
  const payload = value && typeof value === "object" ? value : {};
  const key = cleanText(payload.key, MAX_KEY_LENGTH);
  const audience = cleanText(payload.audience, 10);
  const titleRu = cleanText(payload.title_ru, MAX_TITLE_LENGTH);
  const bodyRu = cleanText(payload.body_ru, MAX_BODY_LENGTH);
  const titleEn = cleanText(payload.title_en, MAX_TITLE_LENGTH);
  const bodyEn = cleanText(payload.body_en, MAX_BODY_LENGTH);

  if (!/^[a-z0-9][a-z0-9_-]{2,79}$/.test(key)) return { error: "invalid key" };
  if (audience !== "all" && audience !== "ru" && audience !== "en") return { error: "invalid audience" };
  if (payload.send !== true) return { error: "send must be true" };
  if (audience === "all" || audience === "ru") {
    if (!titleRu || !bodyRu) return { error: "missing Russian copy" };
    if (titleRu.length > MAX_TITLE_LENGTH) return { error: "Russian title is too long" };
    if (bodyRu.length > MAX_BODY_LENGTH) return { error: "Russian body is too long" };
  }
  if (audience === "all" || audience === "en") {
    if (!titleEn || !bodyEn) return { error: "missing English copy" };
    if (titleEn.length > MAX_TITLE_LENGTH) return { error: "English title is too long" };
    if (bodyEn.length > MAX_BODY_LENGTH) return { error: "English body is too long" };
  }

  return { value: { key, audience, titleRu, bodyRu, titleEn, bodyEn, send: true } };
}

module.exports = { validateBroadcastPayload };
