import { useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { signIn, signUp, type Session } from '../api';

type Mode = 'signin' | 'signup';

interface AuthScreenProps {
  onAuthenticated: (session: Session) => void;
  onPlayAsGuest: () => void;
}

// Sign in / sign up form with a guest option. Input: callbacks for a successful login and for guest play. Output: auth screen UI
export function AuthScreen({ onAuthenticated, onPlayAsGuest }: AuthScreenProps) {
  const [mode, setMode] = useState<Mode>('signin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Switch between the sign in and sign up tabs. Input: target mode. Output: none
  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
  };

  // Submit the form to the matching endpoint. Input: form submit event. Output: none (calls onAuthenticated on success)
  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const session = mode === 'signin' ? await signIn(username, password) : await signUp(username, password);
      onAuthenticated(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setSubmitting(false);
    }
  };

  const tabClass = (tab: Mode) =>
    `flex-1 py-2 rounded-md text-sm font-medium ${
      mode === tab ? 'bg-amber-600 text-white shadow-md' : 'text-amber-800 hover:underline'
    }`;

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-amber-100 flex flex-col items-center justify-center p-8">
      <div className="text-center mb-8">
        <h1 className="text-4xl mb-4 text-amber-900">🏴‍☠️ Treasure Hunt Game 🏴‍☠️</h1>
        <p className="text-amber-800">Sign in to keep your scores, or jump straight in as a guest.</p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full p-6 bg-amber-200/80 backdrop-blur-sm rounded-xl shadow-lg border-2 border-amber-400"
        style={{ maxWidth: '24rem' }}
      >
        <div className="flex gap-2 mb-4">
          <button type="button" className={tabClass('signin')} onClick={() => switchMode('signin')}>
            Sign In
          </button>
          <button type="button" className={tabClass('signup')} onClick={() => switchMode('signup')}>
            Sign Up
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="username" className="text-amber-900">Username</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
            {mode === 'signup' && (
              <span className="text-xs text-amber-700">3-20 letters, numbers or underscores</span>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="password" className="text-amber-900">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              required
            />
            {mode === 'signup' && <span className="text-xs text-amber-700">At least 6 characters</span>}
          </div>

          {error && (
            <div role="alert" className="text-sm p-2 rounded-md bg-red-100 text-red-800 border border-red-300">
              {error}
            </div>
          )}

          <Button type="submit" disabled={submitting} className="w-full bg-amber-600 hover:bg-amber-700 text-white">
            {submitting ? 'Please wait…' : mode === 'signin' ? 'Sign In' : 'Create Account'}
          </Button>
        </form>

        <div className="text-center text-sm text-amber-700 mt-4 mb-4">or</div>

        <Button type="button" variant="outline" onClick={onPlayAsGuest} className="w-full">
          Play as Guest
        </Button>
        <p className="text-xs text-amber-700 text-center mt-2">Guest scores are not saved.</p>
      </motion.div>
    </div>
  );
}
