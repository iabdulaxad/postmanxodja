import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTeam } from '../../contexts/TeamContext';
import { useTheme } from '../../contexts/ThemeContext';
import { getUserInvites, getTeamMembers } from '../../services/team';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import TeamSwitcher from '../team/TeamSwitcher';
import CreateTeamModal from '../team/CreateTeamModal';
import InviteModal from '../team/InviteModal';
import TeamMembersModal from '../team/TeamMembersModal';
import APIKeysManager from '../APIKeysManager';
import AISettingsModal from '../AISettingsModal';

interface HeaderProps {
  onToggleSidebar?: () => void;
}

export default function Header({ onToggleSidebar }: HeaderProps) {
  const { user, logout } = useAuth();
  const { teams, currentTeam, setCurrentTeam, createTeam } = useTeam();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showAPIKeys, setShowAPIKeys] = useState(false);
  const [showAISettings, setShowAISettings] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [pendingInvitesCount, setPendingInvitesCount] = useState(0);
  const [isTeamOwner, setIsTeamOwner] = useState(false);

  const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';
  const networkMode = useNetworkStatus(apiBaseUrl);

  useEffect(() => {
    loadPendingInvites();
    // Refresh every 30 seconds
    const interval = setInterval(loadPendingInvites, 30000);
    return () => clearInterval(interval);
  }, []);

  // Check if current user is owner of current team
  useEffect(() => {
    const checkOwnership = async () => {
      if (!currentTeam || !user) {
        setIsTeamOwner(false);
        return;
      }
      try {
        const members = await getTeamMembers(currentTeam.id);
        const currentMember = members.find((m) => m.user_id === user.id);
        setIsTeamOwner(currentMember?.role === 'owner');
      } catch (error) {
        console.error('Failed to check team ownership:', error);
        setIsTeamOwner(false);
      }
    };
    checkOwnership();
  }, [currentTeam?.id, user?.id]);

  const loadPendingInvites = async () => {
    try {
      const invites = await getUserInvites();
      setPendingInvitesCount(invites.length);
    } catch (error) {
      console.error('Failed to load invites count:', error);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleCreateTeam = async (name: string) => {
    const newTeam = await createTeam(name);
    setCurrentTeam(newTeam);
  };

  return (
    <>
      <header className="bg-background border-b-2 border-primary px-2 sm:px-3 py-1.5 md:px-4 md:py-2 flex justify-between items-center flex-shrink-0 min-w-0">
        <div className="flex items-center gap-1 sm:gap-2 min-w-0 flex-shrink">
          {/* Hamburger menu - mobile only */}
          {onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              className="md:hidden p-2 text-muted-foreground hover:bg-accent rounded-lg transition-colors flex-shrink-0 focus-visible:ring-2 focus-visible:ring-ring"
              title="Toggle sidebar"
              aria-label="Toggle sidebar"
            >
              <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          )}
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg md:text-2xl font-bold text-primary truncate">Postbaby</h1>
          </div>
        </div>

        <div className="flex items-center gap-0.5 sm:gap-1 md:gap-1.5 flex-shrink-0">
          {/* Network status indicator */}
          {networkMode !== 'online' && (
            <div
              className={`hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                networkMode === 'offline'
                  ? 'bg-destructive/10 text-destructive'
                  : 'bg-muted text-muted-foreground'
              }`}
              title={
                networkMode === 'offline'
                  ? 'No internet connection — requests to localhost still work via direct fetch'
                  : 'Backend server unreachable — requests execute directly from your browser (CORS rules apply)'
              }
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  networkMode === 'offline'
                    ? 'bg-destructive'
                    : 'bg-muted-foreground'
                }`}
              />
              {networkMode === 'offline' ? 'Offline' : 'Local Only'}
            </div>
          )}

          {/* Mobile: small network dot indicator */}
          {networkMode !== 'online' && (
            <div
              className={`md:hidden w-2.5 h-2.5 rounded-full ${
                networkMode === 'offline'
                  ? 'bg-destructive'
                  : 'bg-muted-foreground'
              }`}
              title={networkMode === 'offline' ? 'Offline' : 'Local Only'}
            />
          )}

          <TeamSwitcher
            teams={teams}
            currentTeam={currentTeam}
            onTeamChange={setCurrentTeam}
            onCreateTeam={() => setShowCreateTeam(true)}
          />

          {/* Desktop-only: team action buttons */}
          {currentTeam && (
            <div className="hidden md:flex items-center gap-1">
              <button
                onClick={() => setShowMembers(true)}
                className="px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent rounded transition-colors flex items-center gap-1 focus-visible:ring-2 focus-visible:ring-ring"
                title="View team members"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                <span>Members</span>
              </button>
              {isTeamOwner && currentTeam.name !== 'Personal' && (
                <>
                  <button
                    onClick={() => setShowInvite(true)}
                    className="px-2 py-1.5 text-xs text-primary hover:bg-primary/10 rounded transition-colors flex items-center gap-1 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                    <span>Invite</span>
                  </button>
                  <button
                    onClick={() => setShowAPIKeys(true)}
                    className="px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent rounded transition-colors flex items-center gap-1 focus-visible:ring-2 focus-visible:ring-ring"
                    title="Manage API Keys"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                    <span>API Keys</span>
                  </button>
                  <button
                    onClick={() => setShowAISettings(true)}
                    className="px-2 py-1.5 text-xs text-primary hover:bg-primary/10 rounded-lg transition-colors flex items-center gap-1 focus-visible:ring-2 focus-visible:ring-ring"
                    title="AI Settings"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    <span>AI</span>
                  </button>
                </>
              )}
            </div>
          )}

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="p-1.5 text-muted-foreground hover:bg-accent rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-ring"
            title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
            aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
          >
            {theme === 'light' ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            )}
          </button>

          {/* Invites notification bell */}
          <button
            onClick={() => navigate('/invites')}
            className="relative p-1.5 text-muted-foreground hover:bg-accent rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-ring"
            title="Team Invites"
            aria-label="Team Invites"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            {pendingInvitesCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-xs rounded-full w-5 h-5 flex items-center justify-center font-medium">
                {pendingInvitesCount > 9 ? '9+' : pendingInvitesCount}
              </span>
            )}
          </button>

          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-1 sm:py-1.5 hover:bg-accent rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="User menu"
            >
              <div className="w-7 h-7 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-xs font-medium">
                {user?.name?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm text-foreground hidden sm:block">{user?.name || user?.email}</span>
              <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showUserMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowUserMenu(false)} />
                <div className="absolute right-0 mt-2 w-48 max-w-[calc(100vw-1rem)] bg-card rounded-lg shadow-lg border border-border z-20">
                  <div className="px-4 py-3 border-b border-border">
                    <p className="text-sm font-medium text-foreground">{user?.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                  </div>
                  <div className="py-1">
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        navigate('/invites');
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-foreground hover:bg-accent flex items-center justify-between"
                    >
                      <span>My Invites</span>
                      {pendingInvitesCount > 0 && (
                        <span className="bg-destructive text-destructive-foreground text-xs rounded-full px-2 py-0.5 min-w-[20px] text-center">
                          {pendingInvitesCount}
                        </span>
                      )}
                    </button>
                    {/* Mobile-only: team action items */}
                    {currentTeam && (
                      <div className="md:hidden border-t border-border py-1">
                        <button
                          onClick={() => { setShowUserMenu(false); setShowMembers(true); }}
                          className="w-full px-4 py-2 text-left text-sm text-foreground hover:bg-accent"
                        >
                          Members
                        </button>
                        {isTeamOwner && currentTeam.name !== 'Personal' && (
                          <>
                            <button
                              onClick={() => { setShowUserMenu(false); setShowInvite(true); }}
                              className="w-full px-4 py-2 text-left text-sm text-foreground hover:bg-accent"
                            >
                              Invite Member
                            </button>
                            <button
                              onClick={() => { setShowUserMenu(false); setShowAPIKeys(true); }}
                              className="w-full px-4 py-2 text-left text-sm text-foreground hover:bg-accent"
                            >
                              API Keys
                            </button>
                            <button
                              onClick={() => { setShowUserMenu(false); setShowAISettings(true); }}
                              className="w-full px-4 py-2 text-left text-sm text-foreground hover:bg-accent"
                            >
                              AI Settings
                            </button>
                          </>
                        )}
                      </div>
                    )}
                    <button
                      onClick={handleLogout}
                      className="w-full px-4 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
                    >
                      Sign out
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <CreateTeamModal
        isOpen={showCreateTeam}
        onClose={() => setShowCreateTeam(false)}
        onSubmit={handleCreateTeam}
      />

      {currentTeam && (
        <>
          <InviteModal
            isOpen={showInvite}
            onClose={() => setShowInvite(false)}
            teamId={currentTeam.id}
            teamName={currentTeam.name}
          />
          <TeamMembersModal
            isOpen={showMembers}
            onClose={() => setShowMembers(false)}
            teamId={currentTeam.id}
            teamName={currentTeam.name}
            isOwner={isTeamOwner}
          />
          {/* API Keys Modal */}
          {showAPIKeys && (
            <div className="fixed inset-0 flex items-center justify-center z-50">
              <div className="fixed inset-0 bg-slate-900/30" onClick={() => setShowAPIKeys(false)} />
              <div className="relative bg-card w-full h-full md:h-auto md:rounded-lg md:max-w-2xl md:max-h-[80vh] overflow-y-auto md:mx-4 shadow-xl">
                <div className="sticky top-0 bg-card border-b border-border px-4 py-3 flex justify-between items-center">
                  <h2 className="text-lg font-semibold text-foreground">API Keys - {currentTeam.name}</h2>
                  <button
                    onClick={() => setShowAPIKeys(false)}
                    className="p-1 hover:bg-accent rounded-lg text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="Close API Keys"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <APIKeysManager />
              </div>
            </div>
          )}
          <AISettingsModal
            isOpen={showAISettings}
            onClose={() => setShowAISettings(false)}
          />
        </>
      )}
    </>
  );
}
