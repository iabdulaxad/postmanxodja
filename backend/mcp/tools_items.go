package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"postmanxodja/database"
	"postmanxodja/models"
	"postmanxodja/services"

	mcpsdk "github.com/mark3labs/mcp-go/mcp"
)

// ---- tool definitions ----

func listFoldersTool() mcpsdk.Tool {
	return mcpsdk.NewTool("list_folders",
		mcpsdk.WithDescription("List all top-level folders and requests in a collection."),
		mcpsdk.WithNumber("team_id", mcpsdk.Required(), mcpsdk.Description("Team ID.")),
		mcpsdk.WithNumber("collection_id", mcpsdk.Required(), mcpsdk.Description("Collection ID.")),
	)
}

func createFolderTool() mcpsdk.Tool {
	return mcpsdk.NewTool("create_folder",
		mcpsdk.WithDescription("Create a new folder inside a collection or inside an existing folder."),
		mcpsdk.WithNumber("team_id", mcpsdk.Required(), mcpsdk.Description("Team ID.")),
		mcpsdk.WithNumber("collection_id", mcpsdk.Required(), mcpsdk.Description("Collection ID.")),
		mcpsdk.WithString("name", mcpsdk.Required(), mcpsdk.Description("Folder name.")),
		mcpsdk.WithString("parent_folder", mcpsdk.Description("Parent folder name. Omit to create at collection root.")),
	)
}

func renameFolderTool() mcpsdk.Tool {
	return mcpsdk.NewTool("rename_folder",
		mcpsdk.WithDescription("Rename an existing folder in a collection."),
		mcpsdk.WithNumber("team_id", mcpsdk.Required(), mcpsdk.Description("Team ID.")),
		mcpsdk.WithNumber("collection_id", mcpsdk.Required(), mcpsdk.Description("Collection ID.")),
		mcpsdk.WithString("folder_name", mcpsdk.Required(), mcpsdk.Description("Current folder name.")),
		mcpsdk.WithString("new_name", mcpsdk.Required(), mcpsdk.Description("New folder name.")),
	)
}

func deleteFolderTool() mcpsdk.Tool {
	return mcpsdk.NewTool("delete_folder",
		mcpsdk.WithDescription("Delete a folder and all its contents from a collection."),
		mcpsdk.WithNumber("team_id", mcpsdk.Required(), mcpsdk.Description("Team ID.")),
		mcpsdk.WithNumber("collection_id", mcpsdk.Required(), mcpsdk.Description("Collection ID.")),
		mcpsdk.WithString("folder_name", mcpsdk.Required(), mcpsdk.Description("Folder name to delete.")),
	)
}

func addRequestTool() mcpsdk.Tool {
	return mcpsdk.NewTool("add_request",
		mcpsdk.WithDescription("Add a new HTTP request to a collection or to a specific folder inside it."),
		mcpsdk.WithNumber("team_id", mcpsdk.Required(), mcpsdk.Description("Team ID.")),
		mcpsdk.WithNumber("collection_id", mcpsdk.Required(), mcpsdk.Description("Collection ID.")),
		mcpsdk.WithString("name", mcpsdk.Required(), mcpsdk.Description("Request name.")),
		mcpsdk.WithString("method", mcpsdk.Required(), mcpsdk.Description("HTTP method: GET, POST, PUT, PATCH, DELETE, etc.")),
		mcpsdk.WithString("url", mcpsdk.Required(), mcpsdk.Description("Request URL (may contain {{variable}} placeholders).")),
		mcpsdk.WithString("folder_name", mcpsdk.Description("Folder to add the request into. Omit for collection root.")),
		mcpsdk.WithString("headers", mcpsdk.Description(`Headers as a JSON object, e.g. {"Content-Type":"application/json","Authorization":"Bearer {{token}}"}.`)),
		mcpsdk.WithString("body", mcpsdk.Description("Request body string.")),
		mcpsdk.WithString("body_type", mcpsdk.Description("Body mode: raw, formdata, urlencoded. Defaults to raw.")),
		mcpsdk.WithString("description", mcpsdk.Description("Optional request description.")),
	)
}

