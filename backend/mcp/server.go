package mcp

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"postmanxodja/database"
	"postmanxodja/models"
	"postmanxodja/services"
	"strconv"

	"github.com/gin-gonic/gin"
	mcpsdk "github.com/mark3labs/mcp-go/mcp"
	mcpserver "github.com/mark3labs/mcp-go/server"
)

type ctxKey struct{}

func withTeamID(ctx context.Context, teamID uint) context.Context {
	return context.WithValue(ctx, ctxKey{}, teamID)
}

// ctxTeamID returns the team_id injected by GinProxyHandler from the API key.
func ctxTeamID(ctx context.Context) (uint, error) {
	v, ok := ctx.Value(ctxKey{}).(uint)
	if !ok || v == 0 {
		return 0, fmt.Errorf("no team identity in request context")
	}
	return v, nil
}

// NewServer creates and returns an MCP server with all registered tools.
func NewServer() *mcpserver.StreamableHTTPServer {
	s := mcpserver.NewMCPServer(
		"postmanxodja",
		"1.0.0",
		mcpserver.WithToolCapabilities(false),
	)

	// Collection CRUD
	s.AddTool(listCollectionsTool(), listCollectionsHandler)
	s.AddTool(getCollectionTool(), getCollectionHandler)
	s.AddTool(createCollectionTool(), createCollectionHandler)
	s.AddTool(updateCollectionTool(), updateCollectionHandler)
	s.AddTool(deleteCollectionTool(), deleteCollectionHandler)
	s.AddTool(exportCollectionTool(), exportCollectionHandler)
	s.AddTool(setCollectionEnvironmentTool(), setCollectionEnvironmentHandler)

	// Folders & requests inside a collection
	s.AddTool(listFoldersTool(), listFoldersHandler)
	s.AddTool(createFolderTool(), createFolderHandler)
	s.AddTool(renameFolderTool(), renameFolderHandler)
	s.AddTool(deleteFolderTool(), deleteFolderHandler)
	s.AddTool(addRequestTool(), addRequestHandler)
	s.AddTool(updateRequestTool(), updateRequestHandler)
	s.AddTool(deleteRequestTool(), deleteRequestHandler)

	// Environment CRUD
	s.AddTool(listEnvironmentsTool(), listEnvironmentsHandler)
	s.AddTool(createEnvironmentTool(), createEnvironmentHandler)
	s.AddTool(getEnvironmentTool(), getEnvironmentHandler)
	s.AddTool(updateEnvironmentTool(), updateEnvironmentHandler)
	s.AddTool(deleteEnvironmentTool(), deleteEnvironmentHandler)
	s.AddTool(setEnvVariableTool(), setEnvVariableHandler)
	s.AddTool(deleteEnvVariableTool(), deleteEnvVariableHandler)

	// Teams
	s.AddTool(listTeamsTool(), listTeamsHandler)

	// Request execution
	s.AddTool(executeRequestTool(), executeRequestHandler)

	return mcpserver.NewStreamableHTTPServer(s, mcpserver.WithStateLess(true))
}

// ---------- tool definitions ----------

func listCollectionsTool() mcpsdk.Tool {
	return mcpsdk.NewTool("list_collections",
		mcpsdk.WithDescription("List all API collections for the authenticated team."),
		mcpsdk.WithNumber("team_id",
			mcpsdk.Required(),
			mcpsdk.Description("The numeric team ID whose collections to list."),
		),
	)
}

func getCollectionTool() mcpsdk.Tool {
	return mcpsdk.NewTool("get_collection",
		mcpsdk.WithDescription("Get a single collection with full details and parsed request items."),
		mcpsdk.WithNumber("team_id", mcpsdk.Required(), mcpsdk.Description("Team ID.")),
		mcpsdk.WithNumber("collection_id", mcpsdk.Required(), mcpsdk.Description("Collection ID.")),
	)
}

func createCollectionTool() mcpsdk.Tool {
	return mcpsdk.NewTool("create_collection",
		mcpsdk.WithDescription("Create a new API collection. Accepts either a name/description or a full Postman collection JSON."),
		mcpsdk.WithNumber("team_id", mcpsdk.Required(), mcpsdk.Description("Team ID.")),
		mcpsdk.WithString("name", mcpsdk.Description("Collection name (used when creating an empty collection).")),
		mcpsdk.WithString("description", mcpsdk.Description("Optional description.")),
		mcpsdk.WithString("raw_json", mcpsdk.Description("Full Postman collection v2.1 JSON string (overrides name/description).")),
	)
}

func updateCollectionTool() mcpsdk.Tool {
	return mcpsdk.NewTool("update_collection",
		mcpsdk.WithDescription("Update an existing collection's raw JSON or rename it."),
		mcpsdk.WithNumber("team_id", mcpsdk.Required(), mcpsdk.Description("Team ID.")),
		mcpsdk.WithNumber("collection_id", mcpsdk.Required(), mcpsdk.Description("Collection ID.")),
		mcpsdk.WithString("raw_json", mcpsdk.Description("New Postman collection v2.1 JSON.")),
		mcpsdk.WithString("name", mcpsdk.Description("New collection name.")),
	)
}

