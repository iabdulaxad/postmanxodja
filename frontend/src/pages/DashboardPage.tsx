import { useState, useEffect, useCallback } from 'react';
import CollectionImporter from '../components/CollectionImporter';
import CollectionList from '../components/CollectionList';
import CollectionSettingsModal from '../components/CollectionSettingsModal';
import RequestBuilder from '../components/RequestBuilder';
import ResponseViewer from '../components/ResponseViewer';
import EnvironmentPanel from '../components/EnvironmentPanel';
import ResizableSplitter from '../components/ResizableSplitter';
import HorizontalSplitter from '../components/HorizontalSplitter';
import TabsBar from '../components/TabsBar';
import CurlImportModal from '../components/CurlImportModal';
import ConfirmModal from '../components/ConfirmModal';
import CollectionSelector from '../components/CollectionSelector';
import UCodeImportModal from '../components/UCodeImportModal';
import Header from '../components/layout/Header';
import PerformancePanel from '../components/PerformancePanel';
import { useTeam } from '../contexts/TeamContext';
import { getEnvironments, getSavedTabs, getCollection, updateCollection, importCollection, getCollections, setCollectionEnvironment, setCollectionAuth } from '../services/api';
import type { ExecuteResponse, Environment, RequestTab, SentRequest, PostmanResponse, PostmanCollection, Authorization, Collection } from '../types';

// Helper to generate unique IDs
const generateId = () => Math.random().toString(36).substring(2, 11);

// Create a new empty tab
const createNewTab = (): RequestTab => ({
    id: generateId(),
    name: 'Untitled',
    method: 'GET',
    url: '',
    headers: [],
    body: '',
    queryParams: [],
});

