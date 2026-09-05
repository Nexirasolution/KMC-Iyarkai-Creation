// lib/categoryTree.js
import Category from "@/models/Category";

// Returns [id, ...all descendant ids] for a given category id — use this
// wherever you query products by category so subcategory products show up too.
export async function getCategoryAndDescendantIds(categoryId) {
  const all = await Category.find({}).select("_id parent").lean();
  const byParent = {};
  for (const c of all) {
    const key = c.parent ? String(c.parent) : "root";
    if (!byParent[key]) byParent[key] = [];
    byParent[key].push(String(c._id));
  }

  const ids = [String(categoryId)];
  const stack = [String(categoryId)];
  while (stack.length) {
    const current = stack.pop();
    for (const childId of byParent[current] || []) {
      ids.push(childId);
      stack.push(childId);
    }
  }
  return ids;
}