func deleteCollectionTool() mcpsdk.Tool {
	return mcpsdk.NewTool("delete_collection",
		mcpsdk.WithDescription("Delete a collection permanently."),
		mcpsdk.WithNumber("team_id", mcpsdk.Required(), mcpsdk.Description("Team ID.")),
		mcpsdk.WithNumber("collection_id", mcpsdk.Required(), mcpsdk.Description("Collection ID.")),
	)
}

func listEnvironmentsTool() mcpsdk.Tool {
	return mcpsdk.NewTool("list_environments",
		mcpsdk.WithDescription("List all environments for the authenticated team."),
		mcpsdk.WithNumber("team_id", mcpsdk.Required(), mcpsdk.Description("Team ID.")),
	)
}

func executeRequestTool() mcpsdk.Tool {
	return mcpsdk.NewTool("execute_request",
		mcpsdk.WithDescription("Execute an HTTP request and return the response. Variables in URL/headers/body are substituted from the chosen environment."),
		mcpsdk.WithString("method", mcpsdk.Required(), mcpsdk.Description("HTTP method: GET, POST, PUT, PATCH, DELETE, etc.")),
		mcpsdk.WithString("url", mcpsdk.Required(), mcpsdk.Description("Request URL (may contain {{variable}} placeholders).")),
		mcpsdk.WithString("body", mcpsdk.Description("Request body string.")),
		mcpsdk.WithString("headers", mcpsdk.Description("JSON object of request headers, e.g. {\"Content-Type\":\"application/json\"}.")),
		mcpsdk.WithString("query_params", mcpsdk.Description("JSON object of query parameters.")),
		mcpsdk.WithNumber("environment_id", mcpsdk.Description("Optional environment ID for variable substitution.")),
	)
}

// ---------- helpers ----------

func numParam(req mcpsdk.CallToolRequest, key string) (uint, error) {
	v, ok := req.GetArguments()[key]
	if !ok {
		return 0, fmt.Errorf("missing required parameter: %s", key)
	}
	switch n := v.(type) {
	case float64:
		return uint(n), nil
	case json.Number:
		i, err := n.Int64()
		return uint(i), err
	}
	return 0, fmt.Errorf("parameter %s must be a number", key)
}

func strParam(req mcpsdk.CallToolRequest, key string) string {
	v, _ := req.GetArguments()[key]
	s, _ := v.(string)
	return s
}

func textResult(text string) *mcpsdk.CallToolResult {
	return mcpsdk.NewToolResultText(text)
}

func jsonResult(v any) *mcpsdk.CallToolResult {
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return textResult("error marshalling response: " + err.Error())
	}
	return textResult(string(b))
}

func errResult(msg string) (*mcpsdk.CallToolResult, error) {
	return mcpsdk.NewToolResultError(msg), nil
}

// ---------- handlers ----------

func listCollectionsHandler(ctx context.Context, req mcpsdk.CallToolRequest) (*mcpsdk.CallToolResult, error) {
	teamID, err := ctxTeamID(ctx)
	if err != nil {
		return errResult(err.Error())
	}

	var cols []models.Collection
	if err := database.GetDB().Where("team_id = ?", teamID).Find(&cols).Error; err != nil {
		return errResult("database error: " + err.Error())
	}

	return jsonResult(cols), nil
}

func getCollectionHandler(ctx context.Context, req mcpsdk.CallToolRequest) (*mcpsdk.CallToolResult, error) {
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

	parsed, err := services.ParsePostmanCollection(col.RawJSON)
	if err != nil {
		return errResult("failed to parse collection: " + err.Error())
	}

	return jsonResult(map[string]any{
		"id":          col.ID,
		"name":        col.Name,
		"description": col.Description,
		"team_id":     col.TeamID,
		"created_at":  col.CreatedAt,
		"collection":  parsed,
	}), nil
}

func createCollectionHandler(ctx context.Context, req mcpsdk.CallToolRequest) (*mcpsdk.CallToolResult, error) {
	teamID, err := ctxTeamID(ctx)
	if err != nil {
		return errResult(err.Error())
	}

	rawJSON := strParam(req, "raw_json")
	name := strParam(req, "name")
	description := strParam(req, "description")

	var finalRaw string
	if rawJSON != "" {
		parsed, err := services.ParsePostmanCollection(rawJSON)
		if err != nil {
			return errResult("invalid Postman collection JSON: " + err.Error())
		}
		name, description = services.ExtractCollectionInfo(parsed)
		finalRaw = rawJSON
	} else if name != "" {
		finalRaw = services.CreateEmptyCollection(name, description)
	} else {
		return errResult("either name or raw_json must be provided")
	}

	col := models.Collection{
		Name:        name,
		Description: description,
		RawJSON:     finalRaw,
		TeamID:      &teamID,
	}
	if err := database.GetDB().Create(&col).Error; err != nil {
		return errResult("failed to create collection: " + err.Error())
	}

	return jsonResult(col), nil
}

