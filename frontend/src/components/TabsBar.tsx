import { useRef, useEffect, useState } from 'react';
import type { RequestTab } from '../types';

interface TabsBarProps {
  tabs: RequestTab[];
  activeTabId: string;
  onTabSelect: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onTabRename: (tabId: string, newName: string) => void;
  onNewTab: () => void;
  onImportCurl: () => void;
}

export default function TabsBar({
  tabs,
  activeTabId,
  onTabSelect,
  onTabClose,
  onTabRename,
  onNewTab,
  onImportCurl,
}: TabsBarProps) {
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLButtonElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const checkScroll = () => {
    const container = tabsContainerRef.current;
    if (container) {
      setCanScrollLeft(container.scrollLeft > 0);
      setCanScrollRight(
        container.scrollLeft < container.scrollWidth - container.clientWidth - 1
      );
    }
  };

  useEffect(() => {
    if (activeTabRef.current && tabsContainerRef.current) {
      activeTabRef.current.scrollIntoView({
        behavior: 'auto',
        block: 'nearest',
        inline: 'center',
      });
    }
  }, [activeTabId]);

  useEffect(() => {
    checkScroll();
    const container = tabsContainerRef.current;
    if (container) {
      container.addEventListener('scroll', checkScroll);
      window.addEventListener('resize', checkScroll);
      return () => {
        container.removeEventListener('scroll', checkScroll);
        window.removeEventListener('resize', checkScroll);
      };
    }
  }, [tabs]);

  const scrollLeft = () => {
    if (tabsContainerRef.current) {
      tabsContainerRef.current.scrollBy({ left: -200, behavior: 'smooth' });
    }
  };

  const scrollRight = () => {
    if (tabsContainerRef.current) {
      tabsContainerRef.current.scrollBy({ left: 200, behavior: 'smooth' });
    }
  };

  const getMethodColor = (method: string) => {
    const colors: Record<string, string> = {
      GET: 'text-green-600 dark:text-green-400',
      POST: 'text-blue-600 dark:text-blue-400',
      PUT: 'text-yellow-600 dark:text-yellow-400',
      DELETE: 'text-red-600 dark:text-red-400',
      PATCH: 'text-teal-600 dark:text-teal-400',
    };
    return colors[method] || 'text-muted-foreground';
  };

  const handleStartRename = (tabId: string, currentName: string) => {
    setRenamingTabId(tabId);
    setRenameValue(currentName);
  };

  const handleFinishRename = (tabId: string) => {
    if (renameValue.trim() && renameValue !== tabs.find(t => t.id === tabId)?.name) {
      onTabRename(tabId, renameValue.trim());
    }
    setRenamingTabId(null);
    setRenameValue('');
  };

  const handleCancelRename = () => {
    setRenamingTabId(null);
    setRenameValue('');
  };

  return (
    <>
      <style>{`
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
      `}</style>
      <div className="flex items-center bg-card border-b border-border w-full min-w-0 flex-shrink-0" style={{ transition: 'none' }}>
        {canScrollLeft && (
          <button
            onClick={scrollLeft}
            className="p-2 hover:bg-accent rounded flex-shrink-0"
            style={{ transition: 'none' }}
            title="Scroll left"
          >
            <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}
        <div
          ref={tabsContainerRef}
          className="hide-scrollbar flex items-center overflow-x-auto flex-1 min-w-0"
          style={{
            scrollbarWidth: 'none',
            maxWidth: '100%',
            transition: 'none',
            msOverflowStyle: 'none'
          }}
        >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            ref={activeTabId === tab.id ? activeTabRef : null}
            onClick={() => onTabSelect(tab.id)}
            style={{ transition: 'none' }}
            className={`
              group flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 md:px-3 py-2 md:py-1.5 cursor-pointer font-medium text-xs border-b-2
              min-w-[80px] sm:min-w-[100px] md:min-w-[120px] max-w-[160px] md:max-w-[200px] shrink-0
              ${activeTabId === tab.id
                ? 'border-primary text-primary bg-primary/10'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-accent'
              }
            `}
          >
            <span className={`text-[10px] font-semibold uppercase tracking-wide ${getMethodColor(tab.method)}`}>
              {tab.method}
            </span>
            {renamingTabId === tab.id ? (
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => handleFinishRename(tab.id)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') {
                    handleFinishRename(tab.id);
                  } else if (e.key === 'Escape') {
                    handleCancelRename();
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                className="text-xs px-1 py-0.5 border border-primary rounded focus:outline-none bg-card text-foreground min-w-0 w-20 md:w-[100px] max-w-[100px] md:max-w-[120px]"
                autoFocus
              />
            ) : (
              <span
                className="text-xs truncate min-w-0 flex-1"
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  handleStartRename(tab.id, tab.name || 'Untitled');
                }}
              >
                {tab.name || 'Untitled'}
              </span>
            )}
            <span
              onClick={(e) => {
                e.stopPropagation();
                onTabClose(tab.id);
              }}
              style={{ transition: 'none' }}
              className="opacity-100 md:opacity-0 md:group-hover:opacity-100 p-1.5 md:p-0.5 hover:bg-muted rounded flex-shrink-0"
            >
              <svg className="w-3 h-3 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </span>
          </button>
        ))}
      </div>
      {canScrollRight && (
        <button
          onClick={scrollRight}
          className="p-2 hover:bg-accent rounded flex-shrink-0"
          style={{ transition: 'none' }}
          title="Scroll right"
        >
          <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}
      <div className="flex items-center flex-shrink-0 gap-1 px-2" style={{ transition: 'none' }}>
        <button
          onClick={onImportCurl}
          className="p-2 hover:bg-primary/10 dark:hover:bg-primary/20 rounded-md transition-colors"
          style={{ transition: 'none' }}
          title="Import from cURL"
        >
          <svg className="w-4 h-4 text-muted-foreground hover:text-primary transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
          </svg>
        </button>
        <button
          onClick={onNewTab}
          className="p-2 hover:bg-primary/10 dark:hover:bg-primary/20 rounded-md transition-colors"
          style={{ transition: 'none' }}
          title="New Tab"
        >
          <svg className="w-4 h-4 text-muted-foreground hover:text-primary transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>
    </div>
    </>
  );
}
