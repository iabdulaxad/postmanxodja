package handlers

import (
	"log"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"postmanxodja/database"
	"postmanxodja/models"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

// RunPerformanceTest starts a k6 browser performance test against a URL.
//
// @Summary     Run performance test
// @Description Run a k6 browser test against a URL and collect Web Vitals (LCP, CLS, FID, TTFB)
// @Tags        performance
// @Accept      json
// @Produce     json
// @Security    BearerAuth
// @Param       body  body  object{url=string}  true  "Target URL"
// @Success     200   {object}  models.PerformanceTest
// @Failure     400   {object}  object{error=string}
// @Router      /api/performance/test [post]
func RunPerformanceTest(c *gin.Context) {
	var req struct {
		URL string `json:"url" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if _, err := url.ParseRequestURI(req.URL); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid URL"})
		return
	}

	userID := c.GetUint("user_id")

	test := models.PerformanceTest{
		UserID:    userID,
		URL:       req.URL,
		Status:    "running",
		StartedAt: time.Now(),
	}
	if err := database.GetDB().Create(&test).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create test"})
		return
	}

	go runK6Test(test.ID, req.URL)

	c.JSON(http.StatusOK, test)
}

// GetPerformanceTest returns the status of a performance test.
//
// @Summary     Get performance test
// @Tags        performance
// @Produce     json
// @Security    BearerAuth
// @Param       id  path  int  true  "Test ID"
// @Success     200  {object}  models.PerformanceTest
// @Failure     404  {object}  object{error=string}
// @Router      /api/performance/test/{id} [get]
func GetPerformanceTest(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var test models.PerformanceTest
	if err := database.GetDB().First(&test, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "test not found"})
		return
	}
	c.JSON(http.StatusOK, test)
}

// ListPerformanceTests lists recent performance tests for the current user.
//
// @Summary     List performance tests
// @Tags        performance
// @Produce     json
// @Security    BearerAuth
// @Success     200  {array}  models.PerformanceTest
// @Router      /api/performance/tests [get]
func ListPerformanceTests(c *gin.Context) {
	userID := c.GetUint("user_id")
	var tests []models.PerformanceTest
	database.GetDB().Where("user_id = ?", userID).Order("created_at desc").Limit(20).Find(&tests)
	c.JSON(http.StatusOK, tests)
}

func runK6Test(testID uint, targetURL string) {
	scriptPath := "/opt/postmanxodja/k6/browser-test.js"
	if _, err := os.Stat(scriptPath); os.IsNotExist(err) {
		scriptPath = "./k6/browser-test.js"
	}

	influxURL := "http://localhost:8086/k6"
	cmd := exec.Command("k6", "run",
		"--out", "influxdb="+influxURL,
		"--env", "TARGET_URL="+targetURL,
		"--env", "TEST_ID="+strconv.Itoa(int(testID)),
		scriptPath,
	)
	cmd.Env = append(os.Environ(), "K6_BROWSER_HEADLESS=true")

	output, err := cmd.CombinedOutput()
	log.Printf("k6 test %d output: %s", testID, string(output))

	now := time.Now()
	update := map[string]interface{}{
		"ended_at": now,
		"status":   "completed",
	}
	if err != nil {
		// 104 = thresholds not met, 108 = browser issue — still mark completed so Grafana shows data
		if exitErr, ok := err.(*exec.ExitError); ok && (exitErr.ExitCode() == 104 || exitErr.ExitCode() == 108) {
			update["status"] = "completed"
		} else {
			update["status"] = "failed"
			update["error"] = err.Error()
		}
	}
	database.GetDB().Model(&models.PerformanceTest{}).Where("id = ?", testID).Updates(update)
}
