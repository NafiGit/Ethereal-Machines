// Frontend.js

const API_URL = "http://localhost:3000/api";
const SOCKET_URL = "http://localhost:3000";

let currentUser = null;
let socket = null;
let currentMachineId = null;
let machinesData = {};
let currentRoute = '';

// DOM Elements
const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const logoutButton = document.getElementById("logout-button");
const machineList = document.getElementById("machine-list");
const machineDataContainer = document.getElementById("machine-data");
const authContainer = document.getElementById("auth-container");
const dashboardContainer = document.getElementById("dashboard-container");
const messageContainer = document.getElementById("message");

// Helper Functions
function showMessage(message, isError = false) {
  messageContainer.textContent = message;
  messageContainer.className = isError ? "error" : "success";
  messageContainer.style.display = "block";
  setTimeout(() => {
    messageContainer.style.display = "none";
  }, 5000);
}

// Authentication Functions
async function login(username, password) {
  try {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await response.json();
    if (response.ok) {
      currentUser = data.user;
      localStorage.setItem("token", data.token);
      localStorage.setItem("userRole", data.user.role);
      localStorage.setItem("tokenExpiration", Date.now() + 3600000); // Set expiration to 1 hour from now
      updateUI();
      initializeSocket();
      showMessage("Logged in successfully");
    } else {
      throw new Error(data.error || "Login failed");
    }
  } catch (error) {
    showMessage(error.message, true);
  }
}

async function register(username, password, role) {
  try {
    const response = await fetch(`${API_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, role }),
    });
    const data = await response.json();
    if (response.ok) {
      showMessage("Registration successful. Please log in.");
    } else {
      throw new Error(data.error || "Registration failed");
    }
  } catch (error) {
    showMessage(error.message, true);
  }
}

function logout() {
  currentUser = null;
  localStorage.removeItem("token");
  localStorage.removeItem("userRole");
  localStorage.removeItem("tokenExpiration");
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  document.getElementById("sidebar-container").innerHTML = "";
  updateUI();
  showMessage("Logged out successfully");
}

// Machine Data Functions
async function fetchMachines() {
  try {
    const response = await fetch(`${API_URL}/machines`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    });
    if (!response.ok) {
      throw new Error("Failed to fetch machines");
    }
    const machines = await response.json();
    console.log("Fetched machines:", machines);
    return machines;
  } catch (error) {
    console.error("Error fetching machines:", error);
    showMessage(error.message, true);
    return [];
  }
}

async function fetchHistoricalData(machineId) {
  try {
    const response = await fetch(`${API_URL}/historical-data?machineId=${machineId}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    });
    if (response.ok) {
      return await response.json();
    } else {
      throw new Error("Failed to fetch historical data");
    }
  } catch (error) {
    showMessage(error.message, true);
    return [];
  }
}

// UI Update Functions
async function updateUI() {
  if (isTokenExpired()) {
    logout();
    showMessage("Session expired. Please log in again.");
    return;
  }

  const isLoggedIn = !!currentUser;
  document.getElementById("navbar").style.display = isLoggedIn ? "flex" : "none";
  document.getElementById("main-content").style.display = isLoggedIn ? "flex" : "block";
  document.getElementById("auth-container").style.display = isLoggedIn ? "none" : "block";
  document.getElementById("dashboard-container").style.display = isLoggedIn ? "block" : "none";
  
  if (isLoggedIn) {
    const machines = await fetchMachines();
    document.getElementById("sidebar-container").innerHTML = createSidebar(machines);
    // Only call updateUIBasedOnRole when a machine is selected
    if (currentMachineId) {
      updateUIBasedOnRole();
    }
  }
}

function createSidebar(machines) {
  return `
    <div id="sidebar">
      <h2>Machines</h2>
      <ul>
        ${machines.map(machine => `
          <li>
            <a href="#" class="machine-link" onclick="selectMachine('${machine.machineId}', '${machine.machineName}')">
              <i class="fas fa-cog"></i> ${machine.machineName}
            </a>
          </li>
        `).join('')}
      </ul>
    </div>
  `;
}

