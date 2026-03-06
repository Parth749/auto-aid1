require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// IMPORTANT: uses mysql2/promise pool from config/db.js
const db = require("./config/db");

const app = express();
app.use(cors());
app.use(express.json());
const path = require("path");
app.use(express.static(path.join(__dirname, "public")));

/* ===============================
   AUTH + ROLE MIDDLEWARE
================================ */

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;

  if (!header) return res.status(401).json({ error: "Missing Authorization header" });

  const token = header.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Missing token" });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { userId, email, role }
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user?.role) return res.status(403).json({ error: "Role missing" });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Access denied" });
    }
    next();
  };
}

/* ===============================
   ROOT
================================ */

app.get("/", (req, res) => {
  res.send("✅ AutoAid backend running");
});

/* ===============================
   TEST DATABASE
================================ */

app.get("/api/test-db", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT 1 AS ok");
    res.json({ success: true, rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===============================
   REGISTER USER
   - By default role = user
   - For demo: you can pass role: "admin" or "mechanic"
================================ */

app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: "name, email and password are required" });
    }

    const safeRole =
      role && ["user", "admin", "mechanic"].includes(role) ? role : "user";

    const [existing] = await db.query("SELECT id FROM users WHERE email = ?", [email]);
    if (existing.length > 0) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await db.query(
      "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)",
      [name, email, hashedPassword, safeRole]
    );

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      userId: result.insertId,
      role: safeRole,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===============================
   LOGIN (returns token with role)
================================ */

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) return res.status(400).json({ error: "email and password required" });

    const [rows] = await db.query("SELECT * FROM users WHERE email = ?", [email]);
    if (rows.length === 0) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const user = rows[0];

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      success: true,
      token,
      role: user.role,
      name: user.name,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===============================
   GET CURRENT USER
================================ */

