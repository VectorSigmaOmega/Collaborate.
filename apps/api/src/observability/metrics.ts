type MetricSnapshot = {
  activeRooms: number;
  activeParticipants: number;
  roomExpirations: number;
  rejectedEvents: number;
  socketErrors: number;
};

export class MetricsRegistry {
  private snapshot: MetricSnapshot = {
    activeRooms: 0,
    activeParticipants: 0,
    roomExpirations: 0,
    rejectedEvents: 0,
    socketErrors: 0
  };

  setRoomStats(activeRooms: number, activeParticipants: number) {
    this.snapshot.activeRooms = activeRooms;
    this.snapshot.activeParticipants = activeParticipants;
  }

  incRoomExpirations() {
    this.snapshot.roomExpirations += 1;
  }

  incRejectedEvents() {
    this.snapshot.rejectedEvents += 1;
  }

  incSocketErrors() {
    this.snapshot.socketErrors += 1;
  }

  toJSON() {
    return { ...this.snapshot };
  }

  renderPrometheus() {
    const lines = [
      "# HELP collaborate_active_rooms Current number of active rooms.",
      "# TYPE collaborate_active_rooms gauge",
      `collaborate_active_rooms ${this.snapshot.activeRooms}`,
      "# HELP collaborate_active_participants Current number of connected participants.",
      "# TYPE collaborate_active_participants gauge",
      `collaborate_active_participants ${this.snapshot.activeParticipants}`,
      "# HELP collaborate_room_expirations_total Total number of expired rooms.",
      "# TYPE collaborate_room_expirations_total counter",
      `collaborate_room_expirations_total ${this.snapshot.roomExpirations}`,
      "# HELP collaborate_rejected_events_total Total number of rejected socket events.",
      "# TYPE collaborate_rejected_events_total counter",
      `collaborate_rejected_events_total ${this.snapshot.rejectedEvents}`,
      "# HELP collaborate_socket_errors_total Total number of socket transport errors.",
      "# TYPE collaborate_socket_errors_total counter",
      `collaborate_socket_errors_total ${this.snapshot.socketErrors}`
    ];

    return `${lines.join("\n")}\n`;
  }
}