func updateRequestTool() mcpsdk.Tool {
	return mcpsdk.NewTool("update_request",
		mcpsdk.WithDescription("Update fields of an existing request in a collection or folder."),
		mcpsdk.WithNumber("team_id", mcpsdk.Required(), mcpsdk.Description("Team ID.")),
		mcpsdk.WithNumber("collection_id", mcpsdk.Required(), mcpsdk.Description("Collection ID.")),
		mcpsdk.WithString("request_name", mcpsdk.Required(), mcpsdk.Description("Current name of the request to update.")),
		mcpsdk.WithString("folder_name", mcpsdk.Description("Folder containing the request. Omit for collection root.")),
		mcpsdk.WithString("new_name", mcpsdk.Description("Rename the request.")),
		mcpsdk.WithString("method", mcpsdk.Description("New HTTP method.")),
		mcpsdk.WithString("url", mcpsdk.Description("New URL.")),
		mcpsdk.WithString("headers", mcpsdk.Description(`New headers as JSON object. Replaces all existing headers.`)),
		mcpsdk.WithString("body", mcpsdk.Description("New request body.")),
		mcpsdk.WithString("description", mcpsdk.Description("New documentation/description for the request.")),
	)
}

func deleteRequestTool() mcpsdk.Tool {
	return mcpsdk.NewTool("delete_request",
		mcpsdk.WithDescription("Delete a request from a collection or folder."),
		mcpsdk.WithNumber("team_id", mcpsdk.Required(), mcpsdk.Description("Team ID.")),
		mcpsdk.WithNumber("collection_id", mcpsdk.Required(), mcpsdk.Description("Collection ID.")),
		mcpsdk.WithString("request_name", mcpsdk.Required(), mcpsdk.Description("Name of the request to delete.")),
		mcpsdk.WithString("folder_name", mcpsdk.Description("Folder containing the request. Omit for collection root.")),
	)
}

func setCollectionEnvironmentTool() mcpsdk.Tool {
	return mcpsdk.NewTool("set_collection_environment",
		mcpsdk.WithDescription("Link an environment to a collection, or unlink it by passing 0."),
		mcpsdk.WithNumber("team_id", mcpsdk.Required(), mcpsdk.Description("Team ID.")),
		mcpsdk.WithNumber("collection_id", mcpsdk.Required(), mcpsdk.Description("Collection ID.")),
		mcpsdk.WithNumber("environment_id", mcpsdk.Description("Environment ID to link. Pass 0 to unlink.")),
	)
}

func exportCollectionTool() mcpsdk.Tool {
	return mcpsdk.NewTool("export_collection",
		mcpsdk.WithDescription("Export a collection as a Postman v2.1 JSON string."),
		mcpsdk.WithNumber("team_id", mcpsdk.Required(), mcpsdk.Description("Team ID.")),
		mcpsdk.WithNumber("collection_id", mcpsdk.Required(), mcpsdk.Description("Collection ID.")),
	)
}

// ---- helpers ----

func colLoad(teamID, colID uint) (*models.Collection, *models.PostmanCollection, error) {
	var col models.Collection
	if err := database.GetDB().Where("id = ? AND team_id = ?", colID, teamID).First(&col).Error; err != nil {
		return nil, nil, fmt.Errorf("collection not found")
	}
	parsed, err := services.ParsePostmanCollection(col.RawJSON)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to parse collection: %w", err)
	}
	return &col, parsed, nil
}

func colSave(col *models.Collection, parsed *models.PostmanCollection) error {
	b, err := json.Marshal(parsed)
	if err != nil {
		return err
	}
	col.RawJSON = string(b)
	return database.GetDB().Save(col).Error
}

// findFolderSlice returns a pointer to the Item slice of the folder named `name`,
// searching recursively. Returns nil if not found.
func findFolderSlice(items []models.PostmanItem, name string) *[]models.PostmanItem {
	for i := range items {
		if items[i].Request == nil && items[i].Name == name {
			return &items[i].Item
		}
		if found := findFolderSlice(items[i].Item, name); found != nil {
			return found
		}
	}
	return nil
}

// renameFolderIn renames the first folder matching oldName, returns true on success.
func renameFolderIn(items []models.PostmanItem, oldName, newName string) bool {
	for i := range items {
		if items[i].Request == nil && items[i].Name == oldName {
			items[i].Name = newName
			return true
		}
		if renameFolderIn(items[i].Item, oldName, newName) {
			return true
		}
	}
	return false
}

