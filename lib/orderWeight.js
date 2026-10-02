import Product from "@/models/Product";

// Returns a plain order object whose items each have a `weight` {value, unit}.
// Uses a weight saved on the order item if present (snapshot), otherwise
// looks it up from the current Product.
export async function attachWeights(order) {
  const obj = order.toObject ? order.toObject() : order;

  const ids = (obj.items || []).map((i) => i.product).filter(Boolean);
  const products = ids.length
    ? await Product.find({ _id: { $in: ids } })
        .select("weight")
        .lean()
    : [];
  const map = new Map(products.map((p) => [String(p._id), p.weight]));

  obj.items = (obj.items || []).map((i) => {
    const w = i.weight?.value ? i.weight : map.get(String(i.product));
    return {
      ...i,
      weight: w?.value ? { value: w.value, unit: w.unit || "g" } : { value: 0, unit: "g" },
    };
  });

  return obj;
}