async function selectMachine(machineId, machineName) {
  currentRoute = `machine/${machineId}`;
  updateURL();
  const historicalData = await fetchHistoricalData(machineId);
  machinesData[machineId] = historicalData;
  displayMachineData(machineId, machineName);
  if (socket) {
    socket.emit('unsubscribe', currentMachineId);
    socket.emit('subscribe', machineId);
    currentMachineId = machineId;
  }
  updateUIBasedOnRole(); // Call updateUIBasedOnRole here
}

function updateURL() {
  history.pushState(null, '', `#${currentRoute}`);
}

const AXES = ["X", "Y", "Z", "A", "C"];
const COLORS = {
  X: 'rgba(231, 76, 60, 0.7)',   // Red
  Y: 'rgba(46, 204, 113, 0.7)',  // Green
  Z: 'rgba(52, 152, 219, 0.7)',  // Blue
  A: 'rgba(155, 89, 182, 0.7)',  // Purple
  C: 'rgba(241, 196, 15, 0.7)'   // Yellow
};

function createChart(canvasId, label, data, dataKey) {
  const ctx = document.getElementById(canvasId).getContext('2d');
  return new Chart(ctx, {
    type: 'line',
    data: {
      datasets: AXES.map(axis => ({
        label: `${axis} Axis`,
        data: data.map(d => ({
          x: new Date(d.timestamp),
          y: d.axes[axis][dataKey]
        })),
        borderColor: COLORS[axis],
        backgroundColor: COLORS[axis],
        fill: false,
        tension: 0.4,
        borderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 5
      }))
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 0
      },
      plugins: {
        title: {
          display: true,
          text: label,
          font: {
            size: 16,
            weight: 'bold'
          }
        },
        legend: {
          position: 'top',
          labels: {
            usePointStyle: true,
            padding: 20
          }
        }
      },
      scales: {
        x: {
          type: 'time',
          time: {
            unit: 'minute',
            displayFormats: {
              minute: 'HH:mm:ss'
            }
          },
          title: {
            display: true,
            text: 'Time'
          },
          grid: {
            display: false
          }
        },
        y: {
          title: {
            display: true,
            text: label
          },
          grid: {
            color: 'rgba(0, 0, 0, 0.1)'
          }
        }
      }
    }
  });
}

let charts = {};

