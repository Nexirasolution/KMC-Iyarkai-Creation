import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Order from "@/models/Order";
import Product from "@/models/Product";
import { getRazorpay } from "@/lib/razorpay";

export async function GET(req, { params }) {
  try {
    await connectDB();
    const { id } = await params;
    const order = await Order.findById(id);
    if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    return NextResponse.json({ order });
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch order." }, { status: 500 });
  }
}

export async function PUT(req, { params }) {
  try {
    await connectDB();
    const { id } = await params;
    const body = await req.json();

    const order = await Order.findById(id);
    if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });

    if (body.status && body.status !== order.status) {
      if (body.status === "cancelled" && order.status !== "cancelled") {
        const reason = body.cancellation?.reason?.trim();
        if (!reason) {
          return NextResponse.json(
            { error: "A cancellation reason is required." },
            { status: 400 }
          );
        }

        // Restock items on cancellation
        for (const item of order.items) {
          if (item.product) {
            await Product.findByIdAndUpdate(item.product, { $inc: { stock: item.quantity } });
          }
        }

        order.cancellation = {
          reason,
          cancelledAt: new Date(),
          cancelledBy: "admin",
        };
      }

      order.status = body.status;
      order.statusHistory.push({
        status: body.status,
        note: body.status === "cancelled" ? order.cancellation.reason : body.note || "",
      });
    }

    if (body.tracking) {
      const { courier = "", trackingNumber = "", trackingUrl = "" } = body.tracking;
      order.tracking = {
        courier: courier.trim(),
        trackingNumber: trackingNumber.trim(),
        trackingUrl: trackingUrl.trim(),
        updatedAt: new Date(),
      };
    }

    if (body.refund) {
      const amount = Number(body.refund.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return NextResponse.json({ error: "Enter a valid refund amount." }, { status: 400 });
      }
      if (amount > order.total) {
        return NextResponse.json(
          { error: "Refund amount cannot exceed the order total." },
          { status: 400 }
        );
      }

      const isOnlinePayment =
        order.paymentMethod === "Online" &&
        order.paymentStatus === "paid" &&
        order.razorpay?.paymentId;

      if (isOnlinePayment) {
        try {
          const razorpay = getRazorpay();
          const refund = await razorpay.payments.refund(order.razorpay.paymentId, {
            amount: Math.round(amount * 100), // Razorpay expects paise
            speed: "normal",
            notes: {
              orderNumber: order.orderNumber,
              reason: body.refund.note || "Order cancelled",
            },
          });

          order.refund = {
            amount,
            status: "refunded",
            method: "Razorpay",
            note: body.refund.note || "",
            razorpayRefundId: refund.id,
            refundedAt: new Date(),
          };
        } catch (refundErr) {
          console.error("Razorpay refund failed:", refundErr);
          order.refund = {
            amount,
            status: "failed",
            method: "Razorpay",
            note: refundErr?.error?.description || refundErr.message || "Refund failed",
            refundedAt: null,
          };
          await order.save();
          return NextResponse.json(
            {
              error:
                refundErr?.error?.description ||
                "Razorpay refund failed. The order has been marked as 'failed' — please check your Razorpay dashboard.",
            },
            { status: 502 }
          );
        }
      } else {
        order.refund = {
          amount,
          status: "refunded",
          method: body.refund.method || "Manual / Offline",
          note: body.refund.note || "",
          refundedAt: new Date(),
        };
      }
    }

    if (body.paymentStatus) order.paymentStatus = body.paymentStatus;
    if (body.notes !== undefined) order.notes = body.notes;

    await order.save();
    return NextResponse.json({ order });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to update order." }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  try {
    await connectDB();
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    // Pass ?restock=true to add the order's items back to stock before
    // deleting — useful if the order is being deleted without ever having
    // gone through "cancelled" (which already restocks on its own). This
    // is opt-in rather than automatic, since restocking an order that was
    // already cancelled (or already shipped/delivered) would double-count
    // or misrepresent real inventory.
    const shouldRestock = searchParams.get("restock") === "true";

    const order = await Order.findById(id);
    if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });

    if (shouldRestock && order.status !== "cancelled") {
      for (const item of order.items) {
        if (item.product) {
          await Product.findByIdAndUpdate(item.product, { $inc: { stock: item.quantity } });
        }
      }
    }

    await Order.findByIdAndDelete(id);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to delete order." }, { status: 500 });
  }
}