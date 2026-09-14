import Counter from "@/models/Counter";

export async function generateOrderNumber() {
  const prefix = "KMC";
  const date = new Date();
  const datePart = `${date.getFullYear().toString().slice(-2)}${(date.getMonth() + 1)
    .toString()
    .padStart(2, "0")}${date.getDate().toString().padStart(2, "0")}`;

  // Atomic increment — MongoDB guarantees no two callers ever receive the
  // same seq value, even if they call this in the same millisecond.
  // upsert creates the counter doc on the first order of each new day.
  const counter = await Counter.findOneAndUpdate(
    { _id: datePart },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  const seq = counter.seq.toString().padStart(4, "0");
  return `${prefix}-${datePart}-${seq}`;
}