import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getUserInvites, acceptInvite, declineInvite } from '../services/team';
import { useTeam } from '../contexts/TeamContext';
import type { TeamInvite } from '../types';

export default function InvitesPage() {
  const [invites, setInvites] = useState<TeamInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { refreshTeams, setCurrentTeam } = useTeam();
  const navigate = useNavigate();

  useEffect(() => {
    loadInvites();
  }, []);

  const loadInvites = async () => {
    try {
      const data = await getUserInvites();
      setInvites(data);
    } catch (error) {
      console.error('Failed to load invites:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (invite: TeamInvite) => {
    if (!invite.token) return;
    setActionLoading(invite.token);
    setError(null);
    try {
      const result = await acceptInvite(invite.token);
      await refreshTeams();
      // Switch to the newly joined team and redirect to dashboard
      setCurrentTeam(result.team);
      navigate('/');
    } catch (err: any) {
      console.error('Failed to accept invite:', err);
      setError(err.message || 'Failed to accept invite');
      setActionLoading(null);
    }
  };

  const handleDecline = async (invite: TeamInvite) => {
    if (!invite.token) return;
    setActionLoading(invite.token);
    setError(null);
    try {
      await declineInvite(invite.token);
      setInvites((prev) => prev.filter((i) => i.id !== invite.id));
    } catch (err: any) {
      console.error('Failed to decline invite:', err);
      setError(err.message || 'Failed to decline invite');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto py-8 px-4">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-foreground">Team Invites</h1>
          <button
            onClick={() => navigate('/')}
            className="text-primary hover:underline text-sm"
          >
            Back to Dashboard
          </button>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading invites...</p>
          </div>
        ) : invites.length === 0 ? (
          <div className="bg-card rounded-lg shadow p-8 text-center">
            <svg
              className="w-16 h-16 text-border mx-auto mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
            <p className="text-muted-foreground">No pending invites</p>
          </div>
        ) : (
          <div className="space-y-4">
            {invites.map((invite) => (
              <div key={invite.id} className="bg-card rounded-lg shadow p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-foreground">{invite.team?.name}</h3>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                        <span className="w-1.5 h-1.5 rounded-full bg-yellow-500"></span>
                        Pending
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Invited by {invite.inviter?.name || invite.inviter?.email}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDecline(invite)}
                      disabled={actionLoading === invite.token}
                      className="px-3 py-1 text-sm text-muted-foreground hover:bg-accent rounded transition-colors disabled:opacity-50"
                    >
                      Decline
                    </button>
                    <button
                      onClick={() => handleAccept(invite)}
                      disabled={actionLoading === invite.token}
                      className="px-3 py-1 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      {actionLoading === invite.token ? 'Joining...' : 'Accept'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
