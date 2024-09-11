const express = require("express");
const { Sequelize, DataTypes } = require("sequelize");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const moment = require('moment');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const sequelize = new Sequelize({
  dialect: "sqlite",
  storage: "./database.sqlite",
  logging: false,
});

const Machine = sequelize.define("Machine", {
  machineId: {
    type: DataTypes.STRING,
    primaryKey: true,
    allowNull: false,
  },
  machineName: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  toolCapacity: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
});

const MachineData = sequelize.define("MachineData", {
  machineId: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  axis: {
    type: DataTypes.ENUM("X", "Y", "Z", "A", "C"),
    allowNull: false,
  },
  toolOffset: {
    type: DataTypes.FLOAT,
    allowNull: false,
  },
  feedrate: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  toolInUse: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
});

const User = sequelize.define("User", {
  username: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  role: {
    type: DataTypes.ENUM("SUPERADMIN", "MANAGER", "SUPERVISOR", "OPERATOR"),
    allowNull: false,
  },
});

Machine.hasMany(MachineData, {
  foreignKey: "machineId",
  sourceKey: "machineId",
});
MachineData.belongsTo(Machine, {
  foreignKey: "machineId",
  targetKey: "machineId",
});

const authMiddleware = async (req, res, next) => {
  try {
    const token = req.header("Authorization").replace("Bearer ", "");
    const decoded = jwt.verify(token, "your_jwt_secret");
    const user = await User.findOne({ where: { id: decoded.id } });
    if (!user) {
      console.log("User not found for token:", token);
      throw new Error("User not found");
    }
    req.user = user;
    req.token = token;
    next();
  } catch (error) {
    console.error("Authentication error:", error.message);
    res.status(401).send({ error: "Please authenticate." });
  }
};

const accessControlMiddleware = (allowedRoles) => {
  return (req, res, next) => {
    if (allowedRoles.includes(req.user.role)) {
      next();
    } else {
      res.status(403).send({ error: "Access denied." });
    }
  };
};

app.post("/api/auth/register", async (req, res) => {
  try {
    const user = await User.create({
      ...req.body,
      password: await bcrypt.hash(req.body.password, 8),
    });
    const token = jwt.sign({ id: user.id }, "your_jwt_secret");
    res.status(201).send({ user, token });
  } catch (error) {
    res.status(400).send(error);
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const user = await User.findOne({ where: { username: req.body.username } });
    if (!user || !(await bcrypt.compare(req.body.password, user.password))) {
      throw new Error("Invalid login credentials");
    }
    const token = jwt.sign({ id: user.id }, "your_jwt_secret");
    res.send({ user, token });
  } catch (error) {
    res.status(400).send({ error: error.message });
  }
});

app.get("/api/auth/verify", authMiddleware, (req, res) => {
  res.send({ user: req.user });
});

app.post(
  "/api/machines",
  authMiddleware,
  accessControlMiddleware(["SUPERADMIN", "MANAGER"]),
  async (req, res) => {
    try {
      const { machineName, toolCapacity } = req.body;
      if (!machineName || !toolCapacity) {
        return res.status(400).json({ error: "Machine name and tool capacity are required" });
      }
      const machineId = `M${(await Machine.count() + 1).toString().padStart(8, "0")}`;
      const machine = await Machine.create({ machineId, machineName, toolCapacity });
      // Generate initial data for the new machine
      await generateMachineData(machine);
      res.status(201).send(machine);
    } catch (error) {
      res.status(400).send({ error: error.message });
    }
  }
);

app.get("/api/machines", authMiddleware, async (req, res) => {
  try {
    const machines = await Machine.findAll();
    res.send(machines);
  } catch (error) {
    res.status(500).send(error);
  }
});

app.put(
  "/api/machines/:machineId",
  authMiddleware,
  accessControlMiddleware(["SUPERADMIN", "MANAGER"]),
  async (req, res) => {
    try {
      const machine = await Machine.findByPk(req.params.machineId);
      if (!machine) {
        return res.status(404).send({ error: "Machine not found" });
      }
      if (req.user.role !== "SUPERADMIN" && "toolInUse" in req.body) {
        delete req.body.toolInUse;
      }
      await machine.update(req.body);
      res.send(machine);
    } catch (error) {
      res.status(400).send(error);
    }
  }
);

