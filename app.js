const API = "http://localhost:3000";
function toast(text, ok = true) {
  const el = document.getElementById("toast");
  if (!el) return; // only on pages that include toast
  el.className = "toast show " + (ok ? "ok" : "err");
  el.textContent = text;
  setTimeout(() => el.classList.remove("show"), 2600);
}

function setBusy(btnId, busy, textBusy = "Working...") {
  const b = document.getElementById(btnId);
  if (!b) return;
  b.disabled = busy;
  if (busy) {
    b.dataset.prev = b.textContent;
    b.textContent = textBusy;
  } else {
    b.textContent = b.dataset.prev || b.textContent;
  }
}
function showMsg(text, ok = true) {
  const el = document.getElementById("msg");
  if (!el) return;
  el.style.display = "block";
  el.className = "msg " + (ok ? "ok" : "err");
  el.innerText = text;
}

function hideMsg() {
  const el = document.getElementById("msg");
  if (!el) return;
  el.style.display = "none";
}

function getToken() {
  return localStorage.getItem("token");
}

function setToken(token) {
  localStorage.setItem("token", token);
}

function stopLiveRefresh() {
  if (LIVE_TIMER) clearInterval(LIVE_TIMER);
  LIVE_TIMER = null;
}

function logout() {
  stopLiveRefresh();
  localStorage.removeItem("token");
  window.location.href = "/";
}

function goDashboard() {
  window.location.href = "/dashboard.html";
}

function goAdmin() {
  window.location.href = "/admin.html";
}


