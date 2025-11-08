# EduStream

**Real-time collaborative video streaming platform** — Watch together, comment on timelines, chat, brainstorm on a whiteboard, and get AI-powered insights. Built with the **MERN stack** and **Socket.io** for seamless synchronization.

## Overview

**EduStream** transforms passive video watching into an interactive, collaborative experience. Perfect for remote teams, study groups, content creators, or friends — it enables **synchronized playback** with rich collaboration tools:

  - **Timeline-synced comments**
  - **Live chat**
  - **Shared whiteboard**
  - **AI assistant** for instant doubt clarifications

All in a clean, tabbed interface powered by real-time WebSocket updates.

-----
<!-- 
## Prerequisites

To run StudySync locally, you'll need the following installed:

  * **Node.js $\ge 18$**: Required for running both the backend (Express) and the frontend (React).
  * **MongoDB**: A running instance (local or remote via [MongoDB Atlas](https://mongodb.com/atlas)).
  * **npm or yarn**: Package managers for dependency installation.
  * **External Service Dependencies**: These services are used for authentication, real-time communication, and AI, and require API keys/URLs to function:
      * **Supabase**: Used for secure authentication and user management.
      * **Google Gemini API**: Used for the AI Bot Panel features.
      * **LiveKit**: Provides the infrastructure for **real-time voice chat** and potentially video conferencing features.

----- -->

### Features

| Feature | Description |
|-------|-----------|
| **User Authentication** | Secure JWT-based login/signup |
| **Room System** | Create or join video rooms with unique IDs |
| **Real-Time Playback Sync** | Play, pause, seek — instantly mirrored across all users |
| **Voice Chat** | **Integrated real-time voice chat** within the room, powered by LiveKit. |
| **Timestamped Comments** | Pin comments to exact moments in the video |
| **Live Chat** | Instant messaging within the room |
| **AI Bot Panel** | Ask questions about the video; get smart responses |
| **Collaborative Whiteboard** | Draw, sketch, and sync strokes in real time |
| **Responsive UI** | Clean tabbed panel with glass-morphism design |
| **State Sync on Join** | New users instantly catch up with current playback & whiteboard |

-----

## Tech Stack

| Layer | Technology |
|------|------------|
| **Frontend** | React.js, TypeScript, Tailwind CSS, shadcn/ui, Lucide Icons |
| **Backend** | Node.js, Express.js |
| **Database** | MongoDB + Mongoose |
| **Real-Time** | Socket.io (WebSockets), LiveKit |
| **Authentication** | JWT, Supabase Auth |
| **AI** | Google Gemini API |
| **Deployment** | Ready for Netifly (frontend), Render (backend), MongoDB Atlas |

-----

## Project Structure

```
EduStream/
├── backend/
│   ├── routes/
│   │   ├── auth.js
│   │   ├── rooms.js
│   │   ├── roomPlayback.js
│   │   ├── aiRoutes.js
│   │   └── strokes.js
│   ├── middleware/auth.js
│   ├── models/
│   ├── app.js
│   └── .env
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── CollaborationPanel.tsx
│   │   │   ├── CommentsPanel.tsx
│   │   │   ├── ChatPanel.tsx
│   │   │   ├── AIBotPanel.tsx
│   │   │   └── Whiteboard.tsx
│   │   ├── pages/
│   │   └── App.tsx
│   └── .env
│
└── README.md
```

-----

## Setup & Installation

### Prerequisites

  - Node.js ≥ 18
  - MongoDB (local or [MongoDB Atlas](https://mongodb.com/atlas))
  - npm or yarn

-----

### Backend Setup

1.  Navigate to the backend directory:

    ```bash
    cd backend
    ```

2.  Install dependencies:

    ```bash
    npm install
    ```

3.  Create a `.env` file in the `backend` root directory and add the following variables:

    ```env
    MONGO_URI=your_mongodb_connection_string
    PORT=4000
    JWT_SECRET=your_long_random_secret
    JWT_EXPIRES_IN=2h
    BCRYPT_SALT_ROUNDS=12
    SUPABASE_URL=your_supabase_url
    SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
    GEMINI_API_KEY=your_gemini_api_key
    LIVEKIT_URL=wss://your-livekit-url
    LIVEKIT_API_KEY=your_livekit_api_key
    LIVEKIT_API_SECRET=your_livekit_api_secret
    ```

4.  Start the server:

    ```bash
    npm run dev
    ```

    > Server runs at `http://localhost:4000`

-----

### Frontend Setup

1.  Navigate to the frontend directory:

    ```bash
    cd frontend
    ```

2.  Install dependencies:

    ```bash
    npm install
    ```

3.  Create a `.env` file in the `frontend` root directory and add the following variables:

    ```env
    VITE_SUPABASE_URL=your_supabase_url
    VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
    VITE_BACKEND_URL=http://localhost:4000  # Or your deployed backend URL
    VITE_API_BASE=http://localhost:4000     # Or your deployed backend URL
    VITE_LIVEKIT_URL=wss://your-livekit-url
    ```

4.  Start the React app:

    ```bash
    npm run dev
    ```

    App runs at `http://localhost:8080` (or another port if configured differently)

-----

## API Endpoints

| Route | Method | Description |
|------|--------|-------------|
| `/api/auth/login` | POST | Login user |
| `/api/auth/signup` | POST | Register user |
| `/api/rooms` | GET/POST | List/create rooms |
| `/api/room-playback` | POST | Handle playback sync |
| `/api/ai` | POST | Query AI bot |
| `/strokes` | GET/POST | Whiteboard stroke sync |

-----

## Real-Time Events (Socket.io)

| Event | Payload | Description |
|------|--------|-------------|
| `join-room` | `{ roomId }` | Join a collaboration room |
| `playback-update` | `{ isPlaying, currentTime }` | Sync video state |
| `send-state` | `{ isPlaying, currentTime }` | Send current state to new joiners |
| `request-state` | - | Request current state on join |

## Future Enhancements

  -  Role-based access (Admin / Editor / Viewer)
  -  Video upload & hosting (via Cloudinary/Supabase)
  -  Comment threading & reactions
  -  Whiteboard undo/redo + export
  -  Offline mode with local caching
  -  Mobile app (React Native)

-----