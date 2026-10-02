// lib/tracking.js
// Builds the customer-facing tracking link from a courier's URL template.
// Template example: https://www.delhivery.com/track/package/{trackingNumber}
export function buildTrackingUrl(template, trackingNumber) {
  const num = String(trackingNumber || "").trim();
  if (!template || !num) return "";
  return template.includes("{trackingNumber}")
    ? template.replace(/\{trackingNumber\}/g, encodeURIComponent(num))
    : template;
}