export default function DashboardPage() {
    const defaultTab = createNewTab();
    const [tabs, setTabs] = useState<RequestTab[]>([defaultTab]);
    const [activeTabId, setActiveTabId] = useState<string>(defaultTab.id);
    const [responses, setResponses] = useState<Map<string, ExecuteResponse>>(new Map());
    const [sentRequests, setSentRequests] = useState<Map<string, SentRequest>>(new Map());
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [collectionDataUpdate, setCollectionDataUpdate] = useState<{ collectionId: number; data: PostmanCollection; trigger: number } | null>(null);
    const [environments, setEnvironments] = useState<Environment[]>([]);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
    const [showGrafana, setShowGrafana] = useState(false);
    const [showPerformance, setShowPerformance] = useState(false);
    const [responseCollapsed, setResponseCollapsed] = useState(false);
    const [curlImportOpen, setCurlImportOpen] = useState(false);
    const [ucodeImportOpen, setUcodeImportOpen] = useState(false);
    const [activeCollectionId, setActiveCollectionId] = useState<number | null>(null);
    const [collectionSelectorOpen, setCollectionSelectorOpen] = useState(false);
    const [tabToSave, setTabToSave] = useState<RequestTab | null>(null);
    const [closeTabAfterSave, setCloseTabAfterSave] = useState(false);
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        confirmText?: string;
        cancelText?: string;
        thirdActionText?: string;
        variant?: 'danger' | 'warning' | 'info';
        thirdActionVariant?: 'danger' | 'warning' | 'info';
        onConfirm: () => void;
        onCancel?: () => void;
        onThirdAction?: () => void;
    }>({
        isOpen: false,
        title: '',
        message: '',
        onConfirm: () => {},
    });
    // Map of collectionId -> environmentId (persisted per-collection env selection)
    const [collectionEnvMap, setCollectionEnvMap] = useState<Map<number, number | null>>(new Map());
    // Map of collectionId -> Authorization (persisted per-collection auth)
    const [collectionAuthMap, setCollectionAuthMap] = useState<Map<number, Authorization | undefined>>(new Map());
    const [collectionsData, setCollectionsData] = useState<Collection[]>([]);
    const [settingsCollectionId, setSettingsCollectionId] = useState<number | null>(null);
    const { currentTeam, isLoading } = useTeam();

    // Get current active tab
    const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];
    const currentResponse = responses.get(activeTabId) || null;
    const currentSentRequest = sentRequests.get(activeTabId) || null;

    // Load tabs from database on mount
    useEffect(() => {
        const loadTabs = async () => {
            try {
                const savedTabs = await getSavedTabs();
                if (savedTabs && savedTabs.length > 0) {
                    const loadedTabs: RequestTab[] = savedTabs.map(t => ({
                        id: t.tab_id,
                        name: t.name,
                        method: t.method,
                        url: t.url,
                        headers: Object.entries(t.headers || {}).map(([key, value]) => ({ key, value })),
                        body: t.body,
                        queryParams: Object.entries(t.query_params || {}).map(([key, value]) => ({ key, value })),
                        docs: t.docs || '',
                    }));
                    setTabs(loadedTabs);
                    const activeTab = savedTabs.find(t => t.is_active);
                    if (activeTab) {
                        setActiveTabId(activeTab.tab_id);
                    } else {
                        setActiveTabId(loadedTabs[0].id);
                    }
                }
            } catch (e) {
                console.error('Failed to load tabs:', e);
            }
        };
        loadTabs();
    }, []);

    // Load environments when team changes
    useEffect(() => {
        if (currentTeam) {
            loadEnvironments();
        } else {
            setEnvironments([]);
        }
    }, [currentTeam?.id]);

    const loadEnvironments = async () => {
        if (!currentTeam) return;
        try {
            const envs = await getEnvironments(currentTeam.id);
            setEnvironments(envs);
        } catch (err) {
            console.error('Failed to load environments:', err);
        }
    };

    // Load collection-environment mappings when team changes
    const loadCollectionEnvMap = useCallback(async () => {
        if (!currentTeam) return;
        try {
            const collections = await getCollections(currentTeam.id);
            setCollectionsData(collections);
            const envMap = new Map<number, number | null>();
            const authMap = new Map<number, Authorization | undefined>();
            for (const col of collections) {
                if (col.environment_id !== undefined) {
                    envMap.set(col.id, col.environment_id ?? null);
                }
                if (col.auth_json) {
                    try {
                        authMap.set(col.id, JSON.parse(col.auth_json));
                    } catch { /* ignore */ }
                }
            }
            setCollectionEnvMap(envMap);
            setCollectionAuthMap(authMap);
        } catch (err) {
            console.error('Failed to load collection env map:', err);
        }
    }, [currentTeam]);

    useEffect(() => {
        if (currentTeam) {
            loadCollectionEnvMap();
        } else {
            setCollectionEnvMap(new Map());
        }
    }, [currentTeam?.id]);

    // Compute initialEnvId for the active tab based on its collection
    const initialEnvId = activeTab?.collectionId
        ? collectionEnvMap.get(activeTab.collectionId) ?? undefined
        : undefined;

    // Handle environment change for a collection
    const handleCollectionEnvChange = useCallback(async (envId: number | undefined) => {
        if (!currentTeam || !activeTab?.collectionId) return;
        const environmentId = envId ?? null;
        try {
            await setCollectionEnvironment(currentTeam.id, activeTab.collectionId, environmentId);
            setCollectionEnvMap(prev => {
                const next = new Map(prev);
                next.set(activeTab.collectionId!, environmentId);
                return next;
            });
        } catch (err) {
            console.error('Failed to save collection environment:', err);
        }
    }, [currentTeam, activeTab?.collectionId]);

    const handleImportSuccess = () => {
        setRefreshTrigger(prev => prev + 1);
        // Reload environments and collection-env map in case import created a new environment
        loadEnvironments();
        loadCollectionEnvMap();
    };

    const handleUCodeImport = useCallback(async (collectionJSON: string) => {
        if (!currentTeam) return;
        try {
            await importCollection(currentTeam.id, collectionJSON);
            setRefreshTrigger(prev => prev + 1);
            loadEnvironments();
            loadCollectionEnvMap();
        } catch (err) {
            console.error('Failed to import UCode collection:', err);
        }
    }, [currentTeam, loadCollectionEnvMap]);

    const toggleMobileSidebar = useCallback(() => {
        setMobileSidebarOpen(prev => !prev);
    }, []);

    const handleRequestSelect = useCallback((request: any) => {
        // Close mobile sidebar when selecting a request
        setMobileSidebarOpen(false);

        // Track which collection is currently active
        if (request.collectionId) {
            setActiveCollectionId(request.collectionId);
        }

        // Extract URL from request
        let url = '';
        if (typeof request.url === 'string') {
            url = request.url;
        } else if (request.url?.raw) {
            url = request.url.raw;
        }

        // Extract headers
        const headers: any[] = [];
        if (request.header) {
            request.header.forEach((h: any) => {
                if (!h.disabled) {
                    headers.push({ key: h.key, value: h.value, description: h.description });
                }
            });
        }

        // Extract query params from URL object
        const queryParams: any[] = [];
        if (request.url?.query) {
            request.url.query.forEach((q: any) => {
                if (!q.disabled) {
                    queryParams.push({ key: q.key, value: q.value, description: q.description });
                }
            });
        }

        // Check if this request is already open
        const existingTab = tabs.find(tab =>
            tab.collectionId === request.collectionId &&
            tab.itemPath === request.itemPath
        );

        // Check if already open, just switch to it
        if (existingTab) {
            setActiveTabId(existingTab.id);
            return;
        }

        // Check if there's an empty/untitled tab we can reuse
        const emptyTab = tabs.find(tab =>
            tab.name === 'Untitled' &&
            !tab.url &&
            !tab.body &&
            tab.headers.length === 0
        );

        const requestData = {
            name: request.name || 'Untitled',
            method: request.method || 'GET',
            url,
            headers,
            body: request.body?.raw || '',
            queryParams,
            docs: request.description || '',
            request,
            // Store collection source info for syncing changes back
            collectionId: request.collectionId,
            itemPath: request.itemPath,
        };

        if (emptyTab) {
            // Reuse existing empty tab - generate new ID to force RequestBuilder remount
            const newId = generateId();
            setTabs(prev => prev.map(tab =>
                tab.id === emptyTab.id ? { ...tab, ...requestData, id: newId } : tab
            ));
            setActiveTabId(newId);
        } else {
            // Create new tab for this request
            const newTab: RequestTab = {
                id: generateId(),
                ...requestData,
            };
            setTabs(prev => [...prev, newTab]);
            setActiveTabId(newTab.id);
        }
    }, [tabs]);

    const handleTabSelect = useCallback((tabId: string) => {
        setActiveTabId(tabId);
    }, []);

    const handleTabRename = useCallback((tabId: string, newName: string) => {
        setTabs(prev => prev.map(tab =>
            tab.id === tabId ? { ...tab, name: newName, isDirty: true } : tab
        ));
    }, []);

    const handleNewTab = useCallback(() => {
        const newTab = createNewTab();
        // If there's an active collection, associate this new tab with it
        if (activeCollectionId) {
            newTab.collectionId = activeCollectionId;
            // Note: itemPath will be null/undefined for new requests
            // The save function will need to handle adding new requests to the collection
        }
        setTabs(prev => [...prev, newTab]);
        setActiveTabId(newTab.id);
    }, [activeCollectionId]);

    const handleImportCurl = useCallback(() => {
        setCurlImportOpen(true);
    }, []);

    const handleCurlImport = useCallback((data: { method: string; url: string; headers: Record<string, string>; body: string }) => {
        // Check if there's an empty/untitled tab we can reuse
        const emptyTab = tabs.find(tab =>
            tab.name === 'Untitled' &&
            !tab.url &&
            !tab.body &&
            tab.headers.length === 0
        );

        const newTabData = {
            name: 'Imported Request',
            method: data.method,
            url: data.url,
            headers: Object.entries(data.headers).map(([key, value]) => ({ key, value })),
            body: data.body,
            queryParams: [],
        };

        if (emptyTab) {
            // Reuse existing empty tab
            setTabs(prev => prev.map(tab =>
                tab.id === emptyTab.id ? { ...tab, ...newTabData } : tab
            ));
            setActiveTabId(emptyTab.id);
        } else {
            // Create new tab
            const newTab: RequestTab = {
                id: generateId(),
                ...newTabData,
            };
            setTabs(prev => [...prev, newTab]);
            setActiveTabId(newTab.id);
        }
    }, [tabs]);

    const handleResponse = useCallback((resp: ExecuteResponse, sentReq: SentRequest) => {
        setResponses(prev => new Map(prev).set(activeTabId, resp));
        setSentRequests(prev => new Map(prev).set(activeTabId, sentReq));
    }, [activeTabId]);

    const handleTabUpdate = useCallback((updates: Partial<RequestTab>) => {
        setTabs(prev => prev.map(tab =>
            tab.id === activeTabId ? { ...tab, ...updates, isDirty: true } : tab
        ));
    }, [activeTabId]);

    const handleEnvironmentsUpdate = () => {
        loadEnvironments();
    };

    const handleCollectionAuthSave = useCallback(async (auth: Authorization | undefined) => {
        if (!currentTeam || !settingsCollectionId) return;
        const authJSON = auth ? JSON.stringify(auth) : '';
        try {
            await setCollectionAuth(currentTeam.id, settingsCollectionId, authJSON);
            setCollectionAuthMap(prev => {
                const next = new Map(prev);
                next.set(settingsCollectionId, auth);
                return next;
            });
        } catch (err) {
            console.error('Failed to save collection auth:', err);
        }
        setSettingsCollectionId(null);
    }, [currentTeam, settingsCollectionId]);

    // Helper function to save a specific tab to its collection
    const saveTabToCollection = useCallback(async (
        tab: RequestTab,
        targetCollectionId?: number,
        targetFolderPath?: string[]
    ): Promise<boolean> => {
        const collectionId = targetCollectionId || tab.collectionId;
        if (!currentTeam || !collectionId) return false;

        try {
            // Get the current collection
            const collectionData = await getCollection(currentTeam.id, collectionId);
            const collection = collectionData.collection;

            let updatedCollection;
            let newItemPath: string | undefined;

            // Prepare request data with all fields including query params
            const requestData = {
                method: tab.method,
                url: {
                    raw: tab.url,
                    query: (tab.queryParams || []).map(({ key, value }) => ({
                        key,
                        value,
                        disabled: false,
                    })),
                },
                header: (tab.headers || []).map(({ key, value }) => ({
                    key,
                    value,
                    disabled: false,
                })),
                body: tab.body ? { mode: 'raw', raw: tab.body } : undefined,
            };

            if (tab.itemPath) {
                // Existing request - update it
                const pathParts = tab.itemPath.split('/');
                const requestName = pathParts[pathParts.length - 1];
                const folderPath = pathParts.slice(0, -1);

                const updateInItems = (items: any[], currentPath: string[]): any[] => {
                    if (currentPath.length === 0) {
                        // We're at the right level, find and update the request
                        return items.map(item => {
                            if (item.name === requestName && item.request) {
                                return {
                                    ...item,
                                    name: tab.name,
                                    description: tab.docs || item.description || '',
                                    request: requestData,
                                };
                            }
                            return item;
                        });
                    }

                    // Navigate deeper into folders
                    return items.map(item => {
                        if (item.name === currentPath[0] && item.item) {
                            return {
                                ...item,
                                item: updateInItems(item.item, currentPath.slice(1)),
                            };
                        }
                        return item;
                    });
                };

                updatedCollection = {
                    ...collection,
                    item: updateInItems(collection.item, folderPath),
                };
            } else {
                // New request - add it to the collection at the specified folder path or root level
                const newRequest = {
                    name: tab.name,
                    description: tab.docs || '',
                    request: requestData,
                };

                if (targetFolderPath && targetFolderPath.length > 0) {
                    // Add to specific folder
                    const addToFolder = (items: any[], currentPath: string[]): any[] => {
                        if (currentPath.length === 0) {
                            // We're at the target folder, add the request here
                            return [...items, newRequest];
                        }

                        // Navigate deeper into folders
                        return items.map(item => {
                            if (item.name === currentPath[0] && item.item) {
                                return {
                                    ...item,
                                    item: addToFolder(item.item, currentPath.slice(1)),
                                };
                            }
                            return item;
                        });
                    };

                    updatedCollection = {
                        ...collection,
                        item: addToFolder(collection.item, targetFolderPath),
                    };

                    // Set the itemPath for the newly added request
                    newItemPath = [...targetFolderPath, tab.name].join('/');
                } else {
                    // Add to root level
                    updatedCollection = {
                        ...collection,
                        item: [...(collection.item || []), newRequest],
                    };

                    // Set the itemPath for the newly added request
                    newItemPath = tab.name;
                }
            }

            await updateCollection(currentTeam.id, collectionId, {
                raw_json: JSON.stringify(updatedCollection),
            });

            // Mark tab as not dirty and update itemPath and collectionId if it was a new request
            setTabs(prev => prev.map(t =>
                t.id === tab.id ? {
                    ...t,
                    isDirty: false,
                    itemPath: newItemPath || t.itemPath,
                    collectionId: collectionId
                } : t
            ));

            // Update only the affected collection in sidebar (no full refresh)
            setCollectionDataUpdate({ collectionId, data: updatedCollection, trigger: Date.now() });

            return true;
        } catch (err) {
            console.error('Failed to save to collection:', err);
            return false;
        }
    }, [currentTeam]);

    const handleSaveToCollection = useCallback(async () => {
        // If tab has a collection source, save directly to it
        if (activeTab.collectionId && activeTab.itemPath) {
            await saveTabToCollection(activeTab);
        } else {
            // For new tabs without collection, show selector to choose where to save
            setTabToSave(activeTab);
            setCollectionSelectorOpen(true);
        }
    }, [activeTab, saveTabToCollection]);

    // Save current response as an example in the collection
    const handleSaveResponse = useCallback(async (name: string) => {
        if (!activeTab.collectionId || !activeTab.itemPath || !currentTeam) return;

        const response = responses.get(activeTabId);
        const sentRequest = sentRequests.get(activeTabId);
        if (!response) return;

        try {
            const collectionResult = await getCollection(currentTeam.id, activeTab.collectionId);
            const collection = collectionResult.collection;

            // Build the saved response in Postman format
            const savedResponse: PostmanResponse = {
                name,
                originalRequest: sentRequest ? {
                    method: sentRequest.method,
                    url: sentRequest.url,
                    header: Object.entries(sentRequest.headers || {}).map(([key, value]) => ({
                        key,
                        value,
                    })),
                    body: sentRequest.body ? { mode: 'raw', raw: sentRequest.body } : undefined,
                } : undefined,
                status: response.status_text || `${response.status}`,
                code: response.status,
                header: Object.entries(response.headers || {}).map(([key, value]) => ({
                    key,
                    value,
                })),
                body: response.body,
                responseTime: response.time,
            };

            // Navigate to the item and add the response
            const pathParts = activeTab.itemPath.split('/');
            const requestName = pathParts[pathParts.length - 1];
            const folderPath = pathParts.slice(0, -1);

            const addResponseToItems = (items: any[], currentPath: string[]): any[] => {
                if (currentPath.length === 0) {
                    return items.map(item => {
                        if (item.name === requestName && item.request) {
                            const existingResponses = item.response || [];
                            return {
                                ...item,
                                response: [...existingResponses, savedResponse],
                            };
                        }
                        return item;
                    });
                }

                return items.map(item => {
                    if (item.name === currentPath[0] && item.item) {
                        return {
                            ...item,
                            item: addResponseToItems(item.item, currentPath.slice(1)),
                        };
                    }
                    return item;
                });
            };

            const updatedCollection = {
                ...collection,
                item: addResponseToItems(collection.item, folderPath),
            };

            await updateCollection(currentTeam.id, activeTab.collectionId, {
                raw_json: JSON.stringify(updatedCollection),
            });

            // Update only the affected collection in sidebar (no full refresh)
            setCollectionDataUpdate({ collectionId: activeTab.collectionId, data: updatedCollection, trigger: Date.now() });
        } catch (err) {
            console.error('Failed to save response:', err);
            alert('Failed to save response to collection');
        }
    }, [activeTab, activeTabId, currentTeam, responses, sentRequests]);

    const handleCollectionSelect = useCallback(async (collectionId: number, folderPath: string[]) => {
        setCollectionSelectorOpen(false);
        if (tabToSave) {
            await saveTabToCollection(tabToSave, collectionId, folderPath);
            // Only close the tab if requested (e.g., when closing tab with unsaved changes)
            if (closeTabAfterSave) {
                const tabId = tabToSave.id;
                setTabs(prev => {
                    const newTabs = prev.filter(t => t.id !== tabId);
                    if (tabId === activeTabId && newTabs.length > 0) {
                        const closedIndex = prev.findIndex(t => t.id === tabId);
                        const newActiveIndex = Math.min(closedIndex, newTabs.length - 1);
                        setActiveTabId(newTabs[newActiveIndex].id);
                    }
                    return newTabs;
                });
                setResponses(prev => {
                    const newResponses = new Map(prev);
                    newResponses.delete(tabId);
                    return newResponses;
                });
                setSentRequests(prev => {
                    const newRequests = new Map(prev);
                    newRequests.delete(tabId);
                    return newRequests;
                });
            }
            setTabToSave(null);
            setCloseTabAfterSave(false);
        }
    }, [tabToSave, saveTabToCollection, activeTabId]);

    const handleTabClose = useCallback((tabId: string) => {
        const tabToClose = tabs.find(t => t.id === tabId);

        const closeTab = () => {
            setTabs(prev => {
                const newTabs = prev.filter(t => t.id !== tabId);
                // If we closed the active tab, switch to another
                if (tabId === activeTabId && newTabs.length > 0) {
                    const closedIndex = prev.findIndex(t => t.id === tabId);
                    const newActiveIndex = Math.min(closedIndex, newTabs.length - 1);
                    setActiveTabId(newTabs[newActiveIndex].id);
                }
                return newTabs;
            });
            // Remove response and request for closed tab
            setResponses(prev => {
                const newResponses = new Map(prev);
                newResponses.delete(tabId);
                return newResponses;
            });
            setSentRequests(prev => {
                const newRequests = new Map(prev);
                newRequests.delete(tabId);
                return newRequests;
            });
        };

        // If tab has changes, show two-button modal
        if (tabToClose?.isDirty) {
            setConfirmModal({
                isOpen: true,
                title: 'Unsaved Changes',
                message: `"${tabToClose.name}" has unsaved changes. What would you like to do?`,
                cancelText: '', // Don't show cancel button
                thirdActionText: 'Discard changes',
                confirmText: 'Save changes',
                variant: 'info',
                thirdActionVariant: 'danger',
                onCancel: () => {
                    // Prevent closing modal by clicking outside or pressing Escape
                },
                onThirdAction: () => {
                    setConfirmModal(prev => ({ ...prev, isOpen: false }));
                    closeTab();
                },
                onConfirm: async () => {
                    setConfirmModal(prev => ({ ...prev, isOpen: false }));
                    // Check if this is a new tab (no itemPath)
                    if (!tabToClose.itemPath) {
                        // Show collection selector for new tabs to let user choose where to save
                        setTabToSave(tabToClose);
                        setCloseTabAfterSave(true); // Close tab after saving when triggered from close button
                        setCollectionSelectorOpen(true);
                    } else if (tabToClose.collectionId) {
                        // Existing tab with collection, save directly
                        await saveTabToCollection(tabToClose);
                        closeTab();
                    } else {
                        // Can't save without collection
                        closeTab();
                    }
                },
            });
        } else {
            // No changes, close immediately
            closeTab();
        }
    }, [activeTabId, tabs, saveTabToCollection]);

    // Load a saved response into a new tab with original request + response
    const handleLoadSavedResponse = useCallback((savedResponse: PostmanResponse, collectionId: number, itemPath: string, responseIndex: number) => {
        // Check if this saved response is already open in a tab
        const existingTab = tabs.find(tab =>
            tab.collectionId === collectionId &&
            tab.itemPath === itemPath &&
            tab.savedResponseIndex === responseIndex
        );
        if (existingTab) {
            setActiveTabId(existingTab.id);
            return;
        }

        // Extract original request data
        const origReq = savedResponse.originalRequest;
        const origUrl = origReq
            ? (typeof origReq.url === 'string'
                ? origReq.url
                : (origReq.url as any)?.raw || '')
            : '';
        const origHeaders: any[] = origReq
            ? (origReq.header || []).map(h => ({ key: h.key, value: h.value }))
            : [];
        const origBody = origReq?.body?.raw || '';
        const origMethod = origReq?.method || 'GET';
        const origQueryParams: any[] = [];
        if (origReq && typeof origReq.url === 'object' && origReq.url && 'query' in origReq.url) {
            const queryArr = (origReq.url as any).query || [];
            for (const q of queryArr) {
                if (q.key && !q.disabled) origQueryParams.push({ key: q.key, value: q.value || '' });
            }
        }

        // Create a new tab with the original request loaded
        const newTabId = generateId();
        const newTab: RequestTab = {
            id: newTabId,
            name: `${savedResponse.name} (${origMethod})`,
            method: origMethod,
            url: origUrl,
            headers: origHeaders,
            body: origBody,
            queryParams: origQueryParams,
            collectionId,
            itemPath,
            savedResponseIndex: responseIndex,
        };

        setTabs(prev => [...prev, newTab]);
        setActiveTabId(newTabId);

        // Build the SentRequest for the Response Viewer "Request Details" tab
        const sentReq: SentRequest = {
            method: origMethod,
            url: origUrl,
            headers: Object.fromEntries(origHeaders.map(h => [h.key, h.value])),
            body: origBody,
            bodyType: (origReq?.body?.mode as any) || 'none',
            queryParams: Object.fromEntries(origQueryParams.map(q => [q.key, q.value])),
            timestamp: Date.now(),
        };

        // Build the ExecuteResponse from the saved response
        const response: ExecuteResponse = {
            status: savedResponse.code,
            status_text: savedResponse.status,
            headers: Object.fromEntries(
                (savedResponse.header || []).map(h => [h.key, h.value])
            ),
            body: savedResponse.body,
            time: savedResponse.responseTime || 0,
        };

        // Use setTimeout so state from setTabs/setActiveTabId settles first
        setTimeout(() => {
            setResponses(prev => new Map(prev).set(newTabId, response));
            setSentRequests(prev => new Map(prev).set(newTabId, sentReq));
        }, 0);
    }, [tabs]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-dvh bg-background">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                    <p className="text-muted-foreground">Loading...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-dvh bg-background overflow-hidden">
            {/* cURL Import Modal */}
            <CurlImportModal
                isOpen={curlImportOpen}
                onClose={() => setCurlImportOpen(false)}
                onImport={handleCurlImport}
            />

            {/* UCode Import Modal */}
            <UCodeImportModal
                isOpen={ucodeImportOpen}
                onClose={() => setUcodeImportOpen(false)}
                onImport={handleUCodeImport}
            />

            {/* Confirm Modal */}
            <ConfirmModal
                isOpen={confirmModal.isOpen}
                title={confirmModal.title}
                message={confirmModal.message}
                confirmText={confirmModal.confirmText}
                cancelText={confirmModal.cancelText}
                thirdActionText={confirmModal.thirdActionText}
                variant={confirmModal.variant}
                thirdActionVariant={confirmModal.thirdActionVariant}
                onConfirm={confirmModal.onConfirm}
                onCancel={confirmModal.onCancel || (() => setConfirmModal(prev => ({ ...prev, isOpen: false })))}
                onThirdAction={confirmModal.onThirdAction}
            />

            {/* Collection Settings Modal */}
            {settingsCollectionId && (
                <CollectionSettingsModal
                    isOpen={true}
                    collectionName={collectionsData.find(c => c.id === settingsCollectionId)?.name || ''}
                    initialAuth={collectionAuthMap.get(settingsCollectionId)}
                    environments={environments}
                    onSave={handleCollectionAuthSave}
                    onClose={() => setSettingsCollectionId(null)}
                />
            )}

            {/* Collection Selector Modal */}
            <CollectionSelector
                isOpen={collectionSelectorOpen}
                onSelect={handleCollectionSelect}
                onCancel={() => {
                    setCollectionSelectorOpen(false);
                    setTabToSave(null);
                }}
            />

            {/* Mobile Sidebar Drawer */}
            {mobileSidebarOpen && (
                <div className="fixed inset-0 z-40 md:hidden">
                    <div className="mobile-sidebar-backdrop fixed inset-0" onClick={() => setMobileSidebarOpen(false)} />
                    <div className="mobile-sidebar-drawer relative z-10 flex flex-col h-full w-[85vw] max-w-80 bg-card shadow-xl">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                            <span className="font-semibold text-foreground">Collections</span>
                            <button
                                onClick={() => setMobileSidebarOpen(false)}
                                className="p-2 text-muted-foreground hover:bg-accent rounded-lg"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <CollectionImporter onImportSuccess={handleImportSuccess} onUCodeImport={() => setUcodeImportOpen(true)} />
                        <div className="flex-1 overflow-y-auto min-h-0">
                            <CollectionList
                                onRequestSelect={handleRequestSelect}
                                onLoadSavedResponse={handleLoadSavedResponse}
                                refreshTrigger={refreshTrigger}
                                collectionDataUpdate={collectionDataUpdate}
                            />
                        </div>
                        <button
                            onClick={() => { setShowGrafana(v => !v); setShowPerformance(false); setMobileSidebarOpen(false); }}
                            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-t border-border transition-colors ${showGrafana ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent'}`}
                        >
                            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                            Grafana
                        </button>
                        <button
                            onClick={() => { setShowPerformance(v => !v); setShowGrafana(false); setMobileSidebarOpen(false); }}
                            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-t border-border transition-colors ${showPerformance ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent'}`}
                        >
                            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                            Performance
                        </button>
                        <EnvironmentPanel onUpdate={handleEnvironmentsUpdate} />
                    </div>
                </div>
            )}

            {/* Desktop Sidebar */}
            <div className="hidden md:flex">
                <HorizontalSplitter
                    initialWidth={320}
                    minWidth={200}
                    maxWidth={500}
                    collapsed={sidebarCollapsed}
                    onCollapsedChange={setSidebarCollapsed}
                >
                    <CollectionImporter onImportSuccess={handleImportSuccess} onUCodeImport={() => setUcodeImportOpen(true)} />
                    <div className="flex-1 overflow-y-auto min-h-0">
                        <CollectionList
                            onRequestSelect={handleRequestSelect}
                            onLoadSavedResponse={handleLoadSavedResponse}
                            onCollectionSettings={setSettingsCollectionId}
                            refreshTrigger={refreshTrigger}
                            collectionDataUpdate={collectionDataUpdate}
                        />
                    </div>
                    <button
                        onClick={() => { setShowGrafana(v => !v); setShowPerformance(false); }}
                        className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-t border-border transition-colors ${showGrafana ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent'}`}
                    >
                        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                        Grafana
                    </button>
                    <button
                        onClick={() => { setShowPerformance(v => !v); setShowGrafana(false); }}
                        className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-t border-border transition-colors ${showPerformance ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent'}`}
                    >
                        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        Performance
                    </button>
                    <EnvironmentPanel onUpdate={handleEnvironmentsUpdate} />
                </HorizontalSplitter>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
                {/* Header */}
                <Header onToggleSidebar={toggleMobileSidebar} />

                {/* Grafana View */}
                {showGrafana && (
                    <div className="flex-1 flex flex-col min-h-0">
                        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card flex-shrink-0">
                            <span className="text-sm font-medium text-foreground flex items-center gap-2">
                                <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                </svg>
                                Grafana
                            </span>
                            <button
                                onClick={() => setShowGrafana(false)}
                                className="p-1 text-muted-foreground hover:bg-accent rounded"
                                title="Close Grafana"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <iframe
                            src={import.meta.env.VITE_GRAFANA_URL || '/grafana'}
                            className="flex-1 w-full border-0"
                            title="Grafana"
                            allow="fullscreen"
                        />
                    </div>
                )}

                {/* Performance View */}
                {showPerformance && (
                    <div className="flex-1 flex flex-col min-h-0">
                        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card flex-shrink-0">
                            <span className="text-sm font-medium text-foreground flex items-center gap-2">
                                <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                                Performance Testing
                            </span>
                            <button
                                onClick={() => setShowPerformance(false)}
                                className="p-1 text-muted-foreground hover:bg-accent rounded"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <PerformancePanel />
                    </div>
                )}

                {/* Tabs + Request Area */}
                {!showGrafana && !showPerformance && <>
                <TabsBar
                    tabs={tabs}
                    activeTabId={activeTabId}
                    onTabSelect={handleTabSelect}
                    onTabClose={handleTabClose}
                    onTabRename={handleTabRename}
                    onNewTab={handleNewTab}
                    onImportCurl={handleImportCurl}
                />

                {/* Content Area */}
                {tabs.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center bg-background p-4">
                        <div className="text-center max-w-md">
                            <svg className="w-16 h-16 md:w-24 md:h-24 mx-auto mb-4 md:mb-6 text-border" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-2 md:mb-3">No Tabs Open</h2>
                            <p className="text-sm md:text-base text-muted-foreground mb-4 md:mb-6">
                                Start by creating a new request or importing from cURL
                            </p>
                            <div className="flex flex-col sm:flex-row gap-3 justify-center">
                                <button
                                    onClick={handleNewTab}
                                    className="px-5 py-2.5 md:px-6 md:py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-medium flex items-center justify-center gap-2"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                    </svg>
                                    New Request
                                </button>
                                <button
                                    onClick={handleImportCurl}
                                    className="px-5 py-2.5 md:px-6 md:py-3 bg-muted hover:bg-accent text-foreground rounded-lg font-medium flex items-center justify-center gap-2 border border-border"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                                    </svg>
                                    Import cURL
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <ResizableSplitter
                        initialTopHeight={50}
                        minTopHeight={20}
                        maxTopHeight={80}
                        collapsed={responseCollapsed}
                        onCollapsedChange={setResponseCollapsed}
                        topPanel={
                            <RequestBuilder
                                key={activeTabId}
                                initialMethod={activeTab?.method || 'GET'}
                                initialUrl={activeTab?.url || ''}
                                initialHeaders={activeTab?.headers || {}}
                                initialBody={activeTab?.body || ''}
                                initialQueryParams={activeTab?.queryParams || {}}
                                initialName={activeTab?.name || 'Untitled'}
                                initialDocs={activeTab?.docs || ''}
                                environments={environments}
                                initialEnvId={initialEnvId}
                                onEnvironmentChange={activeTab?.collectionId ? handleCollectionEnvChange : undefined}
                                onResponse={handleResponse}
                                onUpdate={handleTabUpdate}
                                hasCollectionSource={!!activeTab?.collectionId}
                                onSaveToCollection={handleSaveToCollection}
                                collectionAuth={activeTab?.collectionId ? collectionAuthMap.get(activeTab.collectionId) : undefined}
                            />
                        }
                        bottomPanel={
                            <ResponseViewer
                                response={currentResponse}
                                request={currentSentRequest}
                                onSaveResponse={handleSaveResponse}
                                canSaveResponse={!!(activeTab?.collectionId && activeTab?.itemPath && currentResponse)}
                            />
                        }
                    />
                )}
                    </>}

            </div>
        </div>
    );
}