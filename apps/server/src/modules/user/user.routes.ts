import { Router } from "express";

export const userRouter = Router();

userRouter.get("/status", (_req, res) => {
  res.status(501).json({
    module: "user",
    status: "not_implemented",
  });
});
