# Ethereal Machines Backend Developer Assignment

This project implements a backend system for managing machine data, user authentication, and real-time data streaming as per the requirements specified by Ethereal Machines Pvt Ltd.

## Features

1. SQLite database for storing machine data and user information
2. User authentication system with role-based access control
3. CRUD operations for machine data
4. Historical data retrieval for the past 15 minutes
5. WebSocket connection for real-time machine data updates
6. Automatic data generation for 20 machines with 5 axes each

## Setup and Installation

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Run the server in development mode with Nodemon:
   ```
   npm run dev
   ```
   This will start the server and automatically restart it when file changes are detected.

   Alternatively, to run the server without Nodemon:
   ```
   npm start
   ```

## API Endpoints

### Authentication

- `POST /api/auth/register`: Register a new user
- `POST /api/auth/login`: Login and receive a JWT token

### Machine Management

- `POST /api/machines`: Create a new machine (SUPERADMIN, MANAGER)
- `GET /api/machines`: Get all machines (All authenticated users)
- `PUT /api/machines/:machineId`: Update a machine (SUPERADMIN, MANAGER)
- `DELETE /api/machines/:machineId`: Delete a machine (SUPERADMIN)

### Historical Data

- `GET /api/historical-data`: Get historical data for the past 15 minutes
  - Query parameters:
    - `machineId`: Required
    - `axis`: Optional (comma-separated list of axes)

## WebSocket

Connect to the WebSocket server to receive real-time machine data updates:

```javascript
const socket = io("http://localhost:3000");
socket.emit("subscribe", "M00000001"); // Subscribe to updates for a specific machine
```

## Access Control

- SUPERADMIN: Full access to all operations
- MANAGER: Can create and update machines, but cannot delete them or update 'tool_in_use'
- SUPERVISOR: Can read machine data and update 'tool_in_use'
- OPERATOR: Can read machine data and update 'tool_in_use'

## Data Generation

The server automatically generates data for machines with 5 axes each. Data is updated at the following intervals:

- Tool offset and feedrate: Every 1 minute
- Tool in use: Every 30 seconds

## Notes

- The server uses SQLite as the database, which is stored in `database.sqlite` in the project root.
- The database is recreated each time the server starts. For a production environment, remove the `{ force: true }` option from `sequelize.sync()`.
- Make sure to replace `'your_jwt_secret'` with a secure secret key in a production environment.

## Using the Dashboard

1. Register a new user or log in with existing credentials.
2. Once logged in, you'll see the main dashboard with a sidebar containing the list of available machines (EMXP1 to EMXP20).
3. The sidebar shows each machine's name with an icon for easy identification.
4. Click on a machine name in the sidebar to display its latest data in the main content area.
5. The data display is organized into tabs:
   - Details (default): Shows charts for Tool Offset, Feedrate, and Tool in Use for each axis (X, Y, Z, A, C), and a table with current values.
   - Edit: Allows updating machine information (for SUPERADMIN and MANAGER roles).
   - Delete: Provides an option to delete the machine (for SUPERADMIN role only).
   - Summary: Displays average values for quick insights.
6. The data will update in real-time as new information is generated on the server.
7. Use the "Create Machine" button at the top of the dashboard to add new machines (if you have the required permissions).

## User Interface

The dashboard now features a more organized and visually appealing layout based on Swiss design principles:

- Clean and minimalist design with a focus on typography and whitespace
- A navigation bar at the top displays the dashboard title (now visible) and logout button when logged in
- The main content area is divided into two sections:
  1. A sidebar on the left showing the list of machine names with icons
  2. The main dashboard area on the right, displaying machine data and charts
- Machine details are organized into tabs: Details, Edit, Delete, and Summary
- Login and registration forms are shown in the center of the screen when not logged in
- Improved color scheme for better readability and visual hierarchy
- Responsive layout that takes up the full viewport width (100vw)

### Design Improvements

- Font: Using 'Inter' for improved readability and a modern look
- Color Scheme: Enhanced color palette with a focus on simplicity and contrast
- Spacing: Improved spacing between elements for better visual hierarchy
- Tabs: Organized machine information into easily accessible tabs
- Summary: Included a summary tab with average values for quick insights

### Swiss Design Principles Applied

1. Simplicity: The layout is clean and uncluttered, focusing on essential information
2. Typography: Using a clear, sans-serif font (Inter) for improved readability
3. Grid System: Content is organized in a structured grid layout
4. Whitespace: Ample use of whitespace to create a sense of balance and focus
5. Color: A limited color palette with a focus on functionality and contrast
6. Hierarchy: Clear visual hierarchy to guide users through the interface

This new layout provides a more intuitive, user-friendly, and visually appealing experience, making it easier to navigate between machines and view their data.

## Troubleshooting

If you're experiencing issues with the dashboard:

1. Check the browser console for any error messages.
2. Verify that the WebSocket connection is established by looking for the "Connected to WebSocket" message in the console.
3. Ensure that you're logged in and have selected a machine to view its data.
4. If you're automatically logged out, it might be due to token expiration. The session is set to expire after 1 hour of inactivity.
5. If charts are not displaying correctly, try refreshing the page or selecting a different machine.
6. Check the server console for any error messages or logs about data generation.

## Known Issues and Fixes

1. Automatic Logout: The system now implements a token expiration check. Users will be automatically logged out after 1 hour of inactivity. This helps maintain security while preventing unexpected logouts.

2. Chart Stability: The charts have been optimized for better performance and stability. They now update more smoothly and should remain stable even with frequent data updates.

...
