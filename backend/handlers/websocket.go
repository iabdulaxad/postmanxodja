package handlers

import (
	"log"
	"net/http"
	"net/url"
	"postmanxodja/services"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var wsUpgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		if origin == "" {
			return true
		}
		switch origin {
		case "http://localhost:5173",
			"http://localhost:3000",
			"https://postbaby.uz",
			"https://www.postbaby.uz":
			return true
		}
		return false
	},
}

// WebSocketEcho is a public WebSocket endpoint that echoes any message it
// receives. It is intentionally unauthenticated so it can be used as a
// connectivity / testing target from the request UI.
func WebSocketEcho(c *gin.Context) {
	conn, err := wsUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("ws echo: upgrade failed: %v", err)
		return
	}
	defer conn.Close()

	_ = conn.WriteMessage(websocket.TextMessage, []byte("connected to echo"))

	for {
		mt, msg, err := conn.ReadMessage()
		if err != nil {
			if !websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
				log.Printf("ws echo: read error: %v", err)
			}
			return
		}
		if err := conn.WriteMessage(mt, msg); err != nil {
			log.Printf("ws echo: write error: %v", err)
			return
		}
	}
}

// WebSocketProxy upgrades the incoming request, opens a second WebSocket
// connection to the URL given in the `target` query parameter, and pipes
// messages between the two in both directions.
//
// Auth: the JWT must be supplied either via the Sec-WebSocket-Protocol
// subprotocol (preferred in browsers, which cannot set custom headers on a
// handshake) or via the `token` query parameter as a fallback.
func WebSocketProxy(c *gin.Context) {
	if !authenticateWS(c) {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid or missing token"})
		return
	}

	target := c.Query("target")
	if target == "" {
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "target query parameter is required"})
		return
	}

	parsed, err := url.Parse(target)
	if err != nil || (parsed.Scheme != "ws" && parsed.Scheme != "wss") {
		c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "target must be a ws:// or wss:// URL"})
		return
	}

	clientConn, err := wsUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("ws proxy: client upgrade failed: %v", err)
		return
	}
	defer clientConn.Close()

	dialer := websocket.Dialer{
		HandshakeTimeout: 15 * time.Second,
	}
	upstream, _, err := dialer.Dial(target, nil)
	if err != nil {
		log.Printf("ws proxy: upstream dial failed: %v", err)
		_ = clientConn.WriteMessage(websocket.TextMessage, []byte("proxy: upstream dial failed: "+err.Error()))
		_ = clientConn.WriteControl(
			websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseAbnormalClosure, "upstream unreachable"),
			time.Now().Add(time.Second),
		)
		return
	}
	defer upstream.Close()

	var wg sync.WaitGroup
	wg.Add(2)

	go pipeWS(&wg, clientConn, upstream, "client→upstream")
	go pipeWS(&wg, upstream, clientConn, "upstream→client")

	wg.Wait()
}

func pipeWS(wg *sync.WaitGroup, from, to *websocket.Conn, label string) {
	defer wg.Done()
	for {
		mt, msg, err := from.ReadMessage()
		if err != nil {
			closeMsg := websocket.FormatCloseMessage(websocket.CloseNormalClosure, "peer closed")
			if ce, ok := err.(*websocket.CloseError); ok {
				closeMsg = websocket.FormatCloseMessage(ce.Code, ce.Text)
			}
			_ = to.WriteControl(websocket.CloseMessage, closeMsg, time.Now().Add(time.Second))
			return
		}
		if err := to.WriteMessage(mt, msg); err != nil {
			log.Printf("ws proxy: write error (%s): %v", label, err)
			return
		}
	}
}

// authenticateWS validates a JWT supplied as a Sec-WebSocket-Protocol value
// (e.g. "bearer.<jwt>") or as a `token` query parameter. Browsers can pass
// subprotocols to the WebSocket constructor but cannot set arbitrary headers,
// which is why the handshake header path is not used here.
func authenticateWS(c *gin.Context) bool {
	token := extractWSToken(c)
	if token == "" {
		return false
	}
	claims, err := services.ValidateJWT(token)
	if err != nil {
		return false
	}
	c.Set("user_id", claims.UserID)
	c.Set("email", claims.Email)
	return true
}

func extractWSToken(c *gin.Context) string {
	if t := c.Query("token"); t != "" {
		return t
	}
	protos := c.GetHeader("Sec-WebSocket-Protocol")
	if protos == "" {
		return ""
	}
	for _, p := range strings.Split(protos, ",") {
		p = strings.TrimSpace(p)
		if strings.HasPrefix(p, "bearer.") {
			return strings.TrimPrefix(p, "bearer.")
		}
	}
	return ""
}
