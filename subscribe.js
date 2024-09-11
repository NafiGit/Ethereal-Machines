const socket = io("http://localhost:3000");
socket.emit("subscribe", "M00000001"); // Subscribe to updates for a specific machine
