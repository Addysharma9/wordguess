import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Trophy, Users, Clock, Star, Zap, Crown, Target, Award } from 'lucide-react';

// FIXED: Proper WebSocket URL configuration
const getWebSocketURL = () => {
  if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return 'wss://wordmaster-backend-production-d0fb.up.railway.app';
  }
  return 'ws://wordmaster-backend-production-d0fb.up.railway.app';
};

const WEBSOCKET_URL = getWebSocketURL();

console.log('🔗 WebSocket URL:', WEBSOCKET_URL);
console.log('🌍 Window location:', window.location.hostname);

function App() {
  // Game states
  const [gameState, setGameState] = useState('menu');
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [players, setPlayers] = useState([]);
  
  // Game data
  const [gameLetters, setGameLetters] = useState([]);
  const [playerScore, setPlayerScore] = useState(0);
  const [playerWords, setPlayerWords] = useState([]);
  const [opponentWords, setOpponentWords] = useState([]);
  const [allScores, setAllScores] = useState([]);
  const [timeLeft, setTimeLeft] = useState(120);
  const [gameRound, setGameRound] = useState(1);
  const [totalRounds] = useState(3);
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  
  // WebSocket ref
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const maxReconnectAttempts = 5;
  
  // Leaderboard (simple local)
  const [leaderboard, setLeaderboard] = useState([
    { name: 'WordMaster', score: 2450, games: 125, rank: 1 },
    { name: 'LetterLord', score: 2280, games: 98, rank: 2 },
    { name: 'VocabViper', score: 2150, games: 87, rank: 3 },
    { name: 'WordWizard', score: 2040, games: 76, rank: 4 },
    { name: 'AlphaAce', score: 1960, games: 65, rank: 5 },
  ]);
  
  // Utilities
  const formatTime = (s) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  // Test server status on app load
  useEffect(() => {
    const testServer = async () => {
      try {
        console.log('🧪 Testing server connection...');
        const baseUrl = WEBSOCKET_URL.replace('ws://', 'http://').replace('wss://', 'https://');
        const response = await fetch(`${baseUrl}/`);
        const data = await response.json();
        console.log('✅ Server status:', data);
      } catch (error) {
        console.error('❌ Server test failed:', error);
        setError('Server is not responding. Please check if your backend is running.');
      }
    };
    
    testServer();
  }, []);
  
  // FIXED: Handle WebSocket messages with proper score updates
  const handleWebSocketMessage = useCallback((data) => {
    console.log('🎯 Handling message:', data.type, data);
    
    switch (data.type) {
      case 'connected':
        console.log('🎉 Server connected:', data.message);
        break;
        
      case 'room_created':
        console.log('🏠 Room created:', data.roomCode);
        setRoomCode(data.roomCode);
        setPlayerId(data.playerId);
        setIsHost(data.isHost);
        setGameState('lobby');
        setLoading(false);
        break;
        
      case 'room_joined':
        console.log('🚪 Joined room:', data.roomCode);
        setRoomCode(data.roomCode);
        setPlayerId(data.playerId);
        setIsHost(data.isHost);
        setPlayers(data.players);
        setGameState('lobby');
        setLoading(false);
        break;
        
      case 'player_joined':
        console.log('👋 Player joined:', data.playerName);
        setPlayers(data.players);
        break;
        
      case 'player_left':
        console.log('👋 Player left:', data.playerId);
        setPlayers(prev => prev.filter(p => p.id !== data.playerId));
        break;
        
      case 'game_started':
        console.log('🎮 Game started with letters:', data.letters);
        setGameLetters(data.letters || []);
        setGameRound(data.round || 1);
        setTimeLeft(data.timeLimit || 120);
        setGameState('playing');
        // RESET scores for new game
        setPlayerScore(0);
        setPlayerWords([]);
        setOpponentWords([]);
        setAllScores([]);
        break;
        
      case 'player_word_submitted':
        if (data.playerId !== playerId) {
          console.log('📝 Opponent word:', data.word, data.points);
          setOpponentWords(prev => [...prev, {
            word: data.word,
            points: data.points,
            playerName: data.playerName
          }]);
        }
        break;
        
      case 'word_result':
        console.log('✅ Word result:', data.word, data.success, 'Points:', data.points);
        // This is handled in submitWord - don't duplicate here
        break;
        
      // FIXED: New score_update handler for real-time opponent score updates
      case 'score_update':
        console.log('📊 Real-time score update received:', data);
        if (data.scores) {
          setAllScores(data.scores);
        }
        // FIXED: Update players with current scores for real-time display
        if (data.players) {
          setPlayers(prev => {
            return data.players.map(updatedPlayer => {
              // Keep existing player data but update score
              const existingPlayer = prev.find(p => p.id === updatedPlayer.id);
              return existingPlayer ? {
                ...existingPlayer,
                score: updatedPlayer.score,
                wordCount: updatedPlayer.wordCount
              } : updatedPlayer;
            });
          });
        }
        break;
        
      case 'round_ended':
        console.log('⏰ Round ended, starting round:', data.nextRound);
        console.log('📊 Round scores:', data.scores);
        setGameRound(data.nextRound);
        setGameLetters(data.letters || []);
        // FIXED: Update all scores properly
        setAllScores(data.scores || []);
        setTimeLeft(120);
        // DON'T reset player words/score between rounds
        break;
        
      case 'game_finished':
        console.log('🏁 Game finished!');
        setAllScores(data.finalScores || []);
        setGameState('results');
        // Update leaderboard
        const newEntry = { 
          name: playerName || 'Anonymous', 
          score: playerScore, 
          games: 1, 
          rank: leaderboard.length + 1 
        };
        setLeaderboard(prev => {
          const updated = [...prev, newEntry].sort((a, b) => b.score - a.score);
          return updated.map((player, idx) => ({ ...player, rank: idx + 1 }));
        });
        break;
        
      case 'error':
        console.error('❌ Server error:', data.message);
        setError(data.message);
        setLoading(false);
        break;
        
      case 'pong':
        console.log('💓 Pong received');
        break;
        
      default:
        console.log('❓ Unknown message type:', data.type, data);
    }
  }, [playerId, playerName, playerScore, leaderboard]);

  // Enhanced WebSocket connection
  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
      console.log('🔄 WebSocket already connecting/connected, skipping...');
      return;
    }
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    try {
      console.log('🔌 Connecting to WebSocket:', WEBSOCKET_URL);
      wsRef.current = new WebSocket(WEBSOCKET_URL);
      
      const connectionTimeout = setTimeout(() => {
        if (wsRef.current?.readyState !== WebSocket.OPEN) {
          console.log('⏰ Connection timeout after 10 seconds');
          wsRef.current?.close();
        }
      }, 10000);
      
      wsRef.current.onopen = () => {
        console.log('✅ WebSocket connected successfully!');
        clearTimeout(connectionTimeout);
        setConnected(true);
        setError('');
        setReconnectAttempt(0);
      };
      
      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('📨 Received message:', data.type);
          handleWebSocketMessage(data);
        } catch (err) {
          console.error('❌ Failed to parse WebSocket message:', err);
        }
      };
      
      wsRef.current.onclose = (event) => {
        console.log('❌ WebSocket disconnected:', event.code, event.reason);
        clearTimeout(connectionTimeout);
        setConnected(false);
        
        if (event.code !== 1000 && event.code !== 1001 && gameState !== 'menu') {
          if (reconnectAttempt < maxReconnectAttempts) {
            const delay = Math.min(2000 * Math.pow(1.5, reconnectAttempt), 15000);
            console.log(`🔄 Reconnecting in ${delay}ms (attempt ${reconnectAttempt + 1}/${maxReconnectAttempts})`);
            
            setReconnectAttempt(prev => prev + 1);
            reconnectTimeoutRef.current = setTimeout(() => {
              connectWebSocket();
            }, delay);
          }
        }
      };
      
      wsRef.current.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        clearTimeout(connectionTimeout);
        setError('Connection failed. Please check your internet.');
        setConnected(false);
      };
      
    } catch (error) {
      console.error('❌ Failed to create WebSocket connection:', error);
      setError('Unable to connect to server.');
    }
  }, [gameState, reconnectAttempt, handleWebSocketMessage]);
  
  // Send WebSocket message
  const sendMessage = useCallback((message) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('📤 Sending message:', message.type, message);
      wsRef.current.send(JSON.stringify(message));
      return true;
    } else {
      console.log('❌ Cannot send message - not connected');
      setError('Not connected to server. Please wait...');
      return false;
    }
  }, []);
  
  // Create room
  const createRoom = async () => {
    if (!playerName.trim()) return;
    setLoading(true);
    setError('');
    
    console.log('🏠 Creating room for player:', playerName.trim());
    
    if (!connected) {
      connectWebSocket();
      const maxWait = 6000;
      const startTime = Date.now();
      
      while (!connected && Date.now() - startTime < maxWait) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      if (!connected) {
        setError('Could not connect to server. Please try again.');
        setLoading(false);
        return;
      }
    }
    
    const success = sendMessage({
      type: 'create_room',
      playerName: playerName.trim()
    });
    
    if (!success) {
      setLoading(false);
      return;
    }
    
    setTimeout(() => {
      if (loading && gameState === 'menu') {
        setLoading(false);
        setError('No response from server. Please try again.');
      }
    }, 8000);
  };
  
  // Join room
  const joinRoom = async () => {
    if (!playerName.trim() || !roomCode.trim()) return;
    setLoading(true);
    setError('');
    
    console.log('🚪 Attempting to join room:', roomCode.trim().toUpperCase());
    
    if (!connected) {
      connectWebSocket();
      const maxWait = 6000;
      const startTime = Date.now();
      
      while (!connected && Date.now() - startTime < maxWait) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      if (!connected) {
        setError('Could not connect to server. Please try again.');
        setLoading(false);
        return;
      }
    }
    
    const success = sendMessage({
      type: 'join_room',
      roomCode: roomCode.trim().toUpperCase(),
      playerName: playerName.trim()
    });
    
    if (!success) {
      setLoading(false);
      return;
    }
    
    setTimeout(() => {
      if (loading && gameState === 'menu') {
        setLoading(false);
        setError('Room not found or connection timeout.');
      }
    }, 8000);
  };
  
  // Start game (host only)
  const startGame = useCallback(() => {
    if (isHost) {
      console.log('🎮 Host starting game');
      sendMessage({ type: 'start_game' });
    }
  }, [isHost, sendMessage]);
  
  // FIXED: Submit word with immediate UI update
  const submitWord = useCallback(async (word) => {
    const cleaned = word.trim().toUpperCase();
    if (!cleaned || playerWords.some(w => w.word === cleaned)) {
      return false;
    }
    
    console.log('📝 Submitting word:', cleaned);
    
    return new Promise((resolve) => {
      const originalHandler = wsRef.current.onmessage;
      let resolved = false;
      
      // Temporary message handler to catch word_result
      wsRef.current.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'word_result' && !resolved) {
          resolved = true;
          console.log('📋 Word result received:', data);
          if (data.success) {
            const points = data.points || 0;
            const newWord = { word: cleaned, points, valid: true };
            // FIXED: Immediate UI update
            setPlayerWords(prev => [...prev, newWord]);
            setPlayerScore(prev => {
              const newScore = prev + points;
              console.log('💰 Score updated:', prev, '+', points, '=', newScore);
              return newScore;
            });
          }
          // Restore original handler
          wsRef.current.onmessage = originalHandler;
          resolve(data.success);
        } else {
          // Handle other messages normally
          handleWebSocketMessage(data);
        }
      };
      
      // Send word submission
      const success = sendMessage({
        type: 'submit_word',
        word: cleaned
      });
      
      if (!success) {
        wsRef.current.onmessage = originalHandler;
        resolve(false);
        return;
      }
      
      // Timeout fallback
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          wsRef.current.onmessage = originalHandler;
          resolve(false);
        }
      }, 3000);
    });
  }, [playerWords, sendMessage, handleWebSocketMessage]);
  
  // Timer effect
  useEffect(() => {
    if (gameState !== 'playing' || timeLeft <= 0) return;
    
    const timer = setInterval(() => {
      setTimeLeft(prev => Math.max(0, prev - 1));
    }, 1000);
    
    return () => clearInterval(timer);
  }, [gameState, timeLeft]);
  
  // Enhanced WebSocket initialization
  useEffect(() => {
    let mounted = true;
    let connectionTimeout;
    
    const initConnection = () => {
      if (mounted && !wsRef.current) {
        connectionTimeout = setTimeout(() => {
          if (mounted) {
            connectWebSocket();
          }
        }, 100);
      }
    };
    
    initConnection();
    
    return () => {
      mounted = false;
      clearTimeout(connectionTimeout);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close(1000, 'Component unmounting');
        wsRef.current = null;
      }
    };
  }, []);
  
  // Ping to keep connection alive
  useEffect(() => {
    let pingInterval;
    
    if (connected) {
      pingInterval = setInterval(() => {
        sendMessage({ type: 'ping', timestamp: Date.now() });
      }, 20000);
    }
    
    return () => {
      if (pingInterval) {
        clearInterval(pingInterval);
      }
    };
  }, [connected, sendMessage]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 relative overflow-hidden">
      {/* Background letters */}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute text-white/10 text-6xl font-bold animate-bounce"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 5}s`,
              animationDuration: `${3 + Math.random() * 4}s`
            }}
          >
            {String.fromCharCode(65 + Math.floor(Math.random() * 26))}
          </div>
        ))}
      </div>

      {/* Error banner */}
      {error && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-red-500 text-white px-6 py-3 rounded-lg z-50 max-w-sm text-center">
          {error}
          <button onClick={() => setError('')} className="ml-4 text-white/80 hover:text-white">×</button>
        </div>
      )}

      {/* Connection status */}
      <div className="fixed top-4 right-4 z-50">
        <div className={`flex items-center px-3 py-1 rounded-full text-sm font-medium ${
          connected ? 'bg-green-500/20 text-green-400' : 
          reconnectAttempt > 0 ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'
        }`}>
          <div className={`w-2 h-2 rounded-full mr-2 ${
            connected ? 'bg-green-400' : 
            reconnectAttempt > 0 ? 'bg-yellow-400 animate-pulse' : 'bg-red-400'
          }`}></div>
          {connected ? 'Connected' : 
           reconnectAttempt > 0 ? `Reconnecting... (${reconnectAttempt}/${maxReconnectAttempts})` : 'Disconnected'}
        </div>
      </div>

      {/* Debug Panel */}
      {window.location.hostname === 'localhost' && (
        <div className="fixed bottom-4 left-4 bg-black/80 text-white p-4 rounded-lg text-xs max-w-sm z-50">
          <div className="font-bold mb-2">🔍 Debug Info</div>
          <div>WebSocket URL: {WEBSOCKET_URL}</div>
          <div>Connected: {connected ? '✅' : '❌'}</div>
          <div>Game State: {gameState}</div>
          <div>Player Score: {playerScore}</div>
          <div>Player Words: {playerWords.length}</div>
          <div>Game Letters: {gameLetters.length}</div>
          <div>Players: {players.length}</div>
          <div className="text-yellow-400 mt-2">🎯 Dynamic Dictionary Validation</div>
          {wsRef.current && <div>WS ReadyState: {wsRef.current.readyState}</div>}
        </div>
      )}

      {/* MENU */}
      {gameState === 'menu' && (
        <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
          <div className="text-center max-w-4xl mx-auto">
            <div className="mb-12 animate-pulse">
              <h1 className="text-7xl font-extrabold mb-4 bg-gradient-to-r from-yellow-400 via-red-500 to-pink-500 bg-clip-text text-transparent">
                WordMaster
              </h1>
              <h2 className="text-3xl font-bold text-white/90 mb-2">Multiplayer Arena</h2>
              <p className="text-xl text-white/70">Challenge players worldwide!</p>
              <p className="text-sm text-yellow-400 mt-2">✨ Dynamic Dictionary Validation ✨</p>
            </div>

            <div className="mb-8">
              <input
                type="text"
                placeholder="Enter your name"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                className="w-80 px-6 py-4 text-xl bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-pink-500 transition-all"
                maxLength={20}
              />
            </div>

            <div className="grid md:grid-cols-2 gap-8 mb-12">
              <div className="bg-white/10 backdrop-blur-md rounded-3xl p-8 border border-white/20 hover:bg-white/20 transition-all group">
                <Crown className="w-16 h-16 text-yellow-400 mx-auto mb-4 group-hover:scale-110 transition-transform" />
                <h3 className="text-2xl font-bold text-white mb-4">Create Room</h3>
                <p className="text-white/70 mb-6">Host a new game and invite friends</p>
                <button
                  onClick={createRoom}
                  disabled={!playerName.trim() || loading}
                  className="w-full bg-gradient-to-r from-yellow-400 to-orange-500 text-black font-bold py-4 px-8 rounded-2xl hover:shadow-lg hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Creating...' : 'Create Room'}
                </button>
              </div>

              <div className="bg-white/10 backdrop-blur-md rounded-3xl p-8 border border-white/20 hover:bg-white/20 transition-all group">
                <Users className="w-16 h-16 text-blue-400 mx-auto mb-4 group-hover:scale-110 transition-transform" />
                <h3 className="text-2xl font-bold text-white mb-4">Join Room</h3>
                <input
                  type="text"
                  placeholder="Room Code"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  className="w-full mb-4 px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  maxLength={6}
                />
                <button
                  onClick={joinRoom}
                  disabled={!playerName.trim() || !roomCode.trim() || loading}
                  className="w-full bg-gradient-to-r from-blue-400 to-purple-500 text-white font-bold py-4 px-8 rounded-2xl hover:shadow-lg hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Joining...' : 'Join Room'}
                </button>
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur-md rounded-3xl p-8 border border-white/20">
              <div className="flex items-center justify-center mb-6">
                <Trophy className="w-8 h-8 text-yellow-400 mr-3" />
                <h3 className="text-2xl font-bold text-white">Global Leaderboard</h3>
              </div>
              <div className="space-y-3">
                {leaderboard.slice(0, 5).map((p, i) => (
                  <div key={i} className="flex items-center justify-between bg-white/5 rounded-xl p-4 hover:bg-white/10 transition-all">
                    <div className="flex items-center">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold mr-4 ${
                        i === 0 ? 'bg-yellow-400 text-black' :
                        i === 1 ? 'bg-gray-300 text-black' :
                        i === 2 ? 'bg-yellow-600 text-white' :
                        'bg-white/20 text-white'
                      }`}>{i + 1}</div>
                      <div>
                        <div className="text-white font-semibold">{p.name}</div>
                        <div className="text-white/50 text-sm">{p.games} games</div>
                      </div>
                    </div>
                    <div className="text-yellow-400 font-bold text-lg">{p.score}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* LOBBY */}
      {gameState === 'lobby' && (
        <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
          <div className="text-center max-w-2xl mx-auto">
            <div className="bg-white/10 backdrop-blur-md rounded-3xl p-12 border border-white/20">
              <h2 className="text-4xl font-bold text-white mb-8">Game Lobby</h2>

              <div className="mb-8">
                <div className="text-white/70 mb-2">Room Code:</div>
                <div className="text-4xl font-mono font-bold text-yellow-400 bg-white/10 rounded-xl py-4 px-8 inline-block">
                  {roomCode}
                </div>
              </div>

              <div className="mb-8">
                <div className="text-white/70 text-lg mb-4">
                  {connected ? (
                    <div className="flex items-center justify-center">
                      <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse mr-3"></div>
                      Connected - {players.length} player{players.length !== 1 ? 's' : ''} in room
                    </div>
                  ) : (
                    <div className="flex items-center justify-center">
                      <div className="loading-spinner"></div>
                      <span className="ml-3">Connecting...</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid gap-4 mb-8">
                {players.map((player) => (
                  <div key={player.id} className={`rounded-2xl p-6 border-2 ${
                    player.id === playerId 
                      ? 'bg-green-500/20 border-green-500' 
                      : 'bg-blue-500/20 border-blue-500'
                  }`}>
                    <div className={`font-bold text-lg mb-2 ${
                      player.id === playerId ? 'text-green-400' : 'text-blue-400'
                    }`}>
                      {player.name} {player.isHost && '(Host)'} {player.id === playerId && '(You)'}
                    </div>
                    <Star className={`w-8 h-8 mx-auto mt-4 ${
                      player.id === playerId ? 'text-green-400' : 'text-blue-400'
                    }`} />
                  </div>
                ))}
              </div>

              {isHost && players.length > 1 && (
                <button
                  onClick={startGame}
                  disabled={loading || !connected}
                  className="bg-gradient-to-r from-green-400 to-blue-500 text-white font-bold py-4 px-12 rounded-2xl text-xl hover:shadow-lg hover:scale-105 transition-all disabled:opacity-50 mb-6"
                >
                  {loading ? 'Starting...' : 'Start Game'}
                </button>
              )}

              {!isHost && (
                <div className="text-white/70 text-lg mb-6">
                  Waiting for host to start the game...
                  <div className="animate-pulse mt-4">🎮</div>
                </div>
              )}

              <button 
                onClick={() => {
                  setGameState('menu');
                  setPlayers([]);
                  setPlayerId('');
                  setRoomCode('');
                  setIsHost(false);
                  if (wsRef.current) wsRef.current.close();
                }} 
                className="text-white/70 hover:text-white transition-colors"
              >
                ← Back to Menu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PLAYING */}
      {gameState === 'playing' && (
        <div className="relative z-10 min-h-screen p-4">
          <div className="max-w-7xl mx-auto mb-8">
            <div className="bg-white/10 backdrop-blur-md rounded-3xl p-6 border border-white/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-8">
                  <div className="text-center">
                    <div className="text-white/70 text-sm">Round</div>
                    <div className="text-2xl font-bold text-white">{gameRound}/{totalRounds}</div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <Clock className="w-6 h-6 text-yellow-400" />
                    <div className={`text-3xl font-mono font-bold ${timeLeft <= 30 ? 'text-red-400 animate-pulse' : 'text-white'}`}>
                      {formatTime(timeLeft)}
                    </div>
                  </div>
                </div>

                {/* FIXED: Real-time score display with better layout */}
                <div className="flex items-center space-x-4">
                  {players.map(player => {
                    const isCurrentPlayer = player.id === playerId;
                    // FIXED: Get real-time score from multiple sources
                    let displayScore = 0;
                    if (isCurrentPlayer) {
                      displayScore = playerScore; // Use real-time local score
                    } else {
                      // Try allScores first, then player object
                      const scoreData = allScores.find(s => s.id === player.id);
                      displayScore = scoreData ? scoreData.score : (player.score || 0);
                    }
                    
                    return (
                      <div key={player.id} className={`text-center rounded-2xl px-4 py-3 border-2 min-w-[100px] ${
                        isCurrentPlayer 
                          ? 'bg-green-500/20 border-green-500' 
                          : 'bg-blue-500/20 border-blue-500'
                      }`}>
                        <div className={`font-bold text-xs mb-1 ${
                          isCurrentPlayer ? 'text-green-400' : 'text-blue-400'
                        }`}>
                          {player.name.slice(0, 8)}{isCurrentPlayer ? ' (You)' : ''}
                        </div>
                        <div className="text-2xl font-bold text-white">{displayScore}</div>
                        <div className="text-xs text-white/60">{player.wordCount || 0} words</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="max-w-7xl mx-auto grid lg:grid-cols-3 gap-8">
            {/* Letters + input */}
            <div className="lg:col-span-2">
              {/* FIXED: Better letter grid for 12 letters */}
              <div className="bg-white/10 backdrop-blur-md rounded-3xl p-8 border border-white/20 mb-8">
                <h3 className="text-2xl font-bold text-white mb-6 text-center flex items-center justify-center">
                  <Target className="w-8 h-8 mr-3 text-yellow-400" />
                  Available Letters ({gameLetters.length})
                </h3>
                {/* FIXED: 4x3 grid for 12 letters - perfect layout */}
                <div className="grid grid-cols-4 gap-4 max-w-md mx-auto">
                  {gameLetters.map((letter, idx) => (
                    <div key={idx} className="aspect-square bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center text-3xl font-bold text-white shadow-lg hover:scale-110 transition-all cursor-pointer">
                      {letter}
                    </div>
                  ))}
                </div>
                {/* Show letters count for debugging */}
                <div className="text-center mt-4 text-white/50 text-sm">
                  {gameLetters.length} letters • Dynamic dictionary validation
                </div>
              </div>

              {/* FIXED: Add the WordInput component */}
              <WordInput onSubmit={submitWord} />
            </div>

            {/* Right column */}
            <div className="space-y-6">
              <div className="bg-white/10 backdrop-blur-md rounded-3xl p-6 border border-white/20">
                <h4 className="text-xl font-bold text-green-400 mb-4 flex items-center">
                  <Award className="w-6 h-6 mr-2" />
                  Your Words ({playerWords.length}) - Score: {playerScore}
                </h4>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {playerWords.length === 0 && <div className="text-white/50 text-center py-8">No words found yet...</div>}
                  {playerWords.map((w, i) => (
                    <div key={i} className="bg-green-500/20 rounded-xl p-3 border border-green-500/50 flex justify-between items-center animate-slideIn">
                      <span className="text-white font-semibold">{w.word}</span>
                      <span className="text-green-400 font-bold">+{w.points}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white/10 backdrop-blur-md rounded-3xl p-6 border border-white/20">
                <h4 className="text-xl font-bold text-red-400 mb-4 flex items-center">
                  <Zap className="w-6 h-6 mr-2" />
                  Recent Words ({opponentWords.length})
                </h4>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {opponentWords.length === 0 && <div className="text-white/50 text-center py-8">No opponent words yet...</div>}
                  {opponentWords.slice(-10).map((w, i) => (
                    <div key={i} className="bg-red-500/20 rounded-xl p-3 border border-red-500/50 flex justify-between items-center animate-slideIn">
                      <div>
                        <span className="text-white font-semibold">{w.word}</span>
                        <div className="text-red-300 text-xs">{w.playerName}</div>
                      </div>
                      <span className="text-red-400 font-bold">+{w.points}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white/10 backdrop-blur-md rounded-3xl p-6 border border-white/20">
                <h4 className="text-xl font-bold text-yellow-400 mb-4 flex items-center">
                  <Trophy className="w-6 h-6 mr-2" />
                  Live Stats
                </h4>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-white/70">Words Found:</span>
                    <span className="text-white font-bold">{playerWords.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/70">Current Score:</span>
                    <span className="text-yellow-400 font-bold">{playerScore}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/70">Avg Points/Word:</span>
                    <span className="text-white font-bold">{playerWords.length > 0 ? Math.round(playerScore / playerWords.length) : 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/70">Time Remaining:</span>
                    <span className={`font-bold ${timeLeft <= 30 ? 'text-red-400' : 'text-white'}`}>
                      {formatTime(timeLeft)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* RESULTS */}
      {gameState === 'results' && (
        <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
          <div className="text-center max-w-4xl mx-auto">
            <div className="bg-white/10 backdrop-blur-md rounded-3xl p-12 border border-white/20">
              <div className="mb-12">
                {allScores.length > 0 && allScores[0]?.id === playerId ? (
                  <div className="text-center animate-bounce">
                    <Crown className="w-24 h-24 text-yellow-400 mx-auto mb-4" />
                    <h2 className="text-6xl font-bold text-green-400 mb-4">Victory!</h2>
                    <p className="text-2xl text-white">You won the game!</p>
                  </div>
                ) : (
                  <div className="text-center">
                    <div className="text-6xl mb-4">🏆</div>
                    <h2 className="text-6xl font-bold text-blue-400 mb-4">Game Complete!</h2>
                    <p className="text-2xl text-white">
                      {allScores.length > 0 ? `${allScores[0]?.name} won!` : 'Great game everyone!'}
                    </p>
                  </div>
                )}
              </div>

              <div className="mb-12">
                <h3 className="text-2xl font-bold text-white mb-6">Final Scores</h3>
                <div className="space-y-4">
                  {allScores.map((player, index) => (
                    <div key={player.id} className={`flex items-center justify-between p-4 rounded-xl ${
                      player.id === playerId ? 'bg-green-500/20 border-2 border-green-500' : 'bg-white/10'
                    }`}>
                      <div className="flex items-center">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold mr-4 ${
                          index === 0 ? 'bg-yellow-400 text-black' :
                          index === 1 ? 'bg-gray-300 text-black' :
                          index === 2 ? 'bg-yellow-600 text-white' :
                          'bg-white/20 text-white'
                        }`}>{index + 1}</div>
                        <div>
                          <div className="text-white font-semibold">
                            {player.name} {player.id === playerId && '(You)'}
                          </div>
                          <div className="text-white/50 text-sm">{player.words?.length || 0} words</div>
                        </div>
                      </div>
                      <div className="text-yellow-400 font-bold text-2xl">{player.score}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-center space-x-6">
                <button onClick={() => {
                  setGameState('menu');
                  setPlayerScore(0);
                  setPlayerWords([]);
                  setOpponentWords([]);
                  setAllScores([]);
                  setGameRound(1);
                  setPlayers([]);
                  setPlayerId('');
                  setRoomCode('');
                  setIsHost(false);
                  if (wsRef.current) wsRef.current.close();
                }} className="bg-white/10 border border-white/20 text-white font-bold py-4 px-8 rounded-2xl hover:bg-white/20 transition-all">
                  Main Menu
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Custom CSS */}
      <style>{`
        @keyframes slideIn { from { opacity:0; transform:translateX(-20px)} to {opacity:1; transform:translateX(0)} }
        @keyframes fadeIn { from { opacity:0; transform:translateY(20px)} to {opacity:1; transform:translateY(0)} }
        @keyframes pulse { 0%,100%{transform:scale(1)}50%{transform:scale(1.05)} }
        .animate-slideIn{ animation: slideIn 0.45s ease-out }
        .animate-fadeIn{ animation: fadeIn 0.6s ease-out }
        .animate-pulse{ animation: pulse 2s infinite }
        .scroll-smooth{ scroll-behavior: smooth }
        ::-webkit-scrollbar{ width: 8px }
        ::-webkit-scrollbar-track{ background: rgba(255,255,255,0.1); border-radius:4px }
        ::-webkit-scrollbar-thumb{ background: rgba(255,255,255,0.3); border-radius:4px }
        ::-webkit-scrollbar-thumb:hover{ background: rgba(255,255,255,0.5) }
        @keyframes spin { 0%{transform:rotate(0)}100%{transform:rotate(360deg)} }
        .loading-spinner{ border: 4px solid rgba(255,255,255,0.3); border-radius:50%; border-top:4px solid white; width:40px;height:40px; animation: spin 2s linear infinite; margin: 20px auto; }
      `}</style>
    </div>
  );
}

// WordInput component
const WordInput = ({ onSubmit }) => {
  const [word, setWord] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState('');

  const handleSubmit = async (e) => {
    e && e.preventDefault();
    if (!word.trim() || isSubmitting) return;
    
    setIsSubmitting(true);
    const ok = await onSubmit(word.trim());
    
    if (ok) {
      setFeedback(`✅ +${word.trim().length * 10} points!`);
      setWord('');
    } else {
      setFeedback('❌ Invalid word or already used');
    }
    
    setTimeout(() => {
      setFeedback('');
      setIsSubmitting(false);
    }, 1500);
  };

  return (
    <div className="bg-white/10 backdrop-blur-md rounded-3xl p-8 border border-white/20">
      <h3 className="text-2xl font-bold text-white mb-6 text-center">Make a Word</h3>
      <p className="text-center text-yellow-400 text-sm mb-4">🎯 Dynamic Dictionary Validation</p>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="relative">
          <input
            type="text"
            value={word}
            onChange={(e) => setWord(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
            placeholder="Type your word here..."
            className="w-full px-6 py-4 text-2xl font-bold bg-white/10 border border-white/20 rounded-2xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-center"
            maxLength={20}
            disabled={isSubmitting}
          />
          {feedback && (
            <div className={`absolute -bottom-8 left-1/2 transform -translate-x-1/2 text-lg font-bold ${feedback.includes('✅') ? 'text-green-400' : 'text-red-400'} animate-bounce`}>
              {feedback}
            </div>
          )}
        </div>

        <div className="text-center space-y-4">
          <button
            type="submit"
            disabled={word.length < 3 || isSubmitting}
            className="bg-gradient-to-r from-green-400 to-blue-500 text-white font-bold py-4 px-12 rounded-2xl text-xl hover:shadow-lg hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Checking Dictionary...' : 'Submit Word'}
          </button>

          <div className="text-white/70">
            <div className="text-sm">Minimum 3 letters • 10 points per letter</div>
            <div className="text-xs text-yellow-400 mt-1">Validated against real dictionaries</div>
            {word && <div className="text-lg font-bold text-yellow-400 mt-2">Potential: +{word.length * 10} points</div>}
          </div>
        </div>
      </form>
    </div>
  );
};

export default App;
