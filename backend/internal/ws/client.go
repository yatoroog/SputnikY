package ws

import (
	"encoding/json"
	"sync"
	"time"

	"github.com/gofiber/contrib/websocket"
	"github.com/rs/zerolog/log"
	"github.com/satellite-tracker/backend/internal/models"
)

const (
	// Time allowed to write a message to the peer.
	writeWait = 10 * time.Second

	// Time allowed to read the next pong message from the peer.
	pongWait = 60 * time.Second

	// Send pings to peer with this period. Must be less than pongWait.
	pingPeriod = (pongWait * 9) / 10

	// Maximum message size allowed from peer.
	maxMessageSize = 4096
)

// Client represents a single WebSocket connection.
type Client struct {
	hub           *Hub
	conn          *websocket.Conn
	send          chan []byte
	mu            sync.RWMutex
	subscribedIDs map[string]bool
}

// NewClient creates a new Client attached to the given hub and connection.
func NewClient(hub *Hub, conn *websocket.Conn) *Client {
	return &Client{
		hub:           hub,
		conn:          conn,
		send:          make(chan []byte, 256),
		subscribedIDs: make(map[string]bool),
	}
}

// ReadPump reads messages from the WebSocket connection.
// It handles subscribe messages to update the client's subscription list.
func (c *Client) ReadPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()

	c.conn.SetReadLimit(maxMessageSize)

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				log.Warn().Err(err).Msg("WebSocket read error")
			}
			break
		}

		var subMsg models.SubscribeMessage
		if err := json.Unmarshal(message, &subMsg); err != nil {
			log.Warn().Err(err).Msg("Failed to parse WebSocket message")
			continue
		}

		switch subMsg.Type {
		case "subscribe":
			c.mu.Lock()
			c.subscribedIDs = make(map[string]bool, len(subMsg.IDs))
			for _, id := range subMsg.IDs {
				c.subscribedIDs[id] = true
			}
			c.mu.Unlock()
			log.Debug().Int("count", len(subMsg.IDs)).Msg("Client updated subscriptions")

		case "unsubscribe":
			c.mu.Lock()
			for _, id := range subMsg.IDs {
				delete(c.subscribedIDs, id)
			}
			c.mu.Unlock()
			log.Debug().Int("removed", len(subMsg.IDs)).Msg("Client removed subscriptions")

		case "unsubscribe_all":
			c.mu.Lock()
			c.subscribedIDs = make(map[string]bool)
			c.mu.Unlock()
			log.Debug().Msg("Client cleared all subscriptions")
		}
	}
}

// WritePump sends messages from the hub to the WebSocket connection.
func (c *Client) WritePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// The hub closed the channel.
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			err := c.conn.WriteMessage(websocket.TextMessage, message)
			if err != nil {
				log.Warn().Err(err).Msg("WebSocket write error")
				return
			}

		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
