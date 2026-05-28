import React, { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useNavigate } from 'react-router-dom';

const Home = () => {
  const navigate = useNavigate();
  const [roomId, setRoomId] = useState("");
  // State for the "flash" validation effect
  const [inputError, setInputError] = useState(false);

  const createRoom = () => {
    const id = uuidv4();
    navigate(`/${id}`);
  };

  const joinRoom = () => {
    if(!roomId.trim()) {
        // Trigger the border flash
        setInputError(true);
        setTimeout(() => setInputError(false), 200); 
        return;
    }
    navigate(`/${roomId}`);
  };

  return (
    <div className="flex items-center justify-center h-screen font-sans">
      <div 
        className="bg-white p-10 rounded-xl shadow-xl w-full max-w-sm border border-gray-200 relative flex flex-col"
        style={{ height: '480px' }}
      >
        
        {/* Branding - Moved down (mt-12) */}
        <div className="text-center mt-12">
            <h1 className="text-5xl font-black tracking-tighter mb-1">Collaborate.</h1>
            <p className="text-gray-400 text-xs uppercase tracking-widest font-semibold">Real-time Shared Whiteboard</p>
        </div>

        {/* Spacer - Pushes everything below it to the bottom */}
        <div className="flex-grow"></div>

        {/* Bottom Control Group - Gap ensures symmetrical spacing around divider */}
        <div className="flex flex-col gap-5">
            {/* Option 1: Create - Moved down */}
            <div>
                <button onClick={createRoom} className="btn-primary">
                    New Session
                </button>
            </div>

            {/* Divider - Symmetrical spacing handled by parent 'gap-5' */}
            <div className="relative flex items-center">
                <div className="flex-grow border-t border-gray-200"></div>
                <span className="flex-shrink mx-4 text-gray-300 text-[10px] uppercase tracking-widest font-bold">Or Join</span>
                <div className="flex-grow border-t border-gray-200"></div>
            </div>

            {/* Option 2: Join - Kept at bottom */}
            <div className="flex flex-col gap-4">
                <input 
                    type="text" 
                    placeholder="Paste Room ID"
                    className={`input-field text-center font-mono text-sm ${inputError ? 'border-black ring-1 ring-black' : ''}`}
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value)}
                />
                <button onClick={joinRoom} className="btn-secondary">
                    Join Session
                </button>
            </div>
        </div>

      </div>
    </div>
  );
};

export default Home;