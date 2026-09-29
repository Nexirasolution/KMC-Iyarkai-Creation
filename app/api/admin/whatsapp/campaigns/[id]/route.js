import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import Campaign from "@/models/Campaign";
import MarketingContact from "@/models/MarketingContact";

export async function GET(req, { params }) {
  try {
    await connectDB();
    const { id } = await params;
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    }
    const campaign = await Campaign.findById(id).lean();
    if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    return NextResponse.json({ campaign });
  } catch (err) {
    console.error("Campaign fetch error:", err);
    return NextResponse.json({ error: "Failed to load campaign." }, { status: 500 });
  }
}

// PATCH: { phone, status: "pending" | "sent" | "skipped" }
//        { phone, doNotMessage: true }  -> also blocks this number from all future campaigns
export async function PATCH(req, { params }) {
  try {
    await connectDB();
    const { id } = await params;
    const body = await req.json();
    const { phone, doNotMessage } = body;
    let status = body.status;

    if (!mongoose.isValidObjectId(id) || !phone) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    if (doNotMessage) {
      await MarketingContact.updateOne(
        { phone },
        { $set: { optedOut: true, optedOutAt: new Date() } },
        { upsert: true }
      );
      status = "skipped";
    }

    if (!["pending", "sent", "skipped"].includes(status)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }

    const campaign = await Campaign.findOneAndUpdate(
      { _id: id, "recipients.phone": phone },
      {
        $set: {
          "recipients.$.status": status,
          "recipients.$.sentAt": status === "sent" ? new Date() : null,
        },
      },
      { new: true }
    ).lean();

    if (!campaign) return NextResponse.json({ error: "Recipient not found." }, { status: 404 });
    return NextResponse.json({ campaign });
  } catch (err) {
    console.error("Campaign update error:", err);
    return NextResponse.json({ error: "Failed to update campaign." }, { status: 500 });
  }
}