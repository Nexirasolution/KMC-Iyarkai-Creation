import { connectDB } from "@/lib/mongodb";
import Order from "@/models/Order";
import MarketingContact from "@/models/MarketingContact";
import { normalizePhone } from "@/lib/phone";

/**
 * Unique customers from past (non-cancelled) orders.
 * consent = "optedIn" -> only customers who ticked the marketing checkbox at checkout
 * consent = "all"     -> every past customer (use only for people who bought from you)
 * Anyone marked "Do not message" is always excluded.
 */
export async function getAudience({ consent = "all" } = {}) {
  await connectDB();

  const rows = await Order.aggregate([
    { $match: { status: { $ne: "cancelled" } } },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: "$customer.phone",
        name: { $first: "$customer.name" },
        orders: { $sum: 1 },
        lastOrderAt: { $first: "$createdAt" },
        optIn: { $max: "$customer.marketingOptIn" },
      },
    },
  ]);

  const blocked = new Set(
    (await MarketingContact.find({ optedOut: true }, "phone").lean()).map((c) => c.phone)
  );

  const byPhone = new Map();
  for (const r of rows) {
    const phone = normalizePhone(r._id);
    if (!phone || blocked.has(phone)) continue;
    if (consent === "optedIn" && !r.optIn) continue;
    const existing = byPhone.get(phone);
    if (existing) {
      existing.orders += r.orders;
      continue;
    }
    byPhone.set(phone, { phone, name: r.name || "", orders: r.orders, lastOrderAt: r.lastOrderAt });
  }
  return [...byPhone.values()];
}