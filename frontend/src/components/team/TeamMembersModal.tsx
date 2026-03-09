import { useState, useEffect } from 'react';
import { getTeamMembers, removeTeamMember, getTeamInvites } from '../../services/team';
import { useAuth } from '../../contexts/AuthContext';
import ConfirmModal from '../ConfirmModal';
import type { TeamMember, TeamInvite } from '../../types';

interface TeamMembersModalProps {
  isOpen: boolean;
  onClose: () => void;
  teamId: number;
  teamName: string;
  isOwner: boolean;
}

export default function TeamMembersModal({
  isOpen,
  onClose,
  teamId,
  teamName,
  isOwner,
}: TeamMembersModalProps) {
  const { user } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [pendingInvites, setPendingInvites] = useState<TeamInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<TeamMember | null>(null);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, teamId]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [membersData, invitesData] = await Promise.all([
        getTeamMembers(teamId),
        isOwner ? getTeamInvites(teamId) : Promise.resolve([]),
      ]);
      setMembers(membersData);
      setPendingInvites(invitesData);
    } catch (err) {
      console.error('Failed to load team data:', err);
      setError('Failed to load team members');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveMember = async () => {
    if (!memberToRemove) return;
    setRemoving(true);
    try {
      await removeTeamMember(teamId, memberToRemove.user_id);
      setMembers((prev) => prev.filter((m) => m.id !== memberToRemove.id));
      setMemberToRemove(null);
    } catch (err) {
      console.error('Failed to remove member:', err);
      setError('Failed to remove member');
    } finally {
      setRemoving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="fixed inset-0 bg-slate-900/30" onClick={onClose} />
        <div className="relative bg-card shadow-xl w-full h-full md:h-auto md:rounded-lg md:max-w-lg md:mx-4 md:max-h-[80vh] flex flex-col">
          {/* Header */}
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-lg font-semibold text-foreground">Team Members</h2>
            <p className="text-sm text-muted-foreground">{teamName}</p>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {error && (
              <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
                {error}
              </div>
            )}

            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                <p className="text-muted-foreground">Loading members...</p>
              </div>
            ) : (
              <>
                {/* Members List */}
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">
                    Members ({members.length})
                  </h3>
                  {members.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between p-3 bg-accent/50 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center text-primary-foreground font-medium">
                          {member.user?.name?.charAt(0).toUpperCase() ||
                            member.user?.email?.charAt(0).toUpperCase() ||
                            '?'}
                        </div>
                        <div>
                          <p className="font-medium text-foreground">
                            {member.user?.name || member.user?.email}
                            {member.user_id === user?.id && (
                              <span className="text-muted-foreground text-sm ml-1">(You)</span>
                            )}
                          </p>
                          <p className="text-sm text-muted-foreground">{member.user?.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${
                            member.role === 'owner'
                              ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                              : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            member.role === 'owner' ? 'bg-purple-500' : 'bg-green-500'
                          }`}></span>
                          {member.role}
                        </span>
                        {isOwner && member.role !== 'owner' && member.user_id !== user?.id && (
                          <button
                            onClick={() => setMemberToRemove(member)}
                            className="p-1 text-destructive hover:bg-destructive/10 rounded transition-colors"
                            title="Remove member"
                          >
                            <svg
                              className="w-5 h-5"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pending Invites */}
                {isOwner && pendingInvites.length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-sm font-medium text-muted-foreground mb-2">
                      Pending Invites ({pendingInvites.length})
                    </h3>
                    <div className="space-y-2">
                      {pendingInvites.map((invite) => (
                        <div
                          key={invite.id}
                          className="flex items-center justify-between p-3 bg-muted rounded-lg border border-border"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-muted-foreground rounded-full flex items-center justify-center text-background font-medium">
                              <svg
                                className="w-5 h-5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                                />
                              </svg>
                            </div>
                            <div>
                              <p className="font-medium text-foreground">{invite.invitee_email}</p>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                                <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse"></span>
                                Pending
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-border flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-foreground bg-accent hover:bg-accent/80 rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Remove Member Confirmation */}
      <ConfirmModal
        isOpen={!!memberToRemove}
        title="Remove Team Member"
        message={`Are you sure you want to remove ${memberToRemove?.user?.name || memberToRemove?.user?.email} from the team?`}
        confirmText={removing ? 'Removing...' : 'Remove'}
        onConfirm={handleRemoveMember}
        onCancel={() => setMemberToRemove(null)}
        variant="danger"
      />
    </>
  );
}