// deleteItemIn removes the first item matching name and isFolder flag, returns true on success.
func deleteItemIn(items *[]models.PostmanItem, name string, isFolder bool) bool {
	for i := range *items {
		it := &(*items)[i]
		matchFolder := it.Request == nil && isFolder
		matchRequest := it.Request != nil && !isFolder
		if it.Name == name && (matchFolder || matchRequest) {
			*items = append((*items)[:i], (*items)[i+1:]...)
			return true
		}
		if it.Request == nil {
			if deleteItemIn(&it.Item, name, isFolder) {
				return true
			}
		}
	}
	return false
}

// modifyRequest finds a request by name (optionally inside a named folder) and applies fn.
func modifyRequest(items []models.PostmanItem, reqName, folderName string, fn func(*models.PostmanItem)) bool {
	search := items
	if folderName != "" {
		ptr := findFolderSlice(items, folderName)
		if ptr == nil {
			return false
		}
		search = *ptr
	}
	for i := range search {
		if search[i].Name == reqName && search[i].Request != nil {
			fn(&search[i])
			return true
		}
	}
	return false
}

func headersToKV(s string) ([]models.PostmanKeyValue, error) {
	if s == "" {
		return nil, nil
	}
	var m map[string]string
	if err := json.Unmarshal([]byte(s), &m); err != nil {
		return nil, err
	}
	kvs := make([]models.PostmanKeyValue, 0, len(m))
	for k, v := range m {
		kvs = append(kvs, models.PostmanKeyValue{Key: k, Value: v})
	}
	return kvs, nil
}

// ---- handlers ----

func listFoldersHandler(ctx context.Context, req mcpsdk.CallToolRequest) (*mcpsdk.CallToolResult, error) {
	teamID, err := ctxTeamID(ctx)
	if err != nil {
		return errResult(err.Error())
	}
	colID, err := numParam(req, "collection_id")
	if err != nil {
		return errResult(err.Error())
	}

	_, parsed, err2 := colLoad(teamID, colID)
	if err2 != nil {
		return errResult(err2.Error())
	}

	type entry struct {
		Name      string `json:"name"`
		Type      string `json:"type"`
		ItemCount int    `json:"item_count,omitempty"`
		Method    string `json:"method,omitempty"`
	}
	var out []entry
	for _, it := range parsed.Item {
		if it.Request == nil {
			out = append(out, entry{Name: it.Name, Type: "folder", ItemCount: len(it.Item)})
		} else {
			out = append(out, entry{Name: it.Name, Type: "request", Method: it.Request.Method})
		}
	}
	return jsonResult(out), nil
}

func createFolderHandler(ctx context.Context, req mcpsdk.CallToolRequest) (*mcpsdk.CallToolResult, error) {
	teamID, err := ctxTeamID(ctx)
	if err != nil {
		return errResult(err.Error())
	}
	colID, err := numParam(req, "collection_id")
	if err != nil {
		return errResult(err.Error())
	}
	name := strParam(req, "name")
	if name == "" {
		return errResult("name is required")
	}
	parentFolder := strParam(req, "parent_folder")

	col, parsed, err2 := colLoad(teamID, colID)
	if err2 != nil {
		return errResult(err2.Error())
	}

	newFolder := models.PostmanItem{Name: name, Item: []models.PostmanItem{}}

	if parentFolder != "" {
		target := findFolderSlice(parsed.Item, parentFolder)
		if target == nil {
			return errResult(fmt.Sprintf("parent folder '%s' not found", parentFolder))
		}
		*target = append(*target, newFolder)
	} else {
		parsed.Item = append(parsed.Item, newFolder)
	}

	if err := colSave(col, parsed); err != nil {
		return errResult("failed to save: " + err.Error())
	}
	return textResult(fmt.Sprintf("folder '%s' created", name)), nil
}

