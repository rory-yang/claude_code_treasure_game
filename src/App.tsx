import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Button } from './components/ui/button';
import { AuthScreen } from './components/AuthScreen';
import { ScoreHistory } from './components/ScoreHistory';
import { fetchSession, saveScore, signOut, type Session, type Stats, type User } from './api';
import closedChest from './assets/treasure_closed.png';
import treasureChest from './assets/treasure_opened.png';
import skeletonChest from './assets/treasure_opened_skeleton.png';
import keyIcon from './assets/key.png';
import chestOpenSound from './audios/chest_open.mp3';
import evilLaughSound from './audios/chest_open_with_evil_laugh.mp3';

interface Box {
  id: number;
  isOpen: boolean;
  hasTreasure: boolean;
}

// Guests play without any data being stored; signed-in users get their scores saved to SQLite
type Player = { kind: 'guest' } | { kind: 'user'; user: User };
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export default function App() {
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [score, setScore] = useState(0);
  const [gameEnded, setGameEnded] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [player, setPlayer] = useState<Player | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');

  const initializeGame = () => {
    // Randomly assign treasure to one box
    const treasureBoxIndex = Math.floor(Math.random() * 3);
    const newBoxes: Box[] = Array.from({ length: 3 }, (_, index) => ({
      id: index,
      isOpen: false,
      hasTreasure: index === treasureBoxIndex,
    }));
    
    setBoxes(newBoxes);
    setScore(0);
    setGameEnded(false);
    setSaveStatus('idle');
  };

  // Initialize game and restore an existing login session when component mounts
  useEffect(() => {
    initializeGame();
    fetchSession()
      .then((session) => {
        if (session.user) {
          setPlayer({ kind: 'user', user: session.user });
          setStats(session.stats);
        }
      })
      // API unreachable (e.g. static hosting): fall back to the auth screen, guest mode still works
      .catch(() => {})
      .finally(() => setSessionChecked(true));
  }, []);

  // Save the final score once per finished game, only for signed-in players
  useEffect(() => {
    if (!gameEnded || player?.kind !== 'user') return;
    setSaveStatus('saving');
    saveScore(score)
      .then(({ stats }) => {
        setStats(stats);
        setSaveStatus('saved');
      })
      .catch(() => setSaveStatus('error'));
  }, [gameEnded]);

  // Start a fresh game as a signed-in user. Input: session returned by sign in / sign up. Output: none
  const handleAuthenticated = (session: Session) => {
    if (!session.user) return;
    setPlayer({ kind: 'user', user: session.user });
    setStats(session.stats);
    initializeGame();
  };

  // Start a fresh game in guest mode (nothing is sent to the server). Output: none
  const handlePlayAsGuest = () => {
    setPlayer({ kind: 'guest' });
    setStats(null);
    initializeGame();
  };

  // Sign out (if signed in) and return to the auth screen. Output: none
  const handleLeave = async () => {
    if (player?.kind === 'user') await signOut().catch(() => {});
    setPlayer(null);
    setStats(null);
    initializeGame();
  };

  const openBox = (boxId: number) => {
    if (gameEnded) return;

    // Play the chest opening sound only when a closed box is clicked (evil laugh for skeleton)
    const targetBox = boxes.find(box => box.id === boxId);
    if (targetBox && !targetBox.isOpen) {
      new Audio(targetBox.hasTreasure ? chestOpenSound : evilLaughSound).play();
    }

    setBoxes(prevBoxes => {
      const updatedBoxes = prevBoxes.map(box => {
        if (box.id === boxId && !box.isOpen) {
          const newScore = box.hasTreasure ? score + 100 : score - 50;
          setScore(newScore);
          return { ...box, isOpen: true };
        }
        return box;
      });
      
      // Check if treasure is found or all boxes are opened
      const treasureFound = updatedBoxes.some(box => box.isOpen && box.hasTreasure);
      const allOpened = updatedBoxes.every(box => box.isOpen);
      if (treasureFound || allOpened) {
        setGameEnded(true);
      }
      
      return updatedBoxes;
    });
  };

  const resetGame = () => {
    initializeGame();
  };

  if (!sessionChecked) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-amber-50 to-amber-100 flex items-center justify-center text-amber-800">
        Loading…
      </div>
    );
  }

  if (!player) {
    return <AuthScreen onAuthenticated={handleAuthenticated} onPlayAsGuest={handlePlayAsGuest} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-amber-100 flex flex-col items-center justify-center p-8">
      {/* Who is playing, with sign out (user) or sign in (guest) */}
      <div className="flex flex-wrap items-center justify-center gap-3 mb-4 text-sm text-amber-800">
        {player.kind === 'user' ? (
          <span>Signed in as <strong>{player.user.username}</strong></span>
        ) : (
          <span>Playing as Guest — scores are not saved</span>
        )}
        <Button size="sm" variant="outline" onClick={handleLeave}>
          {player.kind === 'user' ? 'Sign Out' : 'Sign In'}
        </Button>
      </div>

      <div className="text-center mb-8">
        <h1 className="text-4xl mb-4 text-amber-900">🏴‍☠️ Treasure Hunt Game 🏴‍☠️</h1>
        <p className="text-amber-800 mb-4">
          Click on the treasure chests to discover what's inside!
        </p>
        <p className="text-amber-700 text-sm">
          💰 Treasure: +$100 | 💀 Skeleton: -$50
        </p>
      </div>

      <div className="mb-8">
        <div className="text-2xl text-center p-4 bg-amber-200/80 backdrop-blur-sm rounded-lg shadow-lg border-2 border-amber-400">
          <span className="text-amber-900">Current Score: </span>
          <span className={`${score >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            ${score}
          </span>

          {/* Show win / tie / loss below the current score based on the final score */}
          {gameEnded && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="mt-2"
            >
              <span className="text-amber-900">Result: </span>
              <span className={score > 0 ? 'text-green-600' : score === 0 ? 'text-amber-600' : 'text-red-600'}>
                {score > 0 ? 'Win' : score === 0 ? 'Tie' : 'Loss'}
              </span>
            </motion.div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
            {boxes.map((box) => (
              <motion.div
                key={box.id}
                className="flex flex-col items-center cursor-pointer"
                // Use the key icon as cursor while hovering a closed chest
                style={box.isOpen ? undefined : { cursor: `url(${keyIcon}) 24 24, pointer` }}
                whileHover={{ scale: box.isOpen ? 1 : 1.05 }}
                whileTap={{ scale: box.isOpen ? 1 : 0.95 }}
                onClick={() => openBox(box.id)}
              >
                <motion.div
                  initial={{ rotateY: 0 }}
                  animate={{ 
                    rotateY: box.isOpen ? 180 : 0,
                    scale: box.isOpen ? 1.1 : 1
                  }}
                  transition={{ 
                    duration: 0.6,
                    ease: "easeInOut"
                  }}
                  className="relative"
                >
                  <img
                    src={box.isOpen 
                      ? (box.hasTreasure ? treasureChest : skeletonChest)
                      : closedChest
                    }
                    alt={box.isOpen 
                      ? (box.hasTreasure ? "Treasure!" : "Skeleton!")
                      : "Treasure Chest"
                    }
                    className="w-48 h-48 object-contain drop-shadow-lg"
                  />
                  
                  {box.isOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3, duration: 0.5 }}
                      className="absolute -top-8 left-1/2 transform -translate-x-1/2"
                    >
                      {box.hasTreasure ? (
                        <div className="text-2xl animate-bounce">✨💰✨</div>
                      ) : (
                        <div className="text-2xl animate-pulse">💀👻💀</div>
                      )}
                    </motion.div>
                  )}
                </motion.div>
                
                <div className="mt-4 text-center">
                  {box.isOpen ? (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.4, duration: 0.3 }}
                      className={`text-lg p-2 rounded-lg ${
                        box.hasTreasure 
                          ? 'bg-green-100 text-green-800 border border-green-300' 
                          : 'bg-red-100 text-red-800 border border-red-300'
                      }`}
                    >
                      {box.hasTreasure ? '+$100' : '-$50'}
                    </motion.div>
                  ) : (
                    <div className="text-amber-700 p-2">
                      Click to open!
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
      </div>

      {gameEnded && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="text-center"
            >
              <div className="mb-4 p-6 bg-amber-200/80 backdrop-blur-sm rounded-xl shadow-lg border-2 border-amber-400">
                <h2 className="text-2xl mb-2 text-amber-900">Game Over!</h2>
                <p className="text-lg text-amber-800">
                  Final Score: <span className={`${score >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ${score}
                  </span>
                </p>
                <p className="text-sm text-amber-600 mt-2">
                  {boxes.some(box => box.isOpen && box.hasTreasure) 
                    ? 'Treasure found! Well done, treasure hunter! 🎉' 
                    : 'No treasure found this time! Better luck next time! 💀'}
                </p>
                {player.kind === 'user' && saveStatus !== 'idle' && (
                  <p className={`text-xs mt-2 ${saveStatus === 'error' ? 'text-red-600' : 'text-amber-700'}`}>
                    {saveStatus === 'saving' && 'Saving score…'}
                    {saveStatus === 'saved' && 'Score saved to your account ✓'}
                    {saveStatus === 'error' && 'Could not save your score.'}
                  </p>
                )}
              </div>
              
              <Button 
                onClick={resetGame}
                className="text-lg px-8 py-4 bg-amber-600 hover:bg-amber-700 text-white"
              >
                Play Again
              </Button>
            </motion.div>
          )}

      {player.kind === 'user' && stats && (
        <div className="w-full flex justify-center mt-4">
          <ScoreHistory stats={stats} />
        </div>
      )}
    </div>
  );
}
