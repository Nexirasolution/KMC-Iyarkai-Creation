import mongoose from "mongoose";

// One doc per day (e.g. _id: "260914"). $inc is atomic in MongoDB, so
// concurrent requests can never receive the same sequence number, unlike
// Order.countDocuments() which just counts existing docs and races.
const CounterSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // e.g. "260914"
  seq: { type: Number, default: 0 },
});

export default mongoose.models.Counter || mongoose.model("Counter", CounterSchema);