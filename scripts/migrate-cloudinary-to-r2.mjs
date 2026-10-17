// Copies every image/video from Cloudinary into R2, keeping the same path.
//   Cloudinary: kmc-products/abc123  (format jpg)  ->  R2 key: kmc-products/abc123.jpg
//
// Usage:
//   node --env-file=.env.local scripts/migrate-cloudinary-to-r2.mjs --dry
//   node --env-file=.env.local scripts/migrate-cloudinary-to-r2.mjs
//   node --env-file=.env.local scripts/migrate-cloudinary-to-r2.mjs --prefix=kmc-products
//
// Safe to re-run: objects already in R2 are skipped.
// Output: migration-map.jsonl (one line per asset, used by rewrite-db-urls.mjs)

import fs from "fs";
import { Readable } from "stream";
import { v2 as cloudinary } from "cloudinary";
import { S3Client, HeadObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

const DRY = process.argv.includes("--dry");
const PREFIX = (process.argv.find((a) => a.startsWith("--prefix=")) || "").split("=")[1];
const CONCURRENCY = 4;
const MAP_FILE = "migration-map.jsonl";
const PUBLIC_URL = process.env.R2_PUBLIC_URL.replace(/\/$/, "");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

async function listAll(resourceType) {
  const all = [];
  let next_cursor;
  do {
    const res = await cloudinary.api.resources({
      resource_type: resourceType,
      type: "upload",
      max_results: 500,
      next_cursor,
      ...(PREFIX && { prefix: PREFIX }),
    });
    all.push(...res.resources.map((r) => ({ ...r, resource_type: resourceType })));
    next_cursor = res.next_cursor;
    console.log(`  listed ${all.length} ${resourceType}s...`);
  } while (next_cursor);
  return all;
}

async function exists(key) {
  try {
    await r2.send(new HeadObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key }));
    return true;
  } catch (e) {
    if (e.$metadata?.httpStatusCode === 404 || e.name === "NotFound") return false;
    throw e;
  }
}

const keyFor = (a) => (a.format ? `${a.public_id}.${a.format}` : a.public_id);
const urlFor = (key) => `${PUBLIC_URL}/${key.split("/").map(encodeURIComponent).join("/")}`;

async function migrateOne(asset, out, stats) {
  const key = keyFor(asset);
  const record = {
    resource_type: asset.resource_type,
    public_id: asset.public_id,
    key,
    old_url: asset.secure_url,
    new_url: urlFor(key),
    bytes: asset.bytes,
  };

  try {
    if (await exists(key)) {
      stats.skipped++;
    } else if (DRY) {
      stats.pending++;
    } else {
      const res = await fetch(asset.secure_url);
      if (!res.ok || !res.body) throw new Error(`download failed: HTTP ${res.status}`);

      await new Upload({
        client: r2,
        params: {
          Bucket: process.env.R2_BUCKET,
          Key: key,
          Body: Readable.fromWeb(res.body),
          ContentType: res.headers.get("content-type") || undefined,
          CacheControl: "public, max-age=31536000, immutable",
        },
        queueSize: 3,
        partSize: 10 * 1024 * 1024,
      }).done();

      stats.copied++;
      console.log(`  copied  ${key}`);
    }
    if (!DRY) out.write(JSON.stringify(record) + "\n");
  } catch (err) {
    stats.failed++;
    stats.failures.push({ key, error: err.message });
    console.error(`  FAILED  ${key}: ${err.message}`);
  }
}

async function main() {
  console.log(DRY ? "DRY RUN (nothing will be copied)" : "Migrating...");
  const assets = [...(await listAll("image")), ...(await listAll("video"))];
  console.log(`Found ${assets.length} assets in Cloudinary.`);

  const out = DRY ? null : fs.createWriteStream(MAP_FILE, { flags: "a" });
  const stats = { copied: 0, skipped: 0, pending: 0, failed: 0, failures: [] };

  const queue = [...assets];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length) await migrateOne(queue.shift(), out, stats);
    })
  );
  out?.end();

  console.log("\nDone.", { ...stats, failures: undefined });
  if (stats.failures.length) {
    fs.writeFileSync("migration-failures.json", JSON.stringify(stats.failures, null, 2));
    console.log("Failures written to migration-failures.json (just re-run to retry).");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
