import { Router } from "express";
import authRouter from "./auth";
import sharedRouter from "./shared";
import roomsRouter from "./rooms";

const router = Router();

router.get("/", (_, res) => {
  res.json({
    message: "Hello from the server!",
  });
});

router.use("/auth", authRouter);
router.use("/shared", sharedRouter);
router.use("/rooms", roomsRouter);

export default router;
