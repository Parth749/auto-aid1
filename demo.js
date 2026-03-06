const DEMO_KEY = "AUTOAID_DEMO_DB";
const SEED = {
  users: [
    { id: 1, name: "Admin", email: "admin@test.com", password: "123456", role: "admin", lat: 22.7777, lng: 73.6143 },
    { id: 2, name: "Mechanic 1", email: "mechanic@test.com", password: "123456", role: "mechanic", lat: 22.7800, lng: 73.6200 }
  ],
  requests: []
};

function loadDB() {
  const raw = localStorage.getItem(DEMO_KEY);
  if (!raw) {
    localStorage.setItem(DEMO_KEY, JSON.stringify(SEED));
    return structuredClone(SEED);
  }
  return JSON.parse(raw);
}

function saveDB(db) {
  localStorage.setItem(DEMO_KEY, JSON.stringify(db));
}

function setSession(user) {
  localStorage.setItem("token", "demo-token");
  localStorage.setItem("demoUserId", String(user.id));
}

function getSessionUser() {
  const uid = Number(localStorage.getItem("demoUserId") || 0);
  if (!uid) return null;
  const db = loadDB();
  return db.users.find(u => u.id === uid) || null;
}

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("demoUserId");
  window.location.href = "./index.html";
}

function $(id){ return document.getElementById(id); }

function toast(text, ok = true) {
  const el = document.getElementById("toast");
  if (!el) return alert(text);
  el.className = "toast show " + (ok ? "ok" : "err");
  el.textContent = text;
  setTimeout(() => el.classList.remove("show"), 2500);
}


function getUserLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  });
}



async function registerUser() {
  const name = $("r_name")?.value?.trim();
  const email = $("r_email")?.value?.trim();
  const password = $("r_password")?.value?.trim();

  if (!name || !email || !password) return toast("Please fill all fields.", false);

  const db = loadDB();
  if (db.users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
    return toast("Email already registered.", false);
  }

  const newUser = {
    id: Date.now(),
    name,
    email,
    password,
    role: "user",
    lat: null,
    lng: null
  };
  db.users.push(newUser);
  saveDB(db);

  toast("Registered ✅ Now login.", true);
}

async function loginUser() {
  const email = $("l_email")?.value?.trim();
  const password = $("l_password")?.value?.trim();

  if (!email || !password) return toast("Enter email and password.", false);

  const db = loadDB();
  const user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());

  if (!user || user.password !== password) {
    return toast("Invalid email or password.", false);
  }

  setSession(user);
  toast("Login success ✅", true);

  
  if (user.role === "admin") window.location.href = "./admin.html";
  else if (user.role === "mechanic") window.location.href = "./mechanic.html";
  else window.location.href = "./dashboard.html";
}


async function loadMe(targetId="userInfo") {
  const u = getSessionUser();
  if (!u) { logout(); return null; }
  const el = $(targetId);
  if (el) {
    el.innerHTML = `<small>Logged in as <b>${u.name}</b> (${u.email}) • Role: <b>${u.role}</b></small>`;
  }
  return u;
}


function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (x) => (x * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat/2)**2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

async function initDashboard() {
  const u = await loadMe("userInfo");
  if (!u) return;
  if (u.role !== "user") {
    // If admin/mechanic opened dashboard
    if (u.role === "admin") return (window.location.href="./admin.html");
    if (u.role === "mechanic") return (window.location.href="./mechanic.html");
  }
  await loadMyRequests();
}

async function createRequest() {
  const u = getSessionUser();
  if (!u) return logout();

  const vehicle_no = $("vehicle_no")?.value?.trim();
  const issue = $("issue")?.value?.trim();
  const location = $("location")?.value?.trim();

  if (!vehicle_no || !issue) return toast("Vehicle No and Issue required.", false);

  const coords = await getUserLocation(); // optional
  const db = loadDB();

  const req = {
    id: Date.now(),
    user_id: u.id,
    vehicle_no,
    issue,
    location: location || "",
    status: "open",
    created_at: new Date().toISOString(),
    mechanic_id: null,
    lat: coords?.lat ?? null,
    lng: coords?.lng ?? null
  };

  db.requests.unshift(req);
  saveDB(db);

  $("vehicle_no").value = "";
  $("issue").value = "";
  $("location").value = "";
  toast("Request created ✅", true);
  await loadMyRequests();
}

async function loadMyRequests() {
  const u = getSessionUser();
  if (!u) return logout();

  const body = $("reqBody");
  if (!body) return;

  const db = loadDB();
  const rows = db.requests.filter(r => r.user_id === u.id);

  if (rows.length === 0) {
    body.innerHTML = "<tr><td colspan='6'>No requests found</td></tr>";
    return;
  }

  body.innerHTML = rows.map(r => `
    <tr>
      <td>${r.id}</td>
      <td>${r.vehicle_no}</td>
      <td>${r.issue}</td>
      <td>${r.location || ""}</td>
      <td>${r.status}</td>
      <td>${new Date(r.created_at).toLocaleString()}</td>
    </tr>
  `).join("");
}


let adminMap = null;
let markers = [];

function initLeafletIfPresent() {
  if (!window.L || !document.getElementById("map")) return;
  if (adminMap) return;

  adminMap = L.map("map").setView([22.7777, 73.6143], 11);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap"
  }).addTo(adminMap);
}

function clearMarkers() {
  if (!adminMap) return;
  markers.forEach(m => adminMap.removeLayer(m));
  markers = [];
}

async function initAdmin() {
  const u = await loadMe("adminInfo");
  if (!u) return;
  if (u.role !== "admin") return (window.location.href="./dashboard.html");

  initLeafletIfPresent();
  await loadAdminData();
}

async function loadAdminData() {
  await loadAdminRequests();
}

