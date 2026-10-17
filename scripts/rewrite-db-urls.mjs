// Rewrites Cloudinary URLs / publicIds in MongoDB to the new R2 values,
// using migration-map.jsonl produced by migrate-cloudinary-to-r2.mjs.
// ASSUMES MongoDB. If you use something else, tell me and I'll adapt it.
//
// Usage:
//   node --env-file=.env.local scripts/rewrite-db-urls.mjs            (dry run)
//   node --env-file=.env.local scripts/rewrite-db-urls.mjs --apply
//
// Env: MONGODB_URI (and optional MONGODB_DB if not in the URI)
// BACK UP YOUR DATABASE FIRST.

import fs from "fs";
import { MongoClient } from "mongodb";

const APPLY = process.argv.includes("--apply");

const urlMap = new Map();
const idMap = new Map();
for (const line of fs.readFileSync("migration-map.jsonl", "utf8").split("\n")) {
  if (!line.trim()) continue;
  const r = JSON.parse(line);
  urlMap.set(r.old_url, r.new_url);
  idMap.set(r.public_id, r.key);
}
console.log(`Loaded ${urlMap.size} mappings.`);

let changedStrings = 0;

function rewrite(value) {
  if (typeof value === "string") {
    if (urlMap.has(value)) {
      changedStrings++;
      return urlMap.get(value);
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(rewrite);
  if (value && typeof value === "object" && value.constructor === Object) {
    const copy = {};
    for (const [k, v] of Object.entries(value)) copy[k] = rewrite(v);
    // media objects: { url, publicId, mediaType }
    if (typeof copy.publicId === "string" && idMap.has(copy.publicId)) {
      copy.publicId = idMap.get(copy.publicId);
      changedStrings++;
    }
    return copy;
  }
  return value; // ObjectId, Date, numbers, etc. untouched
}

const containsCloudinary = (v) => JSON.stringify(v ?? null).includes("res.cloudinary.com");

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db(process.env.MONGODB_DB || undefined);

let docsChanged = 0;
let leftover = 0;

for (const { name } of await db.listCollections().toArray()) {
  const col = db.collection(name);
  for await (const doc of col.find({})) {
    const updated = rewrite(doc);
    if (JSON.stringify(updated) !== JSON.stringify(doc)) {
      docsChanged++;
      if (APPLY) await col.replaceOne({ _id: doc._id }, updated);
    }
    if (containsCloudinary(updated)) {
      leftover++;
      console.warn(`  still references Cloudinary: ${name}/${doc._id}`);
    }
  }
}

console.log(
  `\n${APPLY ? "Updated" : "Would update"} ${docsChanged} documents (${changedStrings} values).`
);
if (leftover) console.log(`${leftover} documents still reference res.cloudinary.com (check above).`);
if (!APPLY) console.log("Dry run only. Re-run with --apply to write changes.");
await client.close();