async function displayMachineData(machineId, machineName) {
  try {
    const response = await fetch(`${API_URL}/historical-data?machineId=${machineId}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    });
    if (!response.ok) {
      throw new Error("Failed to fetch historical data");
    }
    const data = await response.json();
    
    if (data.length === 0) {
      machineDataContainer.innerHTML = "<p>No data available for this machine.</p>";
      return;
    }

    const latestData = data[data.length - 1];

    machineDataContainer.innerHTML = `
      <h2>${machineName} (${machineId})</h2>
      <div class="tab-container">
        <button class="tab-button active" onclick="showTab('details')">Details</button>
        <button class="tab-button" onclick="showTab('edit')">Edit</button>
        <button class="tab-button" onclick="showTab('delete')">Delete</button>
        <button class="tab-button" onclick="showTab('summary')">Summary</button>
      </div>
      <div id="details-tab" class="tab-content">
        <div class="data-container">
          <div class="table-container">
            <table id="latestDataTable"></table>
          </div>
          <div class="chart-container">
            <div class="chart-wrapper"><canvas id="toolOffsetChart"></canvas></div>
            <div class="chart-wrapper"><canvas id="feedrateChart"></canvas></div>
            <div class="chart-wrapper"><canvas id="toolInUseChart"></canvas></div>
          </div>
        </div>
      </div>
      <div id="edit-tab" class="tab-content" style="display: none;">
        <h3>Edit Machine</h3>
        <form id="edit-machine-form">
          <input type="text" id="edit-machine-name" placeholder="New machine name">
          <input type="number" id="edit-tool-capacity" placeholder="New tool capacity">
          <button type="submit">Update Machine</button>
        </form>
      </div>
      <div id="delete-tab" class="tab-content" style="display: none;">
        <h3>Delete Machine</h3>
        <p>Are you sure you want to delete this machine?</p>
        <button onclick="deleteMachine('${machineId}')">Confirm Delete</button>
      </div>
      <div id="summary-tab" class="tab-content" style="display: none;">
        ${createSummary(latestData)}
      </div>
    `;

    charts.toolOffset = createChart("toolOffsetChart", "Tool Offset", data, "toolOffset");
    charts.feedrate = createChart("feedrateChart", "Feedrate", data, "feedrate");
    charts.toolInUse = createChart("toolInUseChart", "Tool in Use", data, "toolInUse");

    updateLatestDataTable(latestData);
    
    // Add event listener for edit form submission
    document.getElementById('edit-machine-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const newName = document.getElementById('edit-machine-name').value;
      const newToolCapacity = document.getElementById('edit-tool-capacity').value;
      updateMachine(machineId, newName, newToolCapacity);
    });

  } catch (error) {
    console.error("Error displaying machine data:", error);
    showMessage(error.message, true);
  }
}

function createSummary(latestData) {
  const averages = AXES.reduce((acc, axis) => {
    acc.toolOffset += latestData.axes[axis].toolOffset;
    acc.feedrate += latestData.axes[axis].feedrate;
    acc.toolInUse += latestData.axes[axis].toolInUse;
    return acc;
  }, { toolOffset: 0, feedrate: 0, toolInUse: 0 });

  Object.keys(averages).forEach(key => averages[key] /= AXES.length);

  return `
    <div class="summary-container">
      <div class="summary-item">
        <h3>Average Tool Offset</h3>
        <p>${averages.toolOffset.toFixed(2)}</p>
      </div>
      <div class="summary-item">
        <h3>Average Feedrate</h3>
        <p>${averages.feedrate.toFixed(2)}</p>
      </div>
      <div class="summary-item">
        <h3>Average Tool in Use</h3>
        <p>${averages.toolInUse.toFixed(2)}</p>
      </div>
    </div>
  `;
}

function showTab(tabName) {
  document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(content => content.style.display = 'none');
  document.querySelector(`button[onclick="showTab('${tabName}')"]`).classList.add('active');
  document.getElementById(`${tabName}-tab`).style.display = 'block';
}

function updateLatestDataTable(latestData) {
  const table = document.getElementById("latestDataTable");
  table.innerHTML = `
    <tr>
      <th>Axis</th>
      <th>Tool Offset</th>
      <th>Feedrate</th>
      <th>Tool in Use</th>
    </tr>
    ${AXES.map(axis => `
      <tr>
        <td>${axis}</td>
        <td>${latestData.axes[axis].toolOffset.toFixed(2)}</td>
        <td>${latestData.axes[axis].feedrate}</td>
        <td>${latestData.axes[axis].toolInUse}</td>
      </tr>
    `).join('')}
  `;
}

// Socket Functions
function initializeSocket() {
  if (socket) {
    socket.disconnect();
  }

  socket = io(SOCKET_URL, {
    auth: { token: localStorage.getItem("token") },
    transports: ["websocket", "polling"],
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });

  socket.on("connect", () => {
    console.log("Connected to WebSocket");
    showMessage("Connected to real-time updates");
  });

  socket.on("connect_error", (error) => {
    console.error("WebSocket connection error:", error);
    showMessage("Failed to connect to real-time updates. Retrying...", true);
  });

  socket.on("disconnect", (reason) => {
    console.log("Disconnected from WebSocket:", reason);
    if (reason === "io server disconnect") {
      socket.connect();
    }
  });

  socket.on("reconnect", (attemptNumber) => {
    console.log("Reconnected to WebSocket after", attemptNumber, "attempts");
    showMessage("Reconnected to real-time updates");
  });

  socket.on("reconnect_failed", () => {
    console.log("Failed to reconnect to WebSocket");
    showMessage(
      "Failed to reconnect to real-time updates. Please refresh the page.",
      true
    );
  });

  socket.on("machineData", (newData) => {
    console.log("Received new machine data:", newData);
    if (newData.machineId === currentMachineId) {
      if (!machinesData[currentMachineId]) {
        machinesData[currentMachineId] = [];
      }
      machinesData[currentMachineId].push(newData);
      if (machinesData[currentMachineId].length > 30) {
        machinesData[currentMachineId].shift();
      }
      updateCharts(newData);
      updateLatestDataTable(newData);
      updateSummary(newData);
    }
  });
}

function updateCharts(newData) {
  if (charts.toolOffset) {
    const timestamp = new Date(newData.timestamp);
    Object.keys(charts).forEach(chartKey => {
      charts[chartKey].data.datasets.forEach((dataset, i) => {
        dataset.data.push({
          x: timestamp,
          y: newData.axes[AXES[i]][chartKey]
        });
        if (dataset.data.length > 30) dataset.data.shift();
      });
      charts[chartKey].update('none'); // Use 'none' to disable animations
    });
  }
}

function updateLatestDataTable(latestData) {
  const table = document.getElementById("latestDataTable");
  if (table) {
    const rows = table.getElementsByTagName('tr');
    AXES.forEach((axis, index) => {
      if (rows[index + 1]) {
        const cells = rows[index + 1].getElementsByTagName('td');
        cells[1].textContent = latestData.axes[axis].toolOffset.toFixed(2);
        cells[2].textContent = latestData.axes[axis].feedrate;
        cells[3].textContent = latestData.axes[axis].toolInUse;
      }
    });
  }
}

function updateSummary(newData) {
  const summaryTab = document.getElementById('summary-tab');
  if (summaryTab && summaryTab.style.display !== 'none') {
    summaryTab.innerHTML = createSummary(newData);
  }
}

// Event Listeners
loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const username = document.getElementById("login-username").value;
  const password = document.getElementById("login-password").value;
  login(username, password);
});

registerForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const username = document.getElementById("register-username").value;
  const password = document.getElementById("register-password").value;
  const role = document.getElementById("register-role").value;
  register(username, password, role);
});

logoutButton.addEventListener("click", logout);

// Check for existing token and initialize UI
document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("token");
  const userRole = localStorage.getItem("userRole");
  if (token && userRole) {
    fetch(`${API_URL}/auth/verify`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Token verification failed");
        }
        return response.json();
      })
      .then((data) => {
        if (data.user) {
          currentUser = data.user;
          currentUser.role = userRole;
          updateUI();
          initializeSocket();
        } else {
          throw new Error("User data not found");
        }
      })
      .catch((error) => {
        console.error("Token verification failed:", error);
        localStorage.removeItem("token");
        localStorage.removeItem("userRole");
        updateUI();
      });
  }
});

// Update the updateUIBasedOnRole function
function updateUIBasedOnRole() {
  const role = currentUser.role;
  const editTab = document.querySelector('button[onclick="showTab(\'edit\')"]');
  const deleteTab = document.querySelector('button[onclick="showTab(\'delete\')"]');
  const toolInUseInputs = document.querySelectorAll(".tool-in-use-input");

  if (editTab) {
    editTab.style.display = (role === "SUPERADMIN" || role === "MANAGER") ? "inline-block" : "none";
  }

  if (deleteTab) {
    deleteTab.style.display = (role === "SUPERADMIN") ? "inline-block" : "none";
  }

  toolInUseInputs.forEach(input => {
    if (input) {
      input.disabled = (role === "MANAGER");
    }
  });
}

// Update the updateMachine function
async function updateMachine(machineId, machineName, toolCapacity) {
  const updateData = {};
  if (machineName) updateData.machineName = machineName;
  if (toolCapacity) updateData.toolCapacity = parseInt(toolCapacity, 10);

  if (Object.keys(updateData).length > 0) {
    try {
      const response = await fetch(`${API_URL}/machines/${machineId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify(updateData),
      });
      if (response.ok) {
        showMessage("Machine updated successfully");
        updateUI();
      } else {
        throw new Error("Failed to update machine");
      }
    } catch (error) {
      showMessage(error.message, true);
    }
  }
}

// Update the deleteMachine function
async function deleteMachine(machineId) {
  try {
    const response = await fetch(`${API_URL}/machines/${machineId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
    });
    if (response.ok) {
      showMessage("Machine deleted successfully");
      updateUI();
      // Redirect to the dashboard or first available machine
      const machines = await fetchMachines();
      if (machines.length > 0) {
        selectMachine(machines[0].machineId, machines[0].machineName);
      } else {
        machineDataContainer.innerHTML = "<p>No machines available.</p>";
      }
    } else {
      throw new Error("Failed to delete machine");
    }
  } catch (error) {
    showMessage(error.message, true);
  }
}

// Add an interval to check for token expiration
setInterval(() => {
  if (isTokenExpired()) {
    logout();
    showMessage("Session expired. Please log in again.");
  }
}, 60000); // Check every minute

function isTokenExpired() {
  const expiration = localStorage.getItem("tokenExpiration");
  return expiration && Date.now() > parseInt(expiration);
}
