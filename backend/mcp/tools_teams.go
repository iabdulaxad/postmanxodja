package mcp

import (
	"context"
	"postmanxodja/database"
	"postmanxodja/models"

	mcpsdk "github.com/mark3labs/mcp-go/mcp"
)

func listTeamsTool() mcpsdk.Tool {
	return mcpsdk.NewTool("list_teams",
		mcpsdk.WithDescription("List all teams the authenticated user belongs to."),
	)
}

func listTeamsHandler(_ context.Context, _ mcpsdk.CallToolRequest) (*mcpsdk.CallToolResult, error) {
	var teams []models.Team
	if err := database.GetDB().Find(&teams).Error; err != nil {
		return errResult("database error: " + err.Error())
	}
	return jsonResult(teams), nil
}
