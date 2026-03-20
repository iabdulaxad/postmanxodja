import { useState } from 'react';
import type { Team } from '../../types';

interface TeamSwitcherProps {
  teams: Team[];
  currentTeam: Team | null;
  onTeamChange: (team: Team) => void;
  onCreateTeam: () => void;
}

export default function TeamSwitcher({
  teams,
  currentTeam,
  onTeamChange,
  onCreateTeam,
}: TeamSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 bg-card border border-border rounded-lg hover:bg-accent transition-colors"
      >
        <span className="font-medium text-xs sm:text-sm text-foreground truncate max-w-[70px] sm:max-w-[100px] md:max-w-[150px]">
          {currentTeam?.name || 'Select Team'}
        </span>
        <svg
          className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-56 max-w-[calc(100vw-2rem)] bg-card rounded-lg shadow-lg border border-border z-20">
            <div className="py-1">
              {teams.map((team) => (
                <button
                  key={team.id}
                  onClick={() => {
                    onTeamChange(team);
                    setIsOpen(false);
                  }}
                  className={`w-full px-4 py-2 text-left text-sm hover:bg-accent flex items-center justify-between ${
                    currentTeam?.id === team.id ? 'bg-primary/10 text-primary' : 'text-foreground'
                  }`}
                >
                  <span className="truncate">{team.name}</span>
                  {currentTeam?.id === team.id && (
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </button>
              ))}
            </div>
            <div className="border-t border-border py-1">
              <button
                onClick={() => {
                  onCreateTeam();
                  setIsOpen(false);
                }}
                className="w-full px-4 py-2 text-left text-sm text-primary hover:bg-primary/10 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Create New Team
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