func updateCollectionHandler(ctx context.Context, req mcpsdk.CallToolRequest) (*mcpsdk.CallToolResult, error) {
	teamID, err := ctxTeamID(ctx)
	if err != nil {
		return errResult(err.Error())
	}
	colID, err := numParam(req, "collection_id")
	if err != nil {
		return errResult(err.Error())
	}

	rawJSON := strParam(req, "raw_json")
	name := strParam(req, "name")

	if rawJSON == "" && name == "" {
		return errResult("either raw_json or name must be provided")
	}

	var col models.Collection
	if err := database.GetDB().Where("id = ? AND team_id = ?", colID, teamID).First(&col).Error; err != nil {
		return errResult("collection not found")
	}

	if rawJSON != "" {
		parsed, err := services.ParsePostmanCollection(rawJSON)
		if err != nil {
			return errResult("invalid collection format")
		}
		n, d := services.ExtractCollectionInfo(parsed)
		col.RawJSON = rawJSON
		col.Name = n
		col.Description = d
	} else {
		col.Name = name
		updated, err := services.UpdateCollectionName(col.RawJSON, name)
		if err != nil {
			return errResult("failed to update collection name")
		}
		col.RawJSON = updated
	}

	if err := database.GetDB().Save(&col).Error; err != nil {
		return errResult("failed to save collection: " + err.Error())
	}

	return jsonResult(col), nil
}

func deleteCollectionHandler(ctx context.Context, req mcpsdk.CallToolRequest) (*mcpsdk.CallToolResult, error) {
	teamID, err := ctxTeamID(ctx)
	if err != nil {
		return errResult(err.Error())
	}
	colID, err := numParam(req, "collection_id")
	if err != nil {
		return errResult(err.Error())
	}

	result := database.GetDB().Where("id = ? AND team_id = ?", colID, teamID).Delete(&models.Collection{})
	if result.RowsAffected == 0 {
		return errResult("collection not found")
	}

	return textResult("collection " + strconv.FormatUint(uint64(colID), 10) + " deleted"), nil
}

func listEnvironmentsHandler(ctx context.Context, req mcpsdk.CallToolRequest) (*mcpsdk.CallToolResult, error) {
	teamID, err := ctxTeamID(ctx)
	if err != nil {
		return errResult(err.Error())
	}

	var envs []models.Environment
	if err := database.GetDB().Where("team_id = ?", teamID).Find(&envs).Error; err != nil {
		return errResult("database error: " + err.Error())
	}

	return jsonResult(envs), nil
}

func executeRequestHandler(_ context.Context, req mcpsdk.CallToolRequest) (*mcpsdk.CallToolResult, error) {
	method := strParam(req, "method")
	rawURL := strParam(req, "url")
	if method == "" || rawURL == "" {
		return errResult("method and url are required")
	}

	execReq := models.ExecuteRequest{
		Method: method,
		URL:    rawURL,
		Body:   strParam(req, "body"),
	}

	if headersStr := strParam(req, "headers"); headersStr != "" {
		if err := json.Unmarshal([]byte(headersStr), &execReq.Headers); err != nil {
			return errResult("invalid headers JSON: " + err.Error())
		}
	}

	if qpStr := strParam(req, "query_params"); qpStr != "" {
		if err := json.Unmarshal([]byte(qpStr), &execReq.QueryParams); err != nil {
			return errResult("invalid query_params JSON: " + err.Error())
		}
	}

	if envID, err := numParam(req, "environment_id"); err == nil && envID > 0 {
		execReq.EnvironmentID = &envID
		var env models.Environment
		if dbErr := database.GetDB().First(&env, envID).Error; dbErr == nil {
			services.ReplaceInRequest(&execReq, env.Variables)
		}
	}

	resp, err := services.ExecuteHTTPRequest(&execReq)
	if err != nil {
		return errResult("request failed: " + err.Error())
	}

	return jsonResult(resp), nil
}

// GinProxyHandler returns a Gin handler that injects the API key's team_id into
// the request context before forwarding to the MCP server. Every MCP handler
// reads team scope exclusively from this context value, so a key can never
// access data outside its own team regardless of what team_id the caller passes.
func GinProxyHandler() gin.HandlerFunc {
	mcpHandler := NewServer()
	return func(c *gin.Context) {
		teamID := c.GetUint("team_id")

		body, err := io.ReadAll(c.Request.Body)
		if err != nil {
			c.AbortWithStatus(http.StatusBadRequest)
			return
		}
		c.Request.Body = io.NopCloser(bytes.NewReader(body))

		ctx := withTeamID(c.Request.Context(), teamID)
		mcpHandler.ServeHTTP(c.Writer, c.Request.WithContext(ctx))
	}
}