func renameFolderHandler(ctx context.Context, req mcpsdk.CallToolRequest) (*mcpsdk.CallToolResult, error) {
	teamID, err := ctxTeamID(ctx)
	if err != nil {
		return errResult(err.Error())
	}
	colID, err := numParam(req, "collection_id")
	if err != nil {
		return errResult(err.Error())
	}
	folderName := strParam(req, "folder_name")
	newName := strParam(req, "new_name")
	if folderName == "" || newName == "" {
		return errResult("folder_name and new_name are required")
	}

	col, parsed, err2 := colLoad(teamID, colID)
	if err2 != nil {
		return errResult(err2.Error())
	}

	if !renameFolderIn(parsed.Item, folderName, newName) {
		return errResult(fmt.Sprintf("folder '%s' not found", folderName))
	}

	if err := colSave(col, parsed); err != nil {
		return errResult("failed to save: " + err.Error())
	}
	return textResult(fmt.Sprintf("folder renamed to '%s'", newName)), nil
}

func deleteFolderHandler(ctx context.Context, req mcpsdk.CallToolRequest) (*mcpsdk.CallToolResult, error) {
	teamID, err := ctxTeamID(ctx)
	if err != nil {
		return errResult(err.Error())
	}
	colID, err := numParam(req, "collection_id")
	if err != nil {
		return errResult(err.Error())
	}
	folderName := strParam(req, "folder_name")
	if folderName == "" {
		return errResult("folder_name is required")
	}

	col, parsed, err2 := colLoad(teamID, colID)
	if err2 != nil {
		return errResult(err2.Error())
	}

	if !deleteItemIn(&parsed.Item, folderName, true) {
		return errResult(fmt.Sprintf("folder '%s' not found", folderName))
	}

	if err := colSave(col, parsed); err != nil {
		return errResult("failed to save: " + err.Error())
	}
	return textResult(fmt.Sprintf("folder '%s' deleted", folderName)), nil
}

func addRequestHandler(ctx context.Context, req mcpsdk.CallToolRequest) (*mcpsdk.CallToolResult, error) {
	teamID, err := ctxTeamID(ctx)
	if err != nil {
		return errResult(err.Error())
	}
	colID, err := numParam(req, "collection_id")
	if err != nil {
		return errResult(err.Error())
	}
	name := strParam(req, "name")
	method := strParam(req, "method")
	rawURL := strParam(req, "url")
	if name == "" || method == "" || rawURL == "" {
		return errResult("name, method, and url are required")
	}

	headers, herr := headersToKV(strParam(req, "headers"))
	if herr != nil {
		return errResult("invalid headers JSON: " + herr.Error())
	}

	bodyStr := strParam(req, "body")
	bodyType := strParam(req, "body_type")
	if bodyType == "" {
		bodyType = "raw"
	}

	var postmanBody *models.PostmanRequestBody
	if bodyStr != "" {
		postmanBody = &models.PostmanRequestBody{Mode: bodyType, Raw: bodyStr}
		if bodyType == "raw" {
			postmanBody.Options = &models.PostmanBodyOptions{Raw: &models.PostmanRawOptions{Language: "json"}}
		}
	}

	newItem := models.PostmanItem{
		Name:        name,
		Description: strParam(req, "description"),
		Request: &models.PostmanRequest{
			Method: method,
			URL:    rawURL,
			Header: headers,
			Body:   postmanBody,
		},
		Item: []models.PostmanItem{},
	}

	col, parsed, err2 := colLoad(teamID, colID)
	if err2 != nil {
		return errResult(err2.Error())
	}

	folderName := strParam(req, "folder_name")
	if folderName != "" {
		target := findFolderSlice(parsed.Item, folderName)
		if target == nil {
			return errResult(fmt.Sprintf("folder '%s' not found", folderName))
		}
		*target = append(*target, newItem)
	} else {
		parsed.Item = append(parsed.Item, newItem)
	}

	if err := colSave(col, parsed); err != nil {
		return errResult("failed to save: " + err.Error())
	}
	return textResult(fmt.Sprintf("request '%s' added", name)), nil
}

