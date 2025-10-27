import { Router, Request, Response } from "express";

const router = Router();

/**
 * @swagger
 * /api/auth/verify:
 *   post:
 *     summary: Verify application password
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               password:
 *                 type: string
 *                 description: The application password
 *             required:
 *               - password
 *     responses:
 *       200:
 *         description: Password verification successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       401:
 *         description: Invalid password
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 */
router.post("/verify", (req: Request, res: Response) => {
  try {
    const { password } = req.body;
    
    if (!password) {
      return res.status(400).json({
        success: false,
        message: "Password is required"
      });
    }

    const appPassword = process.env.APP_PASSWORD;
    
    if (!appPassword) {
      return res.status(500).json({
        success: false,
        message: "Server configuration error"
      });
    }

    if (password === appPassword) {
      return res.json({
        success: true,
        message: "Authentication successful"
      });
    } else {
      return res.status(401).json({
        success: false,
        message: "Invalid password"
      });
    }
  } catch (error) {
    console.error("Auth verification error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
});

export default router;