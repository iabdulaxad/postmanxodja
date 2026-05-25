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

func listTeamsHandler(ctx context.Context, _ mcpsdk.CallToolRequest) (*mcpsdk.CallToolResult, error) {
	teamID, err := ctxTeamID(ctx)
	if err != nil {
		return errResult(err.Error())
	}
	var team models.Team
	if err := database.GetDB().First(&team, teamID).Error; err != nil {
		return errResult("team not found")
	}
	return jsonResult([]models.Team{team}), nil
}