async function loadAdminRequests() {
  const body = $("reqBody");
  const badge = $("countBadge");
  if (!body) return;

  const db = loadDB();
  const rows = db.requests;

  if (badge) badge.innerText = String(rows.length);

  body.innerHTML = rows.length ? rows.map(r => {
    const user = db.users.find(u => u.id === r.user_id);
    const mech = r.mechanic_id ? db.users.find(u => u.id === r.mechanic_id) : null;

    // nearest mechanic (from mechanics with lat/lng)
    let nearestText = "No GPS";
    if (r.lat && r.lng) {
      const mechs = db.users.filter(u => u.role === "mechanic" && u.lat && u.lng);
      if (mechs.length) {
        let best = null;
        for (const m of mechs) {
          const km = haversineKm(r.lat, r.lng, m.lat, m.lng);
          if (!best || km < best.km) best = { name: m.name, km };
        }
        nearestText = best ? `${best.name} • ${best.km.toFixed(2)} km` : "No mechanic GPS";
      } else {
        nearestText = "No mechanic GPS";
      }
    }

    return `
      <tr>
        <td><b>#${r.id}</b><br><small>${r.vehicle_no}</small></td>
        <td>
          <b>${r.issue}</b><br>
          <small>${r.location || ""}</small><br>
          <small>Status: ${r.status}</small><br>
          <small><b>User:</b> ${user ? user.name : ""}</small><br>
          <small><b>Nearest:</b> ${nearestText}</small>
        </td>
        <td>
          <small>${mech ? mech.name : "Not assigned"}</small>
        </td>
      </tr>
    `;
  }).join("") : "<tr><td colspan='3'>No requests</td></tr>";

  // Map markers
  if (adminMap) {
    clearMarkers();
    rows.forEach(r => {
      if (r.lat && r.lng) {
        const m = L.marker([r.lat, r.lng]).addTo(adminMap)
          .bindPopup(`<b>Request #${r.id}</b><br>${r.issue}<br>${r.location || ""}`);
        markers.push(m);
      }
    });
    const first = rows.find(r => r.lat && r.lng);
    if (first) adminMap.setView([first.lat, first.lng], 13);
  }
}

/* =========================
   MECHANIC PANEL (Uber-style accept)
========================= */
async function initMechanic() {
  const u = await loadMe("mechInfo");
  if (!u) return;
  if (u.role !== "mechanic") return (window.location.href="./dashboard.html");

  toast("Tip: Update My GPS for better nearby sorting.", true);
  await loadOpenRequests();
  await loadMyAccepted();
}

async function updateMyLocation() {
  const u = getSessionUser();
  if (!u) return logout();

  const coords = await getUserLocation();
  if (!coords) return toast("Location denied. Allow GPS.", false);

  const db = loadDB();
  const me = db.users.find(x => x.id === u.id);
  me.lat = coords.lat; me.lng = coords.lng;
  saveDB(db);

  toast("Mechanic GPS updated ✅", true);
  await loadOpenRequests();
}

async function loadOpenRequests() {
  const u = getSessionUser();
  if (!u) return logout();

  const body = $("openBody");
  const badge = $("openCount");
  if (!body) return;

  const db = loadDB();
  const open = db.requests
    .filter(r => r.status === "open" && !r.mechanic_id);

  // compute distance
  const enriched = open.map(r => {
    let distance_km = null;
    if (u.lat && u.lng && r.lat && r.lng) {
      distance_km = haversineKm(u.lat, u.lng, r.lat, r.lng);
    }
    return { ...r, distance_km };
  }).sort((a,b) => {
    if (a.distance_km == null && b.distance_km == null) return 0;
    if (a.distance_km == null) return 1;
    if (b.distance_km == null) return -1;
    return a.distance_km - b.distance_km;
  });

  if (badge) badge.innerText = String(enriched.length);

  body.innerHTML = enriched.length ? enriched.map(r => {
    const dist = r.distance_km != null ? `${r.distance_km.toFixed(2)} km` : "No GPS";
    return `
      <tr>
        <td><b>#${r.id}</b><br><small>${r.vehicle_no}</small></td>
        <td>
          <b>${r.issue}</b><br>
          <small>${r.location || ""}</small><br>
          <small><b>Distance:</b> ${dist}</small>
        </td>
        <td>
          <button class="btn" style="width:100%;" onclick="acceptRequest(${r.id})">Accept</button>
        </td>
      </tr>
    `;
  }).join("") : "<tr><td colspan='3'>No open requests</td></tr>";
}

async function acceptRequest(id) {
  const u = getSessionUser();
  if (!u) return logout();

  const db = loadDB();
  const req = db.requests.find(r => r.id === id);

  if (!req || req.status !== "open" || req.mechanic_id) {
    return toast("Already accepted by another mechanic.", false);
  }

  req.mechanic_id = u.id;
  req.status = "in_progress";
  saveDB(db);

  toast("Accepted ✅ moved to My Accepted", true);
  await loadOpenRequests();
  await loadMyAccepted();
}

async function loadMyAccepted() {
  const u = getSessionUser();
  if (!u) return logout();

  const body = $("myBody");
  const badge = $("myCount");
  if (!body) return;

  const db = loadDB();
  const mine = db.requests.filter(r => r.mechanic_id === u.id);

  if (badge) badge.innerText = String(mine.length);

  body.innerHTML = mine.length ? mine.map(r => `
    <tr>
      <td><b>#${r.id}</b></td>
      <td>
        <b>${r.vehicle_no}</b><br>
        <small>${r.issue}</small><br>
        <small>${r.location || ""}</small>
      </td>
      <td>${r.status}</td>
    </tr>
  `).join("") : "<tr><td colspan='3'>No accepted requests</td></tr>";
}