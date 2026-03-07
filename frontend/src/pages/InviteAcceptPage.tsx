import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTeam } from '../contexts/TeamContext';
import api from '../services/api';

interface InviteDetails {
  team_name: string;
  inviter_name: string;
  invitee_email: string;
  expires_at: string;
}

export default function InviteAcceptPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, user, isLoading: authLoading } = useAuth();
  const { refreshTeams, setCurrentTeam } = useTeam();

  const [invite, setInvite] = useState<InviteDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    const fetchInvite = async () => {
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8080/api'}/invites/${token}`);
        const data = await response.json();

        if (!response.ok) {
          setError(data.error || 'Invalid invite');
          return;
        }

        setInvite(data);
      } catch (err) {
        setError('Failed to load invite details');
      } finally {
        setLoading(false);
      }
    };

    if (token) {
      fetchInvite();
    }
  }, [token]);

  const handleAccept = async () => {
    if (!token) return;

    setAccepting(true);
    setError('');

    try {
      const response = await api.post(`/invites/${token}/accept`);
      const team = response.data.team;

      // Refresh teams and switch to the new team
      await refreshTeams();
      setCurrentTeam(team);

      navigate('/', { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to accept invite');
      setAccepting(false);
    }
  };

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading invite...</p>
        </div>
      </div>
    );
  }

  if (error && !invite) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="max-w-md w-full mx-4">
          <div className="bg-white rounded-xl shadow-lg p-8 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Invalid Invite</h1>
            <p className="text-gray-600 mb-6">{error}</p>
            <Link
              to="/"
              className="inline-block px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Go to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Check if the logged-in user's email matches the invite
  const emailMismatch = isAuthenticated && user && invite && user.email !== invite.invitee_email;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-md w-full mx-4">
        <div className="bg-white rounded-xl shadow-lg p-8">
          <div className="text-center mb-6">
            <div className="flex justify-center mb-4">
              <svg className="w-14 h-14" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="invite-bg" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#3b82f6"/>
                    <stop offset="100%" stopColor="#6366f1"/>
                  </linearGradient>
                </defs>
                <rect width="64" height="64" rx="14" fill="url(#invite-bg)"/>
                <path d="M18 22h28M18 32h20M18 42h24" stroke="white" strokeWidth="4" strokeLinecap="round"/>
                <circle cx="50" cy="32" r="4" fill="#fbbf24"/>
                <path d="M46 38l4 4 6-8" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <p className="text-gray-600">Team Invitation</p>
          </div>

          <div className="bg-blue-50 rounded-lg p-6 mb-6">
            <div className="flex items-center justify-center mb-4">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
            </div>
            <p className="text-center text-gray-700">
              <strong>{invite?.inviter_name}</strong> has invited you to join
            </p>
            <p className="text-center text-2xl font-bold text-gray-900 mt-2">
              {invite?.team_name}
            </p>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">
              {error}
            </div>
          )}

          {emailMismatch ? (
            <div className="space-y-4">
              <div className="bg-yellow-50 text-yellow-800 p-4 rounded-lg text-sm">
                <p className="font-medium mb-1">Email mismatch</p>
                <p>This invite was sent to <strong>{invite?.invitee_email}</strong>, but you're logged in as <strong>{user?.email}</strong>.</p>
              </div>
              <p className="text-gray-600 text-sm text-center">
                Please log out and sign in with the correct email, or ask for a new invite.
              </p>
              <Link
                to="/login"
                className="block w-full py-2 px-4 bg-blue-600 text-white text-center rounded-lg hover:bg-blue-700 transition-colors"
              >
                Sign in with different account
              </Link>
            </div>
          ) : isAuthenticated ? (
            <div className="space-y-4">
              <p className="text-gray-600 text-sm text-center">
                Logged in as <strong>{user?.email}</strong>
              </p>
              <button
                onClick={handleAccept}
                disabled={accepting}
                className="w-full py-3 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {accepting ? 'Joining team...' : 'Accept Invitation'}
              </button>
              <Link
                to="/"
                className="block w-full py-2 px-4 border border-gray-300 text-gray-700 text-center rounded-lg hover:bg-gray-50 transition-colors"
              >
                Decline
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-gray-600 text-sm text-center">
                Sign in or create an account to accept this invitation
              </p>
              <Link
                to={`/login?redirect=/invite/${token}`}
                className="block w-full py-3 px-4 bg-blue-600 text-white text-center rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Sign in to accept
              </Link>
              <Link
                to={`/register?redirect=/invite/${token}&email=${encodeURIComponent(invite?.invitee_email || '')}`}
                className="block w-full py-2 px-4 border border-gray-300 text-gray-700 text-center rounded-lg hover:bg-gray-50 transition-colors"
              >
                Create an account
              </Link>
            </div>
          )}

          <p className="mt-6 text-center text-xs text-gray-500">
            This invitation expires on {invite ? new Date(invite.expires_at).toLocaleDateString() : ''}
          </p>
        </div>
      </div>
    </div>
  );
}
