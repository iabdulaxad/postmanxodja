import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { Team } from '../types';
import { useAuth } from './AuthContext';
import * as teamService from '../services/team';

interface TeamContextType {
  teams: Team[];
  currentTeam: Team | null;
  isLoading: boolean;
  setCurrentTeam: (team: Team) => void;
  refreshTeams: () => Promise<void>;
  createTeam: (name: string) => Promise<Team>;
}

const TeamContext = createContext<TeamContextType | undefined>(undefined);

export function TeamProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [currentTeam, setCurrentTeamState] = useState<Team | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshTeams = async () => {
    try {
      const fetchedTeams = await teamService.getTeams();
      setTeams(fetchedTeams);

      // Cache teams for offline use
      localStorage.setItem('cached_teams', JSON.stringify(fetchedTeams));

      // Restore last selected team or pick first one
      const lastTeamId = localStorage.getItem('current_team_id');
      if (lastTeamId) {
        const savedTeam = fetchedTeams.find((t) => t.id === parseInt(lastTeamId));
        if (savedTeam) {
          setCurrentTeamState(savedTeam);
          return;
        }
      }

      if (fetchedTeams.length > 0 && !currentTeam) {
        setCurrentTeamState(fetchedTeams[0]);
      }
    } catch (error) {
      console.error('Failed to load teams:', error);
      // Offline fallback: restore teams from cache
      const cachedTeamsStr = localStorage.getItem('cached_teams');
      if (cachedTeamsStr) {
        try {
          const cachedTeams = JSON.parse(cachedTeamsStr) as Team[];
          setTeams(cachedTeams);
          const lastTeamId = localStorage.getItem('current_team_id');
          if (lastTeamId) {
            const savedTeam = cachedTeams.find((t) => t.id === parseInt(lastTeamId));
            if (savedTeam) {
              setCurrentTeamState(savedTeam);
              return;
            }
          }
          if (cachedTeams.length > 0 && !currentTeam) {
            setCurrentTeamState(cachedTeams[0]);
          }
        } catch {
          // Corrupted cache, ignore
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      refreshTeams();
    } else {
      setTeams([]);
      setCurrentTeamState(null);
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  const setCurrentTeam = (team: Team) => {
    setCurrentTeamState(team);
    localStorage.setItem('current_team_id', team.id.toString());
  };

  const createTeam = async (name: string): Promise<Team> => {
    const newTeam = await teamService.createTeam(name);
    setTeams((prev) => [...prev, newTeam]);
    return newTeam;
  };

  return (
    <TeamContext.Provider
      value={{
        teams,
        currentTeam,
        isLoading,
        setCurrentTeam,
        refreshTeams,
        createTeam,
      }}
    >
      {children}
    </TeamContext.Provider>
  );
}

export function useTeam() {
  const context = useContext(TeamContext);
  if (context === undefined) {
    throw new Error('useTeam must be used within a TeamProvider');
  }
  return context;
}
