export const CLIENT_EVENTS = {
  roomJoin: "room:join",
  roomLeave: "room:leave",
  roomResync: "room:resync",
  itemPreview: "board:item_preview",
  itemCommit: "board:item_commit",
  itemMove: "board:item_move",
  undo: "board:undo",
  redo: "board:redo",
  clearMine: "board:clear_mine"
} as const;

export const SERVER_EVENTS = {
  roomSync: "room:sync",
  roomPresence: "room:presence",
  roomError: "room:error",
  roomStatus: "room:status",
  roomExpired: "room:expired",
  itemPreview: "board:item_preview",
  itemCommitted: "board:item_committed",
  itemsCommitted: "board:items_committed",
  itemMoved: "board:item_moved",
  boardReplaced: "board:replace",
  boardCapabilities: "board:capabilities"
} as const;

export type ClientEventName = (typeof CLIENT_EVENTS)[keyof typeof CLIENT_EVENTS];
export type ServerEventName = (typeof SERVER_EVENTS)[keyof typeof SERVER_EVENTS];