app.delete(
  "/api/machines/:machineId",
  authMiddleware,
  accessControlMiddleware(["SUPERADMIN"]),
  async (req, res) => {
    try {
      const machine = await Machine.findByPk(req.params.machineId);
      if (!machine) {
        return res.status(404).send({ error: "Machine not found" });
      }
      await machine.destroy();
      res.send({ message: "Machine deleted successfully" });
    } catch (error) {
      res.status(500).send(error);
    }
  }
);

app.get("/api/historical-data", authMiddleware, async (req, res) => {
  try {
    const { machineId } = req.query;
    const endTime = moment();
    const startTime = moment().subtract(15, 'minutes');

    const data = await MachineData.findAll({
      where: {
        machineId,
        createdAt: {
          [Sequelize.Op.between]: [startTime.toDate(), endTime.toDate()],
        },
      },
      order: [["createdAt", "ASC"]],
      include: [{ model: Machine, attributes: ['machineName'] }],
    });

    const formattedData = data.reduce((acc, record) => {
      const timestamp = moment(record.createdAt).toISOString();
      if (!acc[timestamp]) {
        acc[timestamp] = {
          timestamp,
          machineId: record.machineId,
          machineName: record.Machine.machineName,
          axes: {}
        };
      }
      acc[timestamp].axes[record.axis] = {
        toolOffset: record.toolOffset,
        feedrate: record.feedrate,
        toolInUse: record.toolInUse
      };
      return acc;
    }, {});

    res.send(Object.values(formattedData));
  } catch (error) {
    res.status(500).send(error);
  }
});

// Socket.IO connection handling
io.on("connection", (socket) => {
  console.log("New client connected");
  socket.on("disconnect", () => {
    console.log("Client disconnected");
  });
});

const AXES = ["X", "Y", "Z", "A", "C"];
const TOOL_OFFSET_INTERVAL = 1 * 60 * 1000; // Every 1 minute
const FEEDRATE_INTERVAL = 1 * 60 * 1000; // Every 1 minute
const TOOL_IN_USE_INTERVAL = 30 * 1000; // Every 30 seconds

function generateRandomValue(min, max) {
  return Math.random() * (max - min) + min;
}

async function generateMachineData(specificMachine = null) {
  try {
    const machines = specificMachine ? [specificMachine] : await Machine.findAll();
    const currentTime = moment();

    for (const machine of machines) {
      const machineData = {
        machineId: machine.machineId,
        machineName: machine.machineName,
        timestamp: currentTime.toISOString(),
        axes: {}
      };

      for (const axis of AXES) {
        const newData = {
          toolOffset: generateRandomValue(5, 40),
          feedrate: Math.floor(generateRandomValue(0, 20000)),
          toolInUse: Math.floor(generateRandomValue(1, machine.toolCapacity)),
        };

        machineData.axes[axis] = newData;

        await MachineData.create({
          machineId: machine.machineId,
          axis,
          ...newData,
          createdAt: currentTime.toDate()
        });
      }

      console.log(`Generated new data for machine ${machine.machineId}:`, machineData);
      io.to(machine.machineId).emit("machineData", machineData);
    }

    console.log("Generated new machine data for all machines");
  } catch (error) {
    console.error("Error generating machine data:", error);
  }
}

// Replace the server listening part with:
if (process.env.VERCEL) {
  // Running on Vercel, export the app
  module.exports = app;
} else {
  // Running locally
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// Instead, add this for database initialization:
(async () => {
  try {
    await sequelize.authenticate();
    console.log('Database connection has been established successfully.');
    
    // Initialize your database here (create tables, etc.)
    await sequelize.sync({ force: true });
    
    // Create initial machines
    for (let i = 1; i <= 20; i++) {
      await Machine.create({
        machineId: `M${i.toString().padStart(8, "0")}`,
        machineName: `EMXP${i}`,
        toolCapacity: 24,
      });
    }

    console.log("Initial data created successfully");
  } catch (error) {
    console.error('Unable to connect to the database:', error);
  }
})();

// Keep the data generation intervals
setInterval(() => generateMachineData(), TOOL_OFFSET_INTERVAL);
setInterval(() => generateMachineData(), FEEDRATE_INTERVAL);
setInterval(() => generateMachineData(), TOOL_IN_USE_INTERVAL);

// Serve the frontend for any other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

module.exports = app;
