import { useState, useRef, useCallback, useEffect } from 'react';

interface Props {
  initialWidth: number;
  minWidth: number;
  maxWidth: number;
  children: React.ReactNode;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

export default function HorizontalSplitter({
  initialWidth,
  minWidth,
  maxWidth,
  children,
  collapsed = false,
  onCollapsedChange,
}: Props) {
  const [width, setWidth] = useState(initialWidth);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    startXRef.current = e.clientX;
    startWidthRef.current = width;
  }, [width]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;

    const delta = e.clientX - startXRef.current;
    const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidthRef.current + delta));
    setWidth(newWidth);
  }, [isDragging, minWidth, maxWidth]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const toggleCollapse = () => {
    onCollapsedChange?.(!collapsed);
  };

  return (
    <div ref={containerRef} className="flex h-full relative">
      {/* Sidebar Content */}
      <div
        className="flex flex-col bg-card border-r border-border shadow-sm  overflow-hidden"
        style={{ width: collapsed ? 0 : width }}
      >
        {!collapsed && children}
      </div>

      {/* Resize Handle & Toggle Button */}
      <div className="relative flex items-center">
        {/* Resize Handle */}
        {!collapsed && (
          <div
            className={`
              w-1 h-full cursor-col-resize hover:bg-blue-400               ${isDragging ? 'bg-blue-500' : 'bg-muted'}
            `}
            onMouseDown={handleMouseDown}
          />
        )}

        {/* Toggle Button */}
        <button
          onClick={toggleCollapse}
          className="absolute top-1/2 -translate-y-1/2 z-10 w-6 h-12 bg-card border border-border rounded-r-lg shadow-sm hover:bg-accent flex items-center justify-center transition-colors"
          style={{ left: collapsed ? 0 : -3 }}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <svg
            className={`w-4 h-4 text-muted-foreground  ${collapsed ? '' : 'rotate-180'}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