async function registerUser() {
  hideMsg();
  const name = document.getElementById("r_name")?.value?.trim();
  const email = document.getElementById("r_email")?.value?.trim();
  const password = document.getElementById("r_password")?.value?.trim();

  if (!name || !email || !password) {
    return showMsg("Please enter name, email, and password.", false);
  }

  try {
    const res = await fetch(`${API}/api/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password })
    });

    const data = await res.json();
    if (!res.ok) return showMsg(data.error || "Register failed", false);

    showMsg("✅ Registered successfully! Now login.", true);
  } catch {
    showMsg("Network error during register.", false);
  }
}

async function loginUser() {
  hideMsg();
  const email = document.getElementById("l_email")?.value?.trim();
  const password = document.getElementById("l_password")?.value?.trim();

  if (!email || !password) {
    return showMsg("Please enter email and password.", false);
  }

  try {
    const res = await fetch(`${API}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();
    if (!res.ok) return showMsg(data.error || "Login failed", false);

    setToken(data.token);
    window.location.href = "/dashboard.html";
  } catch {
    showMsg("Network error during login.", false);
  }
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



async function initDashboard() {
  const token = getToken();
  if (!token) return (window.location.href = "/");

  await loadMe("userInfo");
  await loadMyRequests();
}

async function loadMe(targetElementId = "userInfo") {
  try {
    const res = await fetch(`${API}/api/me`, {
      headers: { Authorization: `Bearer ${getToken()}` }
    });
    const data = await res.json();

    if (!res.ok) {
      logout();
      return null;
    }

    const ui = document.getElementById(targetElementId);
    if (ui) {
      ui.innerHTML = `
        <small>
          Logged in as: <b>${data.user.name}</b> (${data.user.email}) • Role: <b>${data.user.role}</b>
        </small>
      `;
    }

    return data.user;
  } catch {
    showMsg("Failed to load user profile.", false);
    return null;
  }
}

async function createRequest() {
  hideMsg();
  const vehicle_no = document.getElementById("vehicle_no")?.value?.trim();
  const issue = document.getElementById("issue")?.value?.trim();
  const location = document.getElementById("location")?.value?.trim();

  if (!vehicle_no || !issue) {
    return showMsg("Vehicle No and Issue are required.", false);
  }

  
  const coords = await getUserLocation();

  try {
    const res = await fetch(`${API}/api/requests`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`
      },
      body: JSON.stringify({
        vehicle_no,
        issue,
        location,
        lat: coords?.lat || null,
        lng: coords?.lng || null
      })
    });

    const data = await res.json();
    if (!res.ok) return showMsg(data.error || "Create request failed", false);

    showMsg("✅ Request created successfully!", true);

    if (document.getElementById("vehicle_no")) document.getElementById("vehicle_no").value = "";
    if (document.getElementById("issue")) document.getElementById("issue").value = "";
    if (document.getElementById("location")) document.getElementById("location").value = "";

    await loadMyRequests();
  } catch {
    showMsg("Network error while creating request.", false);
  }
}

async function loadMyRequests() {
  const body = document.getElementById("reqBody");
  if (!body) return;

  body.innerHTML = "<tr><td colspan='6'>Loading...</td></tr>";

  try {
    const res = await fetch(`${API}/api/my-requests`, {
      headers: { Authorization: `Bearer ${getToken()}` }
    });

    const data = await res.json();
    if (!res.ok) return showMsg(data.error || "Failed to load requests", false);

    const rows = data.requests || [];
    if (rows.length === 0) {
      body.innerHTML = "<tr><td colspan='6'>No requests found</td></tr>";
      return;
    }

    body.innerHTML = rows.map((r) => {
      const dt = r.created_at ? new Date(r.created_at).toLocaleString() : "";
      return `
        <tr>
          <td>${r.id}</td>
          <td>${r.vehicle_no}</td>
          <td>${r.issue}</td>
          <td>${r.location ?? ""}</td>
          <td>${r.status}</td>
          <td>${dt}</td>
        </tr>
      `;
    }).join("");
  } catch {
    showMsg("Network error while loading requests.", false);
  }
}


function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (x) => (x * Math.PI) / 180;
  const R = 6371;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function findNearestMechanic(reqLat, reqLng) {
  const candidates = (MECHANICS || []).filter(m => m.lat && m.lng);

  if (candidates.length === 0) {
    return { id: null, name: "No mechanic GPS", km: null };
  }

  let best = null;

  for (const m of candidates) {
    const km = haversineKm(Number(reqLat), Number(reqLng), Number(m.lat), Number(m.lng));
    if (!best || km < best.km) {
      best = { id: m.id, name: m.name, km };
    }
  }

  return best;
}


let MECHANICS = [];
let adminMap = null;
let requestMarkers = [];
let mechanicMarkers = [];

let LIVE_TIMER = null;
let LIVE_ON = true;

function toggleLive() {
  LIVE_ON = !LIVE_ON;
  const el = document.getElementById("liveState");
  if (el) el.innerText = LIVE_ON ? "ON" : "OFF";

  if (LIVE_ON) startLiveRefresh();
  else stopLiveRefresh();
}

function startLiveRefresh() {
  stopLiveRefresh();
  LIVE_TIMER = setInterval(() => loadAdminData(), 5000);
}

function initLeafletMap() {
  if (adminMap) return;

  
  adminMap = L.map("map").setView([22.7777, 73.6143], 10);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap"
  }).addTo(adminMap);
}

function clearRequestMarkers() {
  if (!adminMap) return;
  requestMarkers.forEach(m => adminMap.removeLayer(m));
  requestMarkers = [];
}

function clearMechanicMarkers() {
  if (!adminMap) return;
  mechanicMarkers.forEach(m => adminMap.removeLayer(m));
  mechanicMarkers = [];
}

async function initAdmin() {
  const token = getToken();
  if (!token) return (window.location.href = "/");

  const user = await loadMe("adminInfo");
  if (!user) return;

  if (user.role !== "admin") {
    alert("Access denied: Admin only");
    return goDashboard();
  }

  initLeafletMap();
  await loadAdminData();
  startLiveRefresh();
}

async function loadAdminData() {
  await loadMechanics();
  await loadAllRequests();
}

async function loadMechanics() {
  const res = await fetch(`${API}/api/admin/mechanics`, {
    headers: { Authorization: `Bearer ${getToken()}` }
  });
  const data = await res.json();
  if (!res.ok) return showMsg(data.error || "Failed to load mechanics", false);

  MECHANICS = data.mechanics || [];
}

async function loadAllRequests() {
  const body = document.getElementById("reqBody");
  if (!body) return;

  body.innerHTML = "<tr><td colspan='3'>Loading...</td></tr>";

  const res = await fetch(`${API}/api/admin/requests`, {
    headers: { Authorization: `Bearer ${getToken()}` }
  });
  const data = await res.json();
  if (!res.ok) return showMsg(data.error || "Failed to load requests", false);

  const rows = data.requests || [];
  const badge = document.getElementById("countBadge");
  if (badge) badge.innerText = String(rows.length);
  body.innerHTML = rows.map((r) => {
    const nearest =
      (r.lat && r.lng) ? findNearestMechanic(r.lat, r.lng) : { name: "No GPS", km: null };

    const nearestText =
      nearest?.km != null
        ? `${nearest.name} • ${nearest.km.toFixed(2)} km`
        : (r.lat && r.lng ? "No mechanics GPS" : "No GPS");

    const options = MECHANICS.map((m) =>
      `<option value="${m.id}" ${r.mechanic_id === m.id ? "selected" : ""}>
        ${m.name}
      </option>`
    ).join("");

    return `
      <tr>
        <td><b>#${r.id}</b><br><small>${r.vehicle_no}</small></td>
        <td>
          <b>${r.issue}</b><br>
          <small>${r.location ?? ""}</small><br>
          <small>Status: ${r.status}</small><br>
          <small><b>Nearest:</b> ${nearestText}</small>
        </td>
        <td>
          <select id="mech_${r.id}">
            <option value="">-- select mechanic --</option>
            ${options}
          </select>
          <div style="height:8px;"></div>
          <button style="width:100%;" onclick="assignMechanic(${r.id})">Assign</button>
        </td>
      </tr>
    `;
  }).join("");
  if (!adminMap) return;

  clearRequestMarkers();
  clearMechanicMarkers();

  MECHANICS.forEach(m => {
    if (m.lat && m.lng) {
      const mm = L.circleMarker([Number(m.lat), Number(m.lng)], { radius: 8 })
        .addTo(adminMap)
        .bindPopup(`<b>Mechanic:</b> ${m.name}<br>${m.email}`);
      mechanicMarkers.push(mm);
    }
  });
  rows.forEach((r) => {
    if (r.lat && r.lng) {
      const nearest = findNearestMechanic(r.lat, r.lng);
      const nearestLine =
        nearest?.km != null
          ? `Nearest: ${nearest.name} (${nearest.km.toFixed(2)} km)`
          : `Nearest: Not available`;

      const marker = L.marker([Number(r.lat), Number(r.lng)])
        .addTo(adminMap)
        .bindPopup(
          `<b>Request #${r.id}</b><br>
           Vehicle: ${r.vehicle_no}<br>
           Issue: ${r.issue}<br>
           Location: ${r.location ?? ""}<br>
           Status: ${r.status}<br>
           <b>${nearestLine}</b>`
        );
      requestMarkers.push(marker);
    }
  });
 const first = rows.find(r => r.lat && r.lng);
  if (first) adminMap.setView([Number(first.lat), Number(first.lng)], 12);
}
async function assignMechanic(requestId) {
  hideMsg();
  const select = document.getElementById(`mech_${requestId}`);
  const mechanic_id = select?.value;
if (!mechanic_id) return showMsg("Please select a mechanic.", false);
const res = await fetch(`${API}/api/admin/requests/${requestId}/assign`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`
    },
    body: JSON.stringify({ mechanic_id: Number(mechanic_id) })
  });

  const data = await res.json();
  if (!res.ok) return showMsg(data.error || "Assign failed", false);

  showMsg("✅ Mechanic assigned successfully!", true);
  await loadAllRequests();
}