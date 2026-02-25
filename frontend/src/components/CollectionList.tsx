import { useEffect, useState } from 'react';
import { getCollections, getCollection, deleteCollection, updateCollection, exportCollection } from '../services/api';
import { useTeam } from '../contexts/TeamContext';
import ConfirmModal from './ConfirmModal';
import InputModal from './InputModal';
import type { Collection, PostmanItem, PostmanCollection, PostmanResponse } from '../types';

interface Props {
  onRequestSelect: (request: any) => void;
  onLoadSavedResponse?: (response: PostmanResponse, collectionId: number, itemPath: string, responseIndex: number) => void;
  refreshTrigger: number;
}

interface DeleteTarget {
  type: 'collection' | 'folder' | 'request' | 'response';
  collectionId: number;
  path?: string;
  name: string;
  responseIndex?: number;
}

interface AddTarget {
  type: 'folder' | 'request';
  collectionId: number;
  parentPath?: string;
}

export default function CollectionList({ onRequestSelect, onLoadSavedResponse, refreshTrigger }: Props) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [expandedCollections, setExpandedCollections] = useState<Set<number>>(new Set());
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [expandedResponses, setExpandedResponses] = useState<Set<string>>(new Set());
  const [collectionData, setCollectionData] = useState<Map<number, PostmanCollection>>(new Map());
  const { currentTeam } = useTeam();

  // Modal states
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [addTarget, setAddTarget] = useState<AddTarget | null>(null);
  const [renamingItem, setRenamingItem] = useState<{ collectionId: number; path: string; currentName: string } | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renamingCollectionId, setRenamingCollectionId] = useState<number | null>(null);
  const [collectionRenameValue, setCollectionRenameValue] = useState('');
  const [searchFilter, setSearchFilter] = useState('');

  useEffect(() => {
    if (currentTeam) {
      loadCollections();
      setExpandedCollections(new Set());
      setCollectionData(new Map());
    }
  }, [refreshTrigger, currentTeam?.id]);

  const loadCollections = async () => {
    if (!currentTeam) return;
    try {
      const data = await getCollections(currentTeam.id);
      setCollections(data);
    } catch (err) {
      console.error('Failed to load collections:', err);
    }
  };

  const toggleCollection = async (id: number) => {
    if (!currentTeam) return;
    const newExpanded = new Set(expandedCollections);

    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
      if (!collectionData.has(id)) {
        try {
          const data = await getCollection(currentTeam.id, id);
          setCollectionData(new Map(collectionData.set(id, data.collection)));
        } catch (err) {
          console.error('Failed to load collection details:', err);
        }
      }
    }

    setExpandedCollections(newExpanded);
  };

  const handleDeleteClick = (target: DeleteTarget, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteTarget(target);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget || !currentTeam) return;

    try {
      if (deleteTarget.type === 'collection') {
        await deleteCollection(currentTeam.id, deleteTarget.collectionId);
        loadCollections();
      } else if (deleteTarget.type === 'response') {
        // Delete a saved response from a request item
        const collection = collectionData.get(deleteTarget.collectionId);
        if (collection && deleteTarget.path && deleteTarget.responseIndex !== undefined) {
          const updatedCollection = deleteResponseFromCollection(collection, deleteTarget.path, deleteTarget.responseIndex);
          await updateCollection(currentTeam.id, deleteTarget.collectionId, {
            raw_json: JSON.stringify(updatedCollection),
          });
          setCollectionData(new Map(collectionData.set(deleteTarget.collectionId, updatedCollection)));
        }
      } else {
        // Delete folder or request from collection
        const collection = collectionData.get(deleteTarget.collectionId);
        if (collection && deleteTarget.path) {
          const updatedCollection = deleteItemFromCollection(collection, deleteTarget.path);
          await updateCollection(currentTeam.id, deleteTarget.collectionId, {
            raw_json: JSON.stringify(updatedCollection),
          });
          setCollectionData(new Map(collectionData.set(deleteTarget.collectionId, updatedCollection)));
        }
      }
    } catch (err) {
      console.error('Failed to delete:', err);
    }

    setDeleteTarget(null);
  };

  const handleAddClick = (target: AddTarget, e: React.MouseEvent) => {
    e.stopPropagation();
    setAddTarget(target);
  };

  // Helper to check if item name exists in a given items array
  const itemNameExists = (items: PostmanItem[], name: string): boolean => {
    return items.some(item => item.name === name);
  };

  // Get items at a specific path
  const getItemsAtPath = (collection: PostmanCollection, path?: string): PostmanItem[] => {
    if (!path) return collection.item;
    const pathParts = path.split('/');
    let currentItems = collection.item;
    for (const part of pathParts) {
      const folder = currentItems.find(item => item.name === part && item.item);
      if (!folder || !folder.item) return [];
      currentItems = folder.item;
    }
    return currentItems;
  };

  const handleConfirmAdd = async (name: string) => {
    if (!addTarget || !currentTeam) return;

    try {
      const collection = collectionData.get(addTarget.collectionId);
      if (collection) {
        // Check for duplicate name at the target path
        const itemsAtPath = getItemsAtPath(collection, addTarget.parentPath);
        if (itemNameExists(itemsAtPath, name)) {
          alert(`A ${addTarget.type === 'folder' ? 'folder' : 'request'} with name "${name}" already exists in this location.`);
          return;
        }

        let updatedCollection: PostmanCollection;

        if (addTarget.type === 'folder') {
          const newFolder: PostmanItem = { name, item: [] };
          updatedCollection = addItemToCollection(collection, addTarget.parentPath, newFolder);
        } else {
          const newRequest: PostmanItem = {
            name,
            request: {
              method: 'GET',
              url: '',
              header: [],
            },
          };
          updatedCollection = addItemToCollection(collection, addTarget.parentPath, newRequest);
        }

        await updateCollection(currentTeam.id, addTarget.collectionId, {
          raw_json: JSON.stringify(updatedCollection),
        });
        setCollectionData(new Map(collectionData.set(addTarget.collectionId, updatedCollection)));

        // Auto-expand the folder where item was added
        if (addTarget.parentPath) {
          setExpandedFolders(new Set(expandedFolders).add(addTarget.parentPath));
        }
      }
    } catch (err) {
      console.error('Failed to add item:', err);
    }

    setAddTarget(null);
  };

  const deleteItemFromCollection = (collection: PostmanCollection, path: string): PostmanCollection => {
    const pathParts = path.split('/');
    const itemName = pathParts[pathParts.length - 1];
    const parentPath = pathParts.slice(0, -1);

    const deleteFromItems = (items: PostmanItem[], currentPath: string[]): PostmanItem[] => {
      if (currentPath.length === 0) {
        return items.filter(item => item.name !== itemName);
      }

      return items.map(item => {
        if (item.name === currentPath[0] && item.item) {
          return {
            ...item,
            item: deleteFromItems(item.item, currentPath.slice(1)),
          };
        }
        return item;
      });
    };

    return {
      ...collection,
      item: deleteFromItems(collection.item, parentPath),
    };
  };

  const deleteResponseFromCollection = (collection: PostmanCollection, requestPath: string, responseIndex: number): PostmanCollection => {
    const pathParts = requestPath.split('/');
    const requestName = pathParts[pathParts.length - 1];
    const folderPath = pathParts.slice(0, -1);

    const deleteFromItems = (items: PostmanItem[], currentPath: string[]): PostmanItem[] => {
      if (currentPath.length === 0) {
        return items.map(item => {
          if (item.name === requestName && item.request && item.response) {
            return {
              ...item,
              response: item.response.filter((_, i) => i !== responseIndex),
            };
          }
          return item;
        });
      }

      return items.map(item => {
        if (item.name === currentPath[0] && item.item) {
          return {
            ...item,
            item: deleteFromItems(item.item, currentPath.slice(1)),
          };
        }
        return item;
      });
    };

    return {
      ...collection,
      item: deleteFromItems(collection.item, folderPath),
    };
  };

  const addItemToCollection = (collection: PostmanCollection, parentPath: string | undefined, newItem: PostmanItem): PostmanCollection => {
    if (!parentPath) {
      return {
        ...collection,
        item: [...collection.item, newItem],
      };
    }

    const pathParts = parentPath.split('/');

    const addToItems = (items: PostmanItem[], currentPath: string[]): PostmanItem[] => {
      return items.map(item => {
        if (item.name === currentPath[0]) {
          if (currentPath.length === 1 && item.item) {
            return {
              ...item,
              item: [...item.item, newItem],
            };
          } else if (item.item) {
            return {
              ...item,
              item: addToItems(item.item, currentPath.slice(1)),
            };
          }
        }
        return item;
      });
    };

    return {
      ...collection,
      item: addToItems(collection.item, pathParts),
    };
  };

  const toggleFolder = (folderPath: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderPath)) {
      newExpanded.delete(folderPath);
    } else {
      newExpanded.add(folderPath);
    }
    setExpandedFolders(newExpanded);
  };

  const toggleResponses = (itemPath: string) => {
    const newExpanded = new Set(expandedResponses);
    if (newExpanded.has(itemPath)) {
      newExpanded.delete(itemPath);
    } else {
      newExpanded.add(itemPath);
    }
    setExpandedResponses(newExpanded);
  };

  const handleStartRename = (collectionId: number, path: string, currentName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingItem({ collectionId, path, currentName });
    setRenameValue(currentName);
  };

  const handleFinishRename = async () => {
    if (!renamingItem || !currentTeam || !renameValue.trim()) {
      setRenamingItem(null);
      setRenameValue('');
      return;
    }

    if (renameValue.trim() === renamingItem.currentName) {
      setRenamingItem(null);
      setRenameValue('');
      return;
    }

    try {
      const collection = collectionData.get(renamingItem.collectionId);
      if (collection) {
        // Get parent path to check for duplicates
        const pathParts = renamingItem.path.split('/');
        const parentPath = pathParts.length > 1 ? pathParts.slice(0, -1).join('/') : undefined;
        const itemsAtPath = getItemsAtPath(collection, parentPath);

        // Check if new name already exists (excluding current item)
        if (itemsAtPath.some(item => item.name === renameValue.trim() && item.name !== renamingItem.currentName)) {
          alert(`An item with name "${renameValue.trim()}" already exists in this location.`);
          return;
        }

        const updatedCollection = renameItemInCollection(collection, renamingItem.path, renameValue.trim());
        await updateCollection(currentTeam.id, renamingItem.collectionId, {
          raw_json: JSON.stringify(updatedCollection),
        });
        setCollectionData(new Map(collectionData.set(renamingItem.collectionId, updatedCollection)));
      }
    } catch (err) {
      console.error('Failed to rename item:', err);
    }

    setRenamingItem(null);
    setRenameValue('');
  };

  const handleCancelRename = () => {
    setRenamingItem(null);
    setRenameValue('');
  };

  // Collection rename handlers
  const handleStartCollectionRename = (collectionId: number, currentName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingCollectionId(collectionId);
    setCollectionRenameValue(currentName);
  };

  const handleFinishCollectionRename = async () => {
    if (!renamingCollectionId || !currentTeam || !collectionRenameValue.trim()) {
      setRenamingCollectionId(null);
      setCollectionRenameValue('');
      return;
    }

    const collection = collections.find(c => c.id === renamingCollectionId);
    if (!collection || collectionRenameValue.trim() === collection.name) {
      setRenamingCollectionId(null);
      setCollectionRenameValue('');
      return;
    }

    // Check if collection name already exists (excluding current collection)
    if (collections.some(c => c.name === collectionRenameValue.trim() && c.id !== renamingCollectionId)) {
      alert(`A collection with name "${collectionRenameValue.trim()}" already exists.`);
      return;
    }

    try {
      await updateCollection(currentTeam.id, renamingCollectionId, { name: collectionRenameValue.trim() });
      // Update local state
      setCollections(prev => prev.map(c =>
        c.id === renamingCollectionId ? { ...c, name: collectionRenameValue.trim() } : c
      ));
    } catch (err) {
      console.error('Failed to rename collection:', err);
    }

    setRenamingCollectionId(null);
    setCollectionRenameValue('');
  };

  const handleCancelCollectionRename = () => {
    setRenamingCollectionId(null);
    setCollectionRenameValue('');
  };

  const renameItemInCollection = (collection: PostmanCollection, path: string, newName: string): PostmanCollection => {
    const pathParts = path.split('/');
    const oldName = pathParts[pathParts.length - 1];
    const parentPath = pathParts.slice(0, -1);

    const renameInItems = (items: PostmanItem[], currentPath: string[]): PostmanItem[] => {
      if (currentPath.length === 0) {
        return items.map(item => {
          if (item.name === oldName) {
            return { ...item, name: newName };
          }
          return item;
        });
      }

      return items.map(item => {
        if (item.name === currentPath[0] && item.item) {
          return {
            ...item,
            item: renameInItems(item.item, currentPath.slice(1)),
          };
        }
        return item;
      });
    };

    return {
      ...collection,
      item: renameInItems(collection.item, parentPath),
    };
  };

  const renderItem = (item: PostmanItem, collectionId: number, depth = 0, parentPath = '') => {
    const itemPath = parentPath ? `${parentPath}/${item.name}` : item.name;
    const paddingLeft = `${depth * 16 + 12}px`;

    if (item.request) {
      const isRenaming = renamingItem?.collectionId === collectionId && renamingItem?.path === itemPath;
      const hasResponses = item.response && item.response.length > 0;
      const responsesExpanded = expandedResponses.has(itemPath);

      return (
        <div key={itemPath}>
          <div
            className="group py-2 px-3 cursor-pointer border-b border-gray-100 dark:border-gray-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center"
            style={{ paddingLeft }}
          >
            <div
              className="flex-1 flex items-center gap-2 min-w-0 overflow-hidden"
              onClick={() => !isRenaming && onRequestSelect({ ...item.request, name: item.name, collectionId, itemPath })}
            >
              <span
                className="font-semibold text-xs"
                style={{ color: getMethodColor(item.request.method) }}
              >
                {item.request.method}
              </span>
              {isRenaming ? (
                <input
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={handleFinishRename}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') {
                      handleFinishRename();
                    } else if (e.key === 'Escape') {
                      handleCancelRename();
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="text-sm px-2 py-1 border border-blue-500 rounded focus:outline-none bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 min-w-0 flex-1 max-w-[200px]"
                  autoFocus
                />
              ) : (
                <span
                  className="text-sm text-gray-700 dark:text-gray-300 truncate"
                  onDoubleClick={(e) => handleStartRename(collectionId, itemPath, item.name, e)}
                >
                  {item.name}
                </span>
              )}
              {hasResponses && (
                <span className="text-[10px] min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 font-semibold flex-shrink-0">
                  {item.response!.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {hasResponses && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleResponses(itemPath);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-purple-100 dark:hover:bg-purple-900/30 rounded"
                  title={responsesExpanded ? 'Hide saved responses' : 'Show saved responses'}
                >
                  <svg className={`w-4 h-4 text-purple-500 transition-transform ${responsesExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              )}
              <button
                onClick={(e) => handleDeleteClick({ type: 'request', collectionId, path: itemPath, name: item.name }, e)}
                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                title="Delete request"
              >
                <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
          {/* Saved Responses */}
          {hasResponses && responsesExpanded && (
            <div className="bg-purple-50/50 dark:bg-purple-900/10">
              {item.response!.map((resp, respIdx) => {
                // Extract original request info for display
                const origReq = resp.originalRequest;
                const origMethod = origReq?.method || '';
                const origUrl = origReq
                  ? (typeof origReq.url === 'string' ? origReq.url : (origReq.url as any)?.raw || '')
                  : '';
                const hasBody = !!(origReq?.body?.raw);

                return (
                  <div
                    key={`${itemPath}-resp-${respIdx}`}
                    className="group/resp flex items-center gap-1.5 py-1.5 px-3 border-b border-gray-100 dark:border-gray-700 hover:bg-purple-100/50 dark:hover:bg-purple-900/20 cursor-pointer"
                    style={{ paddingLeft: `${depth * 16 + 32}px` }}
                    onClick={() => onLoadSavedResponse?.(resp, collectionId, itemPath, respIdx)}
                    title={`${origMethod ? origMethod + ' ' : ''}${origUrl}${hasBody ? '\n\nHas request body' : ''}`}
                  >
                    <svg className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    {origMethod && (
                      <span
                        className="text-[10px] font-bold flex-shrink-0"
                        style={{ color: getMethodColor(origMethod) }}
                      >
                        {origMethod}
                      </span>
                    )}
                    <span
                      className="text-xs font-medium px-1.5 py-0.5 rounded flex-shrink-0"
                      style={{
                        color: resp.code >= 200 && resp.code < 300 ? '#28a745' : resp.code >= 400 ? '#dc3545' : '#ffc107',
                        backgroundColor: resp.code >= 200 && resp.code < 300 ? '#d4edda' : resp.code >= 400 ? '#f8d7da' : '#fff3cd',
                      }}
                    >
                      {resp.code}
                    </span>
                    <span className="text-xs text-gray-600 dark:text-gray-400 truncate">{resp.name}</span>
                    {hasBody && (
                      <svg className="w-3 h-3 text-orange-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-label="Has request body">
                        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                      </svg>
                    )}
                    {resp.responseTime !== undefined && resp.responseTime > 0 && (
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0">{resp.responseTime}ms</span>
                    )}
                    <button
                      onClick={(e) => handleDeleteClick({ type: 'response', collectionId, path: itemPath, name: resp.name, responseIndex: respIdx }, e)}
                      className="opacity-0 group-hover/resp:opacity-100 p-0.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded ml-auto flex-shrink-0"
                      title="Delete saved response"
                    >
                      <svg className="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    if (item.item) {
      const isExpanded = expandedFolders.has(itemPath);
      const isRenaming = renamingItem?.collectionId === collectionId && renamingItem?.path === itemPath;

      return (
        <div key={itemPath}>
          <div
            className="group py-2 px-3 font-semibold bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 flex items-center gap-2"
            style={{ paddingLeft }}
          >
            <div className="flex-1 flex items-center gap-2 min-w-0 overflow-hidden" onClick={() => !isRenaming && toggleFolder(itemPath)}>
              <span className="text-gray-400 text-xs">{isExpanded ? '▼' : '▶'}</span>
              <svg className="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
              </svg>
              {isRenaming ? (
                <input
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={handleFinishRename}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') {
                      handleFinishRename();
                    } else if (e.key === 'Escape') {
                      handleCancelRename();
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="text-sm px-2 py-1 border border-blue-500 rounded focus:outline-none bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 min-w-0 flex-1 max-w-[150px]"
                  autoFocus
                />
              ) : (
                <span className="truncate" onDoubleClick={(e) => handleStartRename(collectionId, itemPath, item.name, e)}>
                  {item.name}
                </span>
              )}
              <span className="text-xs text-gray-400 flex-shrink-0">{item.item.length}</span>
            </div>
            <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 ">
              <button
                onClick={(e) => handleAddClick({ type: 'folder', collectionId, parentPath: itemPath }, e)}
                className="p-1 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded"
                title="Add folder"
              >
                <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                </svg>
              </button>
              <button
                onClick={(e) => handleAddClick({ type: 'request', collectionId, parentPath: itemPath }, e)}
                className="p-1 hover:bg-green-100 dark:hover:bg-green-900/30 rounded"
                title="Add request"
              >
                <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
              <button
                onClick={(e) => handleDeleteClick({ type: 'folder', collectionId, path: itemPath, name: item.name }, e)}
                className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                title="Delete folder"
              >
                <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
          {(isExpanded || !!searchFilter) && (
            <div className="bg-white dark:bg-gray-800">
              {(searchFilter
                ? filterItems(item.item, searchFilter)
                : item.item
              ).map(subItem => renderItem(subItem, collectionId, depth + 1, itemPath))}
            </div>
          )}
        </div>
      );
    }

    return null;
  };

  const getMethodColor = (method: string) => {
    const colors: Record<string, string> = {
      GET: '#28a745',
      POST: '#007bff',
      PUT: '#ffc107',
      DELETE: '#dc3545',
      PATCH: '#17a2b8'
    };
    return colors[method] || '#6c757d';
  };

  // Recursively filter items that match the search query
  const filterItems = (items: PostmanItem[], query: string): PostmanItem[] => {
    if (!query) return items;
    const q = query.toLowerCase();
    return items.reduce<PostmanItem[]>((acc, item) => {
      const nameMatch = item.name.toLowerCase().includes(q);
      const methodMatch = item.request?.method?.toLowerCase().includes(q);
      const urlMatch = typeof item.request?.url === 'string'
        ? item.request.url.toLowerCase().includes(q)
        : item.request?.url?.raw?.toLowerCase().includes(q);
      if (item.item) {
        const filteredChildren = filterItems(item.item, query);
        if (nameMatch || filteredChildren.length > 0) {
          acc.push({ ...item, item: nameMatch ? item.item : filteredChildren });
        }
      } else if (nameMatch || methodMatch || urlMatch) {
        acc.push(item);
      }
      return acc;
    }, []);
  };

  // Check if a collection matches the search (by name or contents)
  const collectionMatchesSearch = (collection: Collection, query: string): boolean => {
    if (!query) return true;
    const q = query.toLowerCase();
    if (collection.name.toLowerCase().includes(q)) return true;
    const data = collectionData.get(collection.id);
    if (data) {
      return filterItems(data.item, query).length > 0;
    }
    return true; // Show unexpanded collections so user can expand them
  };

  if (!currentTeam) {
    return (
      <div className="h-full overflow-y-auto border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">Select a team to view collections</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <h3 className="px-4 py-3 font-semibold text-gray-800 dark:text-gray-200 border-b border-gray-200 dark:border-gray-700 shrink-0">Collections</h3>
      {/* Search */}
      <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 shrink-0">
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Filter collections..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-1 focus:ring-blue-400 focus:border-blue-400 outline-none"
          />
          {searchFilter && (
            <button
              onClick={() => setSearchFilter('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
      {collections.length === 0 ? (
        <div className="px-4 py-8 text-center text-gray-500 dark:text-gray-400 text-sm">
          No collections yet. Import one to get started.
        </div>
      ) : (
        collections.filter(c => collectionMatchesSearch(c, searchFilter)).map(collection => {
          const isRenamingCollection = renamingCollectionId === collection.id;
          return (
          <div key={collection.id} className="mb-2">
            <div
              onClick={() => !isRenamingCollection && toggleCollection(collection.id)}
              className="group px-4 py-3 cursor-pointer bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center "
            >
              <div className="text-sm font-medium text-gray-700 dark:text-gray-200 flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                <span className="text-gray-500 dark:text-gray-400 flex-shrink-0">{expandedCollections.has(collection.id) ? '▼' : '▶'}</span>
                {isRenamingCollection ? (
                  <input
                    type="text"
                    value={collectionRenameValue}
                    onChange={(e) => setCollectionRenameValue(e.target.value)}
                    onBlur={handleFinishCollectionRename}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === 'Enter') {
                        handleFinishCollectionRename();
                      } else if (e.key === 'Escape') {
                        handleCancelCollectionRename();
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="text-sm px-2 py-1 border border-blue-500 rounded focus:outline-none bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100 min-w-0 flex-1 max-w-[180px]"
                    autoFocus
                  />
                ) : (
                  <span
                    className="truncate"
                    onDoubleClick={(e) => handleStartCollectionRename(collection.id, collection.name, e)}
                  >
                    {collection.name}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {expandedCollections.has(collection.id) && (
                  <>
                    <button
                      onClick={(e) => handleAddClick({ type: 'folder', collectionId: collection.id }, e)}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-blue-100 rounded "
                      title="Add folder"
                    >
                      <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => handleAddClick({ type: 'request', collectionId: collection.id }, e)}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-green-100 rounded "
                      title="Add request"
                    >
                      <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </button>
                  </>
                )}
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      await exportCollection(currentTeam.id, collection.id, collection.name);
                    } catch (err) {
                      console.error('Failed to export collection:', err);
                      alert('Failed to export collection');
                    }
                  }}
                  className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white text-xs rounded-lg shadow-sm "
                  title="Export to Postman format"
                >
                  Export
                </button>
                <button
                  onClick={(e) => handleDeleteClick({ type: 'collection', collectionId: collection.id, name: collection.name }, e)}
                  className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white text-xs rounded-lg shadow-sm "
                >
                  Delete
                </button>
              </div>
            </div>
            {expandedCollections.has(collection.id) && collectionData.get(collection.id) && (
              <div className="bg-white dark:bg-gray-800">
                {(searchFilter
                  ? filterItems(collectionData.get(collection.id)!.item, searchFilter)
                  : collectionData.get(collection.id)!.item
                ).map((item: PostmanItem) => renderItem(item, collection.id))}
              </div>
            )}
          </div>
        );
        })
      )}
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        title={`Delete ${deleteTarget?.type || 'item'}?`}
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
        variant="danger"
      />

      {/* Add Item Modal */}
      <InputModal
        isOpen={!!addTarget}
        title={addTarget?.type === 'folder' ? 'New Folder' : 'New Request'}
        placeholder={addTarget?.type === 'folder' ? 'Folder name' : 'Request name'}
        onConfirm={handleConfirmAdd}
        onCancel={() => setAddTarget(null)}
      />
    </div>
  );
}
