// # Whiteboard
// A collaborative whiteboard that uses Supabase Realtime's broadcast channel to synchronize drawing strokes and cursor positions between multiple users in real-time.
// Persistence is handled via backend API with MongoDB.

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
// import './styles.css';
import { createClient } from '@supabase/supabase-js';
import { Trash2, Save } from "lucide-react";

// Initialize Supabase client using environment variables (for realtime only)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Backend API base URL (adjust to your backend, e.g., http://localhost:5000 or deployed URL)
const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';

// Whiteboard background color (must match CSS for save function)
const WHITEBOARD_BG_COLOR = '#171717';

export default function Whiteboard() {
  const { roomId = 'default' } = useParams();
  const [username, setUsername] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [activeUsers, setActiveUsers] = useState([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentColor, setCurrentColor] = useState('#3ecf8e');

  const canvasRef = useRef(null);
  const contextRef = useRef(null);
  const userId = useRef(Math.random().toString(36).substring(2, 15));
  const isInitialSetup = useRef(true);
  const pointsBuffer = useRef([]);
  const batchTimerRef = useRef(null);
  const channelRef = useRef(null);
  const currentPathRef = useRef([]);
  // at top with other refs
  const strokesStoreRef = useRef<Array<{ points: any[]; color: string }>>([]);

  function repaintAll() {
    const ctx = contextRef.current;
    if (!ctx) return;
    for (const s of strokesStoreRef.current) {
      drawStroke(s.points, s.color);
    }
  }


  // Dynamic channel name based on roomId
  const CHANNEL = `whiteboard-${roomId}`;

  // Initialize canvas and context (runs only on mount/unmount/resize)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const setupCanvas = () => {
      const container = canvas.parentElement;
      if (!container) return;

      const { width, height } = container.getBoundingClientRect();
      const dpr = Math.max(1, window.devicePixelRatio || 1);

      // Setting width/height resets the bitmap (clears canvas)
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      const ctx = canvas.getContext('2d');
      // setTransform is better than scale() because it resets the transform
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Re-apply stroke defaults every time we re-init
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 5;
      ctx.strokeStyle = currentColor;
      contextRef.current = ctx;

      // ✅ Repaint everything we had
      repaintAll();
    };

    setupCanvas();

    const resizeObserver = new ResizeObserver(() => {
      setupCanvas();
    });

    const container = canvas.parentElement;
    if (container) resizeObserver.observe(container);

    window.addEventListener('resize', setupCanvas);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', setupCanvas);
      if (batchTimerRef.current) clearTimeout(batchTimerRef.current);
    };
  }, []);


  // Update stroke color when currentColor changes (Runs after initial setup)
  useEffect(() => {
    if (contextRef.current) {
      contextRef.current.strokeStyle = currentColor;
    }
  }, [currentColor]);

  // Function to draw a stroke (used for both realtime and initial load)
  const drawStroke = (points, color) => {
    const context = contextRef.current;
    if (!context || points.length === 0) return;

    const currentStrokeStyle = context.strokeStyle;
    context.strokeStyle = color;

    let isNewPath = true;

    for (let i = 0; i < points.length; i++) {
      const point = points[i];

      if (point.type === 'start' || isNewPath) {
        context.beginPath();
        context.moveTo(point.x, point.y);
        isNewPath = false;
      } else if (point.type === 'move') {
        context.lineTo(point.x, point.y);
        context.stroke();
      }
    }

    context.strokeStyle = currentStrokeStyle;
  };

  // Function to send batched points
  const sendBatchedPoints = () => {
    if (pointsBuffer.current.length === 0) return;

    channelRef.current.send({
      type: 'broadcast',
      event: 'draw_batch',
      payload: {
        userId: userId.current,
        points: [...pointsBuffer.current],
        color: currentColor
      }
    });

    pointsBuffer.current = [];
  };

  // Set up Supabase channel and load initial strokes from backend
  useEffect(() => {
    const adjectives = ['Happy', 'Clever', 'Brave', 'Bright', 'Kind'];
    const nouns = ['Panda', 'Tiger', 'Eagle', 'Dolphin', 'Fox'];
    const randomName = `${adjectives[Math.floor(Math.random() * adjectives.length)]}${nouns[Math.floor(Math.random() * nouns.length)]
      }${Math.floor(Math.random() * 100)}`;
    setUsername(randomName);

    const channel = supabase.channel(CHANNEL);
    channelRef.current = channel;

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      const users = [];

      Object.keys(state).forEach(key => {
        const presences = state[key];
        users.push(...presences);
      });

      setActiveUsers(users);
    });

    channel.on('broadcast', { event: 'draw_batch' }, (payload) => {
      if (payload.payload.userId === userId.current) return;

      const { points, color } = payload.payload;
      drawStroke(points, color);
      strokesStoreRef.current.push({ points, color });
    });

    channel.on('broadcast', { event: 'draw' }, (payload) => {
      if (payload.payload.userId === userId.current) return;

      const { x, y, type, color } = payload.payload;
      const context = contextRef.current;

      if (!context) return;

      const currentStrokeStyle = context.strokeStyle;
      context.strokeStyle = color;

      if (type === 'start') {
        context.beginPath();
        context.moveTo(x, y);
      } else if (type === 'move') {
        context.lineTo(x, y);
        context.stroke();
      }

      context.strokeStyle = currentStrokeStyle;
    });

    channel.on('broadcast', { event: 'clear' }, () => {
      const canvas = canvasRef.current;
      const context = contextRef.current;

      if (!context || !canvas) return;

      context.clearRect(0, 0, canvas.width, canvas.height);
    });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({
          user_id: userId.current,
          username: randomName,
          online_at: new Date().getTime()
        });

        setIsConnected(true);

        // Load initial strokes from backend API
        try {
          const response = await fetch(`${API_BASE_URL}/strokes/${roomId}`);
          if (!response.ok) throw new Error('Failed to fetch strokes');
          const data = await response.json();
          data.forEach(stroke => {
            drawStroke(stroke.strokes, stroke.color);
            strokesStoreRef.current.push({ points: stroke.strokes, color: stroke.color });
          });

          // --- FIX APPLIED HERE ---
          // Set current color to the last stroke color if strokes were loaded.
          if (data.length > 0) {
            setCurrentColor(data[data.length - 1].color);
          }

        } catch (error) {
          console.error('Error loading strokes:', error);
        }
      }
    });

    return () => {
      channel.unsubscribe();
    };
  }, [roomId]);

  // Drawing handlers (omitted for brevity, they are unchanged from previous working version)
  const startDrawing = ({ nativeEvent }) => {
    const { offsetX, offsetY } = nativeEvent;

    // Start a new path in the canvas
    contextRef.current.strokeStyle = currentColor;
    contextRef.current.beginPath();
    contextRef.current.moveTo(offsetX, offsetY);
    setIsDrawing(true);

    // Reset the current path
    currentPathRef.current = [{ type: 'start', x: offsetX, y: offsetY }];

    // Add to buffer for batched sending with type information
    pointsBuffer.current.push({ type: 'start', x: offsetX, y: offsetY });

    // Start the batch timer if not already started
    if (!batchTimerRef.current) {
      batchTimerRef.current = setInterval(sendBatchedPoints, 10); // Send every 10ms for more frequent updates
    }

    // For backward compatibility, also send individual start event
    channelRef.current.send({
      type: 'broadcast',
      event: 'draw',
      payload: {
        userId: userId.current,
        type: 'start',
        x: offsetX,
        y: offsetY,
        color: currentColor
      }
    });
  };

  const draw = ({ nativeEvent }) => {
    if (!isDrawing) return;

    const { offsetX, offsetY } = nativeEvent;

    // Draw on local canvas
    contextRef.current.lineTo(offsetX, offsetY);
    contextRef.current.stroke();

    // Add to buffer for batched sending with type information
    pointsBuffer.current.push({ type: 'move', x: offsetX, y: offsetY });

    // For backward compatibility, also send individual move event
    channelRef.current.send({
      type: 'broadcast',
      event: 'draw',
      payload: {
        userId: userId.current,
        type: 'move',
        x: offsetX,
        y: offsetY,
        color: currentColor
      }
    });

    // Add to current path
    currentPathRef.current.push({ type: 'move', x: offsetX, y: offsetY });
  };

  const stopDrawing = async () => {
    contextRef.current.closePath();
    setIsDrawing(false);

    // Send any remaining points
    sendBatchedPoints();

    // Clear the batch timer
    if (batchTimerRef.current) {
      clearInterval(batchTimerRef.current);
      batchTimerRef.current = null;
    }

    // Persist the stroke to backend API if there's a path
    if (currentPathRef.current.length > 0) {
      strokesStoreRef.current.push({ points: [...currentPathRef.current], color: currentColor });
      try {
        const response = await fetch(`${API_BASE_URL}/strokes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            room_id: parseInt(roomId), // Ensure bigint as number
            strokes: currentPathRef.current,
            color: currentColor,
            // created_by: session?.user?.id // Add if using auth
          })
        });
        if (!response.ok) throw new Error('Failed to save stroke');
      } catch (error) {
        console.error('Error saving stroke:', error);
      }
    }

    // Reset current path
    currentPathRef.current = [];
  };

  const clearCanvas = async () => {
    const canvas = canvasRef.current;
    const context = contextRef.current;

    // Clear the entire canvas locally
    context.clearRect(0, 0, canvas.width, canvas.height);

    // Delete all strokes for this room via backend API
    try {
      const response = await fetch(`${API_BASE_URL}/strokes/${roomId}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error('Failed to clear strokes');
    } catch (error) {
      console.error('Error clearing strokes:', error);
    }

    // Broadcast clear event
    channelRef.current.send({
      type: 'broadcast',
      event: 'clear',
      payload: {
        userId: userId.current
      }
    });
  };

  const saveImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const tempCanvas = document.createElement('canvas');
    const tempContext = tempCanvas.getContext('2d');

    tempCanvas.width = canvas.width / 2;
    tempCanvas.height = canvas.height / 2;

    tempContext.fillStyle = WHITEBOARD_BG_COLOR;
    tempContext.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

    tempContext.drawImage(canvas, 0, 0, tempCanvas.width, tempCanvas.height);

    const image = tempCanvas.toDataURL('image/png');

    const link = document.createElement('a');
    link.href = image;
    link.download = `whiteboard-${roomId}-${Date.now()}.png`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Color selection
  const colors = ['#3ecf8e', '#f43f5e', '#60a5fa', '#a78bfa', '#ffffff'];

  const selectColor = (color) => {
    setCurrentColor(color);
  };

  return (
    <div className="flex flex-col h-screen bg-neutral-900 text-white antialiased relative">
      {/* Toolbar - Positioned at top-right, using bg-neutral-800/70 for a nice visual */}
      <div className="flex items-center gap-4 absolute top-4 right-4 z-10 p-2 bg-neutral-800/70 backdrop-blur-sm rounded-lg shadow-xl">

        {/* Clear Canvas Button (Left of Color Palette) */}
        <button
          onClick={clearCanvas}
          className="p-2 hover:bg-neutral-700 text-neutral-400 hover:text-white rounded-full transition-colors"
          title="Clear Canvas"
        >
          <Trash2 strokeWidth={1.5} size={16} />
        </button>

        {/* Color Palette (Center) */}
        <div className="flex gap-2">
          {colors.map((color) => (
            <div
              key={color}
              className={`w-6 h-6 rounded-full cursor-pointer border-2 ${color === currentColor ? 'border-neutral-300' : 'border-transparent'
                } hover:scale-110 transition-transform`}
              style={{ backgroundColor: color }}
              onClick={() => selectColor(color)}
              title={color}
            />
          ))}
        </div>

        {/* Save Image Button (Right of Color Palette) */}
        <button
          onClick={saveImage}
          className="p-2 text-neutral-400 hover:bg-neutral-700 hover:text-white rounded-full transition-colors"
          title="Save Image (PNG)"
        >
          <Save strokeWidth={1.5} size={16} />
        </button>

        {/* Active Users (Removed section remains commented out) */}
        {/* ... */}
      </div>

      {/* Main content (Canvas) */}
      <div className="flex-1 h-full overflow-hidden">
        <div className="w-full h-full">
          <canvas
            ref={canvasRef}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            className="w-full h-full cursor-crosshair touch-none bg-neutral-900 shrink-0"
          />
        </div>
      </div>
    </div>
  );
}