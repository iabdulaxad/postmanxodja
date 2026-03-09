import { useState, useEffect } from 'react';
import { useTeam } from '../contexts/TeamContext';
import { getCollections, getCollection } from '../services/api';

interface Collection {
  id: number;
  name: string;
  collection?: {
    info?: {
      name?: string;
      _postman_id?: string;
    };
    item?: any[];
  };
}

interface CollectionSelectorProps {
  isOpen: boolean;
  onSelect: (collectionId: number, folderPath: string[]) => void;
  onCancel: () => void;
}

export default function CollectionSelector({
  isOpen,
  onSelect,
  onCancel,
}: CollectionSelectorProps) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [selectedNode, setSelectedNode] = useState<{
    collectionId: number;
    nodePath: string[];
    nodeName: string;
    isCollection: boolean;
  } | null>(null);
  const { currentTeam } = useTeam();

  useEffect(() => {
    if (isOpen && currentTeam) {
      loadCollections();
    } else {
      // Reset state when closing
      setCollections([]);
      setSelectedNode(null);
      setExpandedNodes(new Set());
    }
  }, [isOpen, currentTeam]);

  const loadCollections = async () => {
    if (!currentTeam) return;

    setLoading(true);
    setError(null);
    try {
      const data = await getCollections(currentTeam.id);
      // Validate and filter out invalid collections
      const validCollections = Array.isArray(data)
        ? data.filter(col => col && typeof col === 'object')
        : [];

      // Load full collection data for each collection
      const collectionsWithData = await Promise.all(
        validCollections.map(async (col) => {
          try {
            const fullData = await getCollection(currentTeam.id, col.id);
            return {
              ...col,
              collection: fullData.collection,
            };
          } catch (err) {
            console.error(`Failed to load collection ${col.id}:`, err);
            return col;
          }
        })
      );

      setCollections(collectionsWithData);
    } catch (err) {
      console.error('Failed to load collections:', err);
      setError('Failed to load collections. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const toggleNode = (pathKey: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(pathKey)) {
      newExpanded.delete(pathKey);
    } else {
      newExpanded.add(pathKey);
    }
    setExpandedNodes(newExpanded);
  };

  const selectNode = (collectionId: number, nodePath: string[], nodeName: string, isCollection: boolean = false) => {
    setSelectedNode({ collectionId, nodePath, nodeName, isCollection });
  };

  const handleConfirm = () => {
    if (selectedNode) {
      onSelect(selectedNode.collectionId, selectedNode.nodePath);
      setSelectedNode(null);
      setExpandedNodes(new Set());
    }
  };

  const handleCancel = () => {
    setSelectedNode(null);
    setExpandedNodes(new Set());
    setError(null);
    onCancel();
  };

  // Helper function to extract folder name from item
  const getItemName = (item: any): string => {
    if (item.name) return item.name;
    if (item.request?.name) return item.request.name;
    return 'Unnamed Item';
  };

  // Check if item is a folder (has item array, even if empty)
  const isFolder = (item: any): boolean => {
    return Array.isArray(item.item);
  };

  // Check if item is a request (has request property and no item array)
  const isRequest = (item: any): boolean => {
    return item.request && !Array.isArray(item.item);
  };

  // Render a tree node (could be collection, folder, or request)
  const renderTreeNode = (item: any, collectionId: number, depth = 0, parentPath: string[] = []): JSX.Element | null => {
    if (!item || typeof item !== 'object') return null;

    const itemName = getItemName(item);
    const currentPath = [...parentPath, itemName];
    const pathKey = `${collectionId}/${currentPath.join('/')}`;
    const isExpanded = expandedNodes.has(pathKey);
    const isSelected = selectedNode?.collectionId === collectionId &&
                      JSON.stringify(selectedNode.nodePath) === JSON.stringify(currentPath);
    const isAFolder = isFolder(item);
    const isARequest = isRequest(item);
    const paddingLeft = `${depth * 20 + 16}px`;

    // Don't render individual requests as selectable folders
    if (isARequest) {
      return (
        <div key={pathKey} style={{ paddingLeft }}>
          <div className="py-1 px-3 flex items-center gap-2 text-muted-foreground">
            <span className="text-xs">📄</span>
            <span className="text-sm truncate">{itemName}</span>
            <span className="text-xs text-muted-foreground ml-2">(request)</span>
          </div>
        </div>
      );
    }

    // Render folder or collection
    return (
      <div key={pathKey}>
        <div
          className={`py-2 px-3 flex items-center justify-between hover:bg-accent cursor-pointer transition-colors ${
            isSelected ? 'bg-primary/10 border-l-4 border-primary' : ''
          }`}
          style={{ paddingLeft }}
        >
          <div 
            className="flex-1 flex items-center gap-2"
            onClick={() => {
              if (isAFolder) {
                toggleNode(pathKey);
              }
            }}
          >
            {isAFolder && (
              <span className="text-muted-foreground text-xs w-4">
                {isExpanded ? '▼' : '▶'}
              </span>
            )}
            <span className={`${isAFolder ? 'text-primary' : 'text-primary'}`}>
              {isAFolder ? (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                </svg>
              )}
            </span>
            <span className="text-sm font-medium text-muted-foreground truncate">
              {itemName}
            </span>
            {isAFolder && (
              <span className="text-xs text-muted-foreground ml-1">
                ({item.item?.length || 0} items)
              </span>
            )}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              selectNode(collectionId, currentPath, itemName, depth === 0);
            }}
            className="ml-2 px-3 py-1 text-xs bg-primary hover:bg-primary/90 text-primary-foreground rounded transition-colors whitespace-nowrap"
          >
            Select {depth === 0 ? 'Collection' : 'Folder'}
          </button>
        </div>
        {isAFolder && isExpanded && Array.isArray(item.item) && (
          <div>
            {item.item.map((child: any) =>
              renderTreeNode(child, collectionId, depth + 1, currentPath)
            )}
          </div>
        )}
      </div>
    );
  };

  // Render the entire collection tree
  const renderCollectionTree = (collection: Collection): JSX.Element | null => {
    if (!collection) return null;
    
    const collectionName = collection.collection?.info?.name || collection.name || 'Unnamed Collection';
    const collectionItems = collection.collection?.item || [];
    const pathKey = `${collection.id}/${collectionName}`;
    const isSelected = selectedNode?.collectionId === collection.id && 
                      selectedNode.nodePath.length === 0;
    const isExpanded = expandedNodes.has(pathKey);

    return (
      <div key={collection.id} className="border-b border-border last:border-b-0">
        {/* Collection header */}
        <div
          className={`py-3 px-4 flex items-center justify-between hover:bg-accent cursor-pointer ${
            isSelected ? 'bg-primary/10 border-l-4 border-primary' : ''
          }`}
        >
          <div 
            className="flex items-center gap-2"
            onClick={() => toggleNode(pathKey)}
          >
            <span className="text-muted-foreground text-xs w-4">
              {isExpanded ? '▼' : '▶'}
            </span>
            <svg className="w-5 h-5 text-primary" fill="currentColor" viewBox="0 0 20 20">
              <path d="M7 3a1 1 0 000 2h6a1 1 0 100-2H7zM4 7a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1zM2 11a2 2 0 012-2h12a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4z" />
            </svg>
            <div className="flex flex-col">
              <span className="font-semibold text-foreground">
                {collectionName}
              </span>
              <span className="text-xs text-muted-foreground">
                Collection • {collectionItems.length} items
              </span>
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              selectNode(collection.id, [], collectionName, true);
            }}
            className="px-3 py-1 text-xs bg-primary hover:bg-primary/90 text-primary-foreground rounded transition-colors"
          >
            Select Collection
          </button>
        </div>

        {/* Collection contents (folders and requests) */}
        {isExpanded && (
          <div className="bg-accent/50 border-t border-border">
            {collectionItems.length === 0 ? (
              <div className="py-3 px-4 text-sm text-muted-foreground text-center italic">
                Empty collection
              </div>
            ) : (
              <div className="py-2">
                {collectionItems.map((item: any) =>
                  renderTreeNode(item, collection.id, 1, [])
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-slate-900/30" onClick={handleCancel} />
      <div className="relative bg-card shadow-xl w-full h-full md:h-auto md:rounded-lg md:max-w-2xl md:mx-4 md:max-h-[80vh] flex flex-col">
        <div className="p-6 border-b border-border">
          <h3 className="text-lg font-semibold text-foreground">Select Collection or Folder</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Choose where to save this request. You can select a collection or any folder within it.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="p-8 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <p className="mt-2 text-muted-foreground">Loading collections...</p>
            </div>
          ) : error ? (
            <div className="p-8 text-center">
              <div className="text-destructive mb-2">⚠️</div>
              <p className="text-destructive">{error}</p>
              <button
                onClick={loadCollections}
                className="mt-3 px-4 py-2 text-sm bg-muted hover:bg-accent rounded-lg transition-colors"
              >
                Retry
              </button>
            </div>
          ) : collections.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <p>No collections available. Create a collection first.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {collections.map(renderCollectionTree)}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-border bg-accent/50">
          {selectedNode && (
            <div className="mb-3 p-3 bg-primary/10 rounded-lg">
              <div className="text-sm text-muted-foreground">
                <span className="font-medium">Selected: </span>
                <span className="text-primary">
                  {selectedNode.isCollection ? '📁 ' : '📂 '}
                  {selectedNode.nodePath.length > 0 
                    ? selectedNode.nodePath.join(' → ') 
                    : selectedNode.nodeName}
                </span>
              </div>
            </div>
          )}
          
          <div className="flex justify-end gap-3">
            <button
              onClick={handleCancel}
              className="px-4 py-2 text-sm font-medium text-foreground bg-card hover:bg-accent border border-border rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selectedNode}
              className={`px-4 py-2 text-sm font-medium text-primary-foreground rounded-lg transition-colors ${
                selectedNode
                  ? 'bg-primary hover:bg-primary/90'
                  : 'bg-muted-foreground cursor-not-allowed'
              }`}
            >
              {selectedNode?.isCollection ? 'Save to Collection' : 'Save to Folder'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}