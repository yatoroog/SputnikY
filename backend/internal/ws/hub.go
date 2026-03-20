package ws

import (
	"encoding/json"

	"github.com/rs/zerolog/log"
	"github.com/satellite-tracker/backend/internal/models"
)

// Hub maintains the set of active WebSocket clients and broadcasts messages.
type Hub struct {
	clients    map[*Client]bool
	register   chan *Client
	unregister chan *Client
	broadcast  chan []byte
}

// NewHub creates a new Hub.
func NewHub() *Hub {
	return &Hub{
		clients:    make(map[*Client]bool),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		broadcast:  make(chan []byte, 256),
	}
}

// Run starts the hub event loop. Must be called as a goroutine.
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.clients[client] = true
			log.Debug().Int("total_clients", len(h.clients)).Msg("WebSocket client connected")

		case client := <-h.unregister:
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
				log.Debug().Int("total_clients", len(h.clients)).Msg("WebSocket client disconnected")
			}

		case message := <-h.broadcast:
			for client := range h.clients {
				select {
				case client.send <- message:
				default:
					// Client's send buffer is full; drop it
					close(client.send)
					delete(h.clients, client)
				}
			}
		}
	}
}

// Register adds a client to the hub via the register channel.
func (h *Hub) Register(client *Client) {
	h.register <- client
}

// BroadcastPositions serializes position data and sends it to all connected clients.
// Each client only receives positions for satellites it has subscribed to (or all if no subscription).
func (h *Hub) BroadcastPositions(positions []models.SatellitePosition) {
	msg := models.WSMessage{
		Type: "positions",
		Data: positions,
	}

	data, err := json.Marshal(msg)
	if err != nil {
		log.Error().Err(err).Msg("Failed to marshal positions for broadcast")
		return
	}

	// Send to clients with filtering based on subscriptions
	for client := range h.clients {
		var filtered []models.SatellitePosition

		client.mu.RLock()
		hasSubscriptions := len(client.subscribedIDs) > 0
		if hasSubscriptions {
			for _, p := range positions {
				if client.subscribedIDs[p.ID] {
					filtered = append(filtered, p)
				}
			}
		}
		client.mu.RUnlock()

		var payload []byte
		if hasSubscriptions {
			filteredMsg := models.WSMessage{
				Type: "positions",
				Data: filtered,
			}
			payload, err = json.Marshal(filteredMsg)
			if err != nil {
				continue
			}
		} else {
			payload = data
		}

		select {
		case client.send <- payload:
		default:
			// Buffer full, will be cleaned up in the run loop
		}
	}
}
