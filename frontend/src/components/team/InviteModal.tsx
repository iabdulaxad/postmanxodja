import { useState } from 'react';
import { createInvite } from '../../services/team';

interface InviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  teamId: number;
  teamName: string;
}

export default function InviteModal({ isOpen, onClose, teamId, teamName }: InviteModalProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      await createInvite(teamId, email.trim());
      setSuccess(true);
      setEmail('');
      setTimeout(() => {
        onClose();
        setSuccess(false);
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to send invite');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} />
      <div className="relative bg-card shadow-xl w-full md:rounded-xl md:max-w-md md:mx-4 p-6">
        <h2 className="text-xl font-semibold text-foreground mb-2">Invite to {teamName}</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Send an invite to collaborate on this team.
        </p>

        {error && (
          <div className="bg-destructive/10 text-destructive p-3 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-primary/10 text-primary p-3 rounded-lg mb-4 text-sm">
            Invite sent successfully!
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-muted-foreground mb-1">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg bg-card text-foreground focus:ring-2 focus:ring-ring focus:border-ring"
              placeholder="teammate@example.com"
              autoFocus
            />
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-muted-foreground hover:bg-accent rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Sending...' : 'Send Invite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
