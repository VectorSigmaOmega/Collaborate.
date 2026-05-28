import React, { useRef, useState, useEffect, useLayoutEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';
import { Trash2, LogOut, Undo2, Redo2 } from 'lucide-react';

const socket = io.connect(import.meta.env.VITE_SERVER_URL || "http://localhost:5000");

// ... (Keep getUserColor and CopyButton helper functions exactly as they were) ...
const getUserColor = () => {
    const h = Math.floor(Math.random() * 360);
    return `hsl(${h}, 100%, 50%)`;
};
const CopyButton = ({ textToCopy, className = "" }) => {
    const [copied, setCopied] = useState(false);
    
    const handleCopy = async () => {
    const text = textToCopy;
    if (navigator.clipboard && window.isSecureContext) {
            // Use modern API if available
            await navigator.clipboard.writeText(text);
            setCopied(true);
        } else {
            // Fallback for HTTP/Non-secure contexts
            const textArea = document.createElement("textarea");
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                setCopied(true);
            } catch (err) {
                console.error('Fallback copy failed', err);
            }
            document.body.removeChild(textArea);
        }
        setTimeout(() => setCopied(false), 1000);
    };

    return (
        <button onClick={handleCopy} className={`transition-all hover:scale-110 active:scale-95 ${className}`}>
            {copied ? (
                <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            ) : (
                <svg className="w-5 h-5 text-gray-400 hover:text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            )}
        </button>
    );
};

const Whiteboard = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  
  const canvasRef = useRef(null);
  const ctxRef = useRef(null);
  
  const [joined, setJoined] = useState(false);
  const [userName, setUserName] = useState("");
  const [usersList, setUsersList] = useState([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [userColor] = useState(getUserColor());
  
  // UX STATES
  const [inputError, setInputError] = useState(false); // For red flash
  const [errorType, setErrorType] = useState(""); 
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const lastPos = useRef({ x: 0, y: 0 });
  const currentStrokeId = useRef(null);
  const batchRef = useRef([]); 

  useLayoutEffect(() => {
    if (!joined) return;
    const canvas = canvasRef.current;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx = canvas.getContext('2d');
    ctx.lineCap = "round";
    ctx.lineWidth = 3;
    ctx.strokeStyle = userColor;
    ctxRef.current = ctx;

    const handleResize = () => {
       canvas.width = window.innerWidth;
       canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [joined, userColor]);

  useEffect(() => {
    if(!joined) return;
    const interval = setInterval(() => {
        if (batchRef.current.length > 0) {
            socket.emit("draw_batch", { roomId, batch: batchRef.current });
            batchRef.current = []; 
        }
    }, 60);
    return () => clearInterval(interval);
  }, [joined, roomId]);

  useEffect(() => {
    // We listen for join errors BEFORE we are strictly "joined" in the UI sense
    socket.on("join_error", () => {
        setJoined(false);
        setErrorType("DUPLICATE"); 
        setInputError(true); // Trigger red flash
        setTimeout(() => {
            setInputError(false);
            setErrorType("");
        }, 200);
    });

    if (!joined) return;

    const drawLine = (item) => {
        if(!ctxRef.current) return;
        const ctx = ctxRef.current;
        const originalColor = ctx.strokeStyle;
        ctx.strokeStyle = item.color;
        ctx.beginPath();
        ctx.moveTo(item.prevX, item.prevY);
        ctx.lineTo(item.currX, item.currY);
        ctx.stroke();
        ctx.strokeStyle = originalColor;
    };

    socket.on("load_history", (history) => history.forEach(drawLine));
    socket.on("draw_batch", (batch) => batch.forEach(drawLine));
    
    socket.on("refresh_board", (fullHistory) => {
        const canvas = canvasRef.current;
        const ctx = ctxRef.current;
        if (canvas && ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            fullHistory.forEach(drawLine);
        }
    });

    socket.on("update_users", (data) => setUsersList(data));
    
    // NEW: Listen for button states
    socket.on("interaction_state", ({ canUndo, canRedo }) => {
        setCanUndo(canUndo);
        setCanRedo(canRedo);
    });

    socket.on("room_full", () => {
        alert("Room is full!");
        setJoined(false);
        navigate('/');
    });
    
    return () => {
        socket.off("draw_batch");
        socket.off("refresh_board");
        socket.off("update_users");
        socket.off("load_history");
        socket.off("room_full");
        socket.off("join_error");
        socket.off("interaction_state");
    };
  }, [joined, navigate]);

  const joinRoom = () => {
    if (userName.trim() === "") {
        setErrorType("EMPTY"); 
        setInputError(true);
        setTimeout(() => {
            setInputError(false);
            setErrorType("");
        }, 200);
        return;
    }
    // Optimistically set joined, but server might reject with "join_error"
    setJoined(true); 
    socket.emit("join_room", { name: userName, color: userColor, roomId });
  };

  const startDrawing = ({ nativeEvent }) => {
    if (nativeEvent.button !== 0) return;
    const { offsetX, offsetY } = nativeEvent;
    
    ctxRef.current.strokeStyle = userColor;
    ctxRef.current.beginPath();
    ctxRef.current.moveTo(offsetX, offsetY);
    
    lastPos.current = { x: offsetX, y: offsetY };
    currentStrokeId.current = uuidv4(); 
    setIsDrawing(true);
  };

  const draw = ({ nativeEvent }) => {
    if (!isDrawing) return;
    const { offsetX, offsetY } = nativeEvent;
    
    ctxRef.current.lineTo(offsetX, offsetY);
    ctxRef.current.stroke();

    batchRef.current.push({
      prevX: lastPos.current.x,
      prevY: lastPos.current.y,
      currX: offsetX,
      currY: offsetY,
      color: userColor,
      strokeId: currentStrokeId.current 
    });

    lastPos.current = { x: offsetX, y: offsetY };
  };

  const stopDrawing = () => {
    if (ctxRef.current) ctxRef.current.closePath();
    setIsDrawing(false);
  };
  
  const undo = () => canUndo && socket.emit("undo", { roomId });
  const redo = () => canRedo && socket.emit("redo", { roomId });
  const clearMyCanvas = () => socket.emit("clear_my_canvas", roomId);

  if (!joined) {
      return (
        <div className="flex items-center justify-center h-screen font-sans">
        <div className="bg-white p-10 rounded-xl shadow-xl w-full max-w-sm border border-gray-200 flex flex-col justify-between relative" style={{ height: '480px' }}>
            <button onClick={() => navigate('/')} className="absolute top-5 left-5 text-gray-400 hover:text-black transition-colors">
                <svg width="28" height="28" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.5 15L7.5 10L12.5 5" /></svg>
            </button>
            <div className="text-center mt-8">
                <h1 className="text-3xl font-bold mb-2 text-gray-800">Join Room</h1>
                <div className="bg-gray-100 p-2 rounded flex justify-between items-center">
                    <span className="text-xs font-mono text-gray-500">{roomId}</span>
                    <CopyButton textToCopy={roomId} />
                </div>
            </div>
            <div className="text-center">
                <div className="w-16 h-16 rounded-full mx-auto mb-2 border-4 border-gray-200 shadow-inner" style={{ backgroundColor: userColor }}></div>
                <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Your Color</p>
            </div>
            <div className="flex flex-col gap-3">
                <input 
                    type="text" 
                    placeholder="Enter your Name" 
                    className={`
                        input-field text-center font-mono text-sm transition-all duration-75
                        ${inputError && errorType === "EMPTY" ? 'border-black ring-1 ring-black' : ''}
                        ${inputError && errorType === "DUPLICATE" ? 'border-red-500 ring-2 ring-red-500 animate-pulse text-red-500' : ''}
                    `}
                    value={userName} 
                    onChange={(e) => setUserName(e.target.value)} 
                    onKeyDown={(e) => e.key === 'Enter' && joinRoom()} 
                />
                <button onClick={joinRoom} className="btn-primary">Enter Room</button>
            </div>
        </div>
      </div>
      );
  }

  return (
    <div className="relative w-full h-screen overflow-hidden">
      <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-white px-6 py-2 rounded-full shadow-xl border border-gray-200 z-50 flex gap-4 items-center">
        <div className="w-6 h-6 rounded-full border border-gray-300" style={{ backgroundColor: userColor }}></div>
        <div className="border-l border-gray-300 h-6"></div>
        
        {/* Undo Button with Dynamic Styling */}
        <button 
            className={`p-2 rounded-full font-bold transition-colors ${canUndo ? 'hover:bg-gray-100 text-gray-600' : 'text-gray-300 cursor-not-allowed'}`} 
            onClick={undo} 
            disabled={!canUndo}
            title="Undo"
        >
            <Undo2 size={20} />
        </button>
        
        {/* Redo Button with Dynamic Styling */}
        <button 
            className={`p-2 rounded-full font-bold transition-colors ${canRedo ? 'hover:bg-gray-100 text-gray-600' : 'text-gray-300 cursor-not-allowed'}`} 
            onClick={redo} 
            disabled={!canRedo}
            title="Redo"
        >
            <Redo2 size={20} />
        </button>
        
        <div className="border-l border-gray-300 h-6"></div>
        <button 
            className="p-2 hover:bg-red-50 text-red-500 rounded-full transition-colors" 
            onClick={clearMyCanvas}
            title="Clear My Lines"
        >
            <Trash2 size={20} />
        </button>
        <div className="border-l border-gray-300 h-6"></div>
        <button 
            className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors" 
            onClick={() => navigate('/')}
            title="Exit Session"
        >
            <LogOut size={20} />
        </button>
      </div>

      {/* Online Users List */}
      <div className="fixed top-4 left-4 bg-white/90 backdrop-blur-sm p-4 rounded-xl shadow-lg border border-gray-200 z-40">
        <h3 className="font-bold text-gray-500 text-xs uppercase mb-3 tracking-wider">Online ({usersList.length})</h3>
        <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
            {usersList.map((u, index) => (
                <div key={index} className="flex items-center gap-2 text-sm text-gray-700">
                    <span className="w-3 h-3 rounded-full shrink-0" style={{backgroundColor: u.color}}></span>
                    <span className="truncate max-w-25">{u.name} {u.name === userName ? "(You)" : ""}</span>
                </div>
            ))}
        </div>
        <div className="mt-4 pt-3 border-t border-gray-100 flex justify-between items-center">
             <span className="text-xs font-bold text-gray-400 uppercase">Room ID</span>
             <CopyButton textToCopy={roomId} />
        </div>
      </div>

      <canvas
        ref={canvasRef}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onContextMenu={(e) => e.preventDefault()} 
        className="absolute top-0 left-0 cursor-crosshair touch-none"
      />
    </div>
  );
};

export default Whiteboard;