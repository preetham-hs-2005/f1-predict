import { Router, Request, Response } from "express";
import { ObjectId } from "mongodb";
import { authMiddleware } from "../middleware/auth.js";
import { getDB } from "../utils/db.js";
import type { NotificationDocument } from "../services/reminders.js";

const router = Router();
router.use(authMiddleware);

router.get("/", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const collection = getDB().collection<NotificationDocument>("notifications");
    const [items, unreadCount] = await Promise.all([
      collection.find({ userId }).sort({ createdAt: -1 }).limit(50).toArray(),
      collection.countDocuments({ userId, readAt: { $exists: false } }),
    ]);
    return res.json({ success: true, items: items.map((item) => ({ id: item._id?.toString(), title: item.title, body: item.body, url: item.url, createdAt: item.createdAt, readAt: item.readAt })), unreadCount });
  } catch (error) {
    console.error("Notifications lookup failed:", error);
    return res.status(500).json({ success: false, error: "Notifications are unavailable" });
  }
});

router.patch("/:id/read", async (req: Request, res: Response) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ success: false, error: "Invalid notification" });
  try {
    const result = await getDB().collection<NotificationDocument>("notifications").updateOne(
      { _id: new ObjectId(req.params.id), userId: req.user!.userId },
      { $set: { readAt: new Date() } },
    );
    if (!result.matchedCount) return res.status(404).json({ success: false, error: "Notification not found" });
    return res.json({ success: true });
  } catch (error) {
    console.error("Notification update failed:", error);
    return res.status(500).json({ success: false, error: "Could not update notification" });
  }
});

export default router;