func updateRequestHandler(ctx context.Context, req mcpsdk.CallToolRequest) (*mcpsdk.CallToolResult, error) {
	teamID, err := ctxTeamID(ctx)
	if err != nil {
		return errResult(err.Error())
	}
	colID, err := numParam(req, "collection_id")
	if err != nil {
		return errResult(err.Error())
	}
	requestName := strParam(req, "request_name")
	if requestName == "" {
		return errResult("request_name is required")
	}
	folderName := strParam(req, "folder_name")

	col, parsed, err2 := colLoad(teamID, colID)
	if err2 != nil {
		return errResult(err2.Error())
	}

	// Capture params before closure
	newName := strParam(req, "new_name")
	newMethod := strParam(req, "method")
	newURL := strParam(req, "url")
	newHeadersStr := strParam(req, "headers")
	newBody := strParam(req, "body")
	newDescription := strParam(req, "description")

	found := modifyRequest(parsed.Item, requestName, folderName, func(item *models.PostmanItem) {
		if newName != "" {
			item.Name = newName
		}
		if newMethod != "" {
			item.Request.Method = newMethod
		}
		if newURL != "" {
			item.Request.URL = newURL
		}
		if newHeadersStr != "" {
			kvs, _ := headersToKV(newHeadersStr)
			item.Request.Header = kvs
		}
		if newBody != "" {
			if item.Request.Body == nil {
				item.Request.Body = &models.PostmanRequestBody{Mode: "raw"}
			}
			item.Request.Body.Raw = newBody
		}
		if newDescription != "" {
			item.Description = newDescription
		}
	})

	if !found {
		return errResult(fmt.Sprintf("request '%s' not found", requestName))
	}

	if err := colSave(col, parsed); err != nil {
		return errResult("failed to save: " + err.Error())
	}
	return textResult(fmt.Sprintf("request '%s' updated", requestName)), nil
}

func deleteRequestHandler(ctx context.Context, req mcpsdk.CallToolRequest) (*mcpsdk.CallToolResult, error) {
	teamID, err := ctxTeamID(ctx)
	if err != nil {
		return errResult(err.Error())
	}
	colID, err := numParam(req, "collection_id")
	if err != nil {
		return errResult(err.Error())
	}
	requestName := strParam(req, "request_name")
	if requestName == "" {
		return errResult("request_name is required")
	}
	folderName := strParam(req, "folder_name")

	col, parsed, err2 := colLoad(teamID, colID)
	if err2 != nil {
		return errResult(err2.Error())
	}

	target := &parsed.Item
	if folderName != "" {
		ptr := findFolderSlice(parsed.Item, folderName)
		if ptr == nil {
			return errResult(fmt.Sprintf("folder '%s' not found", folderName))
		}
		target = ptr
	}

	if !deleteItemIn(target, requestName, false) {
		return errResult(fmt.Sprintf("request '%s' not found", requestName))
	}

	if err := colSave(col, parsed); err != nil {
		return errResult("failed to save: " + err.Error())
	}
	return textResult(fmt.Sprintf("request '%s' deleted", requestName)), nil
}

func setCollectionEnvironmentHandler(ctx context.Context, req mcpsdk.CallToolRequest) (*mcpsdk.CallToolResult, error) {
	teamID, err := ctxTeamID(ctx)
	if err != nil {
		return errResult(err.Error())
	}
	colID, err := numParam(req, "collection_id")
	if err != nil {
		return errResult(err.Error())
	}

	var col models.Collection
	if err := database.GetDB().Where("id = ? AND team_id = ?", colID, teamID).First(&col).Error; err != nil {
		return errResult("collection not found")
	}

	envID, _ := numParam(req, "environment_id")
	if envID == 0 {
		col.EnvironmentID = nil
		if err := database.GetDB().Save(&col).Error; err != nil {
			return errResult("failed to unlink environment: " + err.Error())
		}
		return textResult("environment unlinked from collection"), nil
	}

	var env models.Environment
	if err := database.GetDB().Where("id = ? AND team_id = ?", envID, teamID).First(&env).Error; err != nil {
		return errResult("environment not found")
	}

	col.EnvironmentID = &envID
	if err := database.GetDB().Save(&col).Error; err != nil {
		return errResult("failed to link environment: " + err.Error())
	}
	return textResult(fmt.Sprintf("environment '%s' linked to collection '%s'", env.Name, col.Name)), nil
}

func exportCollectionHandler(ctx context.Context, req mcpsdk.CallToolRequest) (*mcpsdk.CallToolResult, error) {
	teamID, err := ctxTeamID(ctx)
	if err != nil {
		return errResult(err.Error())
	}
	colID, err := numParam(req, "collection_id")
	if err != nil {
		return errResult(err.Error())
	}

	var col models.Collection
	if err := database.GetDB().Where("id = ? AND team_id = ?", colID, teamID).First(&col).Error; err != nil {
		return errResult("collection not found")
	}
	return textResult(col.RawJSON), nil
}