app.get("/api/me", authMiddleware, async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT id, name, email, role, created_at FROM users WHERE id = ?",
      [req.user.userId]
    );

    res.json({ success: true, user: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===============================
   USER: CREATE REQUEST (PROTECTED)
================================ */

app.post("/api/requests", authMiddleware, async (req, res) => {
  try {
   const { vehicle_no, issue, location, lat, lng } = req.body;

    if (!vehicle_no || !issue) {
      return res.status(400).json({ error: "vehicle_no and issue are required" });
    }

    const userId = req.user.userId;

    const [result] = await db.query(
      "INSERT INTO requests (user_id,vehicle_no,issue,location,lat,lng)VALUES (?,?,?,?,?,?)",
      [userId, vehicle_no, issue, location || null, lat || null, lng || null]
    );

    res.status(201).json({
      success: true,
      id: result.insertId,
      message: "Request created",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===============================
   USER: GET MY REQUESTS (PROTECTED)
================================ */

app.get("/api/my-requests", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;

    const [rows] = await db.query(
      "SELECT * FROM requests WHERE user_id = ? ORDER BY created_at DESC",
      [userId]
    );

    res.json({ success: true, requests: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===============================
   ADMIN: VIEW ALL REQUESTS
================================ */

app.get("/api/admin/requests", authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    const sql = `
      SELECT r.*,
             u.name AS user_name,
             u.email AS user_email,
             m.name AS mechanic_name,
             m.email AS mechanic_email
      FROM requests r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN users m ON r.mechanic_id = m.id
      ORDER BY r.created_at DESC
    `;

    const [rows] = await db.query(sql);
    res.json({ success: true, requests: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===============================
   ADMIN: GET MECHANICS LIST
================================ */

app.get("/api/admin/mechanics", authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT id, name, email, lat, lng FROM users WHERE role='mechanic' ORDER BY id DESC"
    );
    res.json({ success: true, mechanics: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===============================
   ADMIN: ASSIGN MECHANIC TO REQUEST
================================ */

app.patch(
  "/api/admin/requests/:id/assign",
  authMiddleware,
  requireRole("admin"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { mechanic_id } = req.body;

      if (!mechanic_id) return res.status(400).json({ error: "mechanic_id required" });

      const [mechRows] = await db.query(
        "SELECT id FROM users WHERE id=? AND role='mechanic'",
        [mechanic_id]
      );
      if (mechRows.length === 0) return res.status(404).json({ error: "Mechanic not found" });

      const [result] = await db.query(
        "UPDATE requests SET mechanic_id=? WHERE id=?",
        [mechanic_id, id]
      );

      res.json({ success: true, message: "Mechanic assigned", affected: result.affectedRows });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

/* ===============================
   MECHANIC: VIEW ASSIGNED REQUESTS
================================ */

app.get(
  "/api/mechanic/assigned",
  authMiddleware,
  requireRole("mechanic"),
  async (req, res) => {
    try {
      const mechanicId = req.user.userId;

      const [rows] = await db.query(
        "SELECT * FROM requests WHERE mechanic_id=? ORDER BY created_at DESC",
        [mechanicId]
      );

      res.json({ success: true, requests: rows });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

/* ===============================
   MECHANIC: UPDATE STATUS
================================ */

app.patch(
  "/api/mechanic/requests/:id/status",
  authMiddleware,
  requireRole("mechanic"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const allowed = ["open", "in_progress", "resolved"];
      if (!allowed.includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      // Optional safety: mechanic can update only their assigned request
      const mechanicId = req.user.userId;

      const [check] = await db.query(
        "SELECT id FROM requests WHERE id=? AND mechanic_id=?",
        [id, mechanicId]
      );
      if (check.length === 0) {
        return res.status(403).json({ error: "This request is not assigned to you" });
      }

      const [result] = await db.query("UPDATE requests SET status=? WHERE id=?", [status, id]);

      res.json({ success: true, message: "Status updated", affected: result.affectedRows });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);
/* =========================================================
   MECHANIC UBER-STYLE SYSTEM (GPS + Nearby + Accept)
   Paste ABOVE "START SERVER"
========================================================= */

// If you already have requireRole(...) in server.js, DO NOT paste this again.
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user?.role) return res.status(403).json({ error: "Role missing" });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: "Access denied" });
    next();
  };
}

// Ensure mechanics can update their live location (GPS)
app.post("/api/me/location", authMiddleware, async (req, res) => {
  try {
    const { lat, lng } = req.body;

    if (lat == null || lng == null) {
      return res.status(400).json({ error: "lat and lng required" });
    }

    await db.query("UPDATE users SET lat=?, lng=? WHERE id=?", [
      lat,
      lng,
      req.user.userId
    ]);

    res.json({ success: true, message: "Location updated" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper distance function (Haversine) in KM
function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (x) => (x * Math.PI) / 180;
  const R = 6371;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Mechanic sees OPEN requests (not accepted yet) + distance from mechanic
app.get(
  "/api/mechanic/open-requests",
  authMiddleware,
  requireRole("mechanic"),
  async (req, res) => {
    try {
      // Get mechanic GPS
      const [mechRows] = await db.query(
        "SELECT lat, lng FROM users WHERE id=?",
        [req.user.userId]
      );

      const mech = mechRows[0];

      // Get open requests that are not assigned
      const [reqRows] = await db.query(
        "SELECT * FROM requests WHERE status='open' AND mechanic_id IS NULL ORDER BY created_at DESC"
      );

      // Add distance
      const out = reqRows.map((r) => {
        let distance_km = null;

        if (mech?.lat && mech?.lng && r.lat && r.lng) {
          distance_km = haversineKm(
            Number(mech.lat),
            Number(mech.lng),
            Number(r.lat),
            Number(r.lng)
          );
        }

        return { ...r, distance_km };
      });

      // Sort nearest first (if distance exists)
      out.sort((a, b) => {
        if (a.distance_km == null && b.distance_km == null) return 0;
        if (a.distance_km == null) return 1;
        if (b.distance_km == null) return -1;
        return a.distance_km - b.distance_km;
      });

      res.json({ success: true, requests: out });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Mechanic ACCEPTS a request (first mechanic wins)
app.post(
  "/api/mechanic/requests/:id/accept",
  authMiddleware,
  requireRole("mechanic"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const mechanicId = req.user.userId;

      // Atomic update: only works if mechanic_id is still NULL and status is open
      const [result] = await db.query(
        "UPDATE requests SET mechanic_id=?, status='in_progress' WHERE id=? AND mechanic_id IS NULL AND status='open'",
        [mechanicId, id]
      );

      if (result.affectedRows === 0) {
        return res.status(409).json({
          error: "Request already accepted by another mechanic"
        });
      }

      res.json({ success: true, message: "Request accepted ✅" });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Mechanic sees MY accepted requests
app.get(
  "/api/mechanic/my",
  authMiddleware,
  requireRole("mechanic"),
  async (req, res) => {
    try {
      const mechanicId = req.user.userId;

      const [rows] = await db.query(
        "SELECT * FROM requests WHERE mechanic_id=? ORDER BY created_at DESC",
        [mechanicId]
      );

      res.json({ success: true, requests: rows });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);
/* ===============================
   START SERVER
================================ */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});