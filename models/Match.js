import mongoose from "mongoose";

const MAX_STORED_EVENTS = 300;

const eventSchema = new mongoose.Schema(
  {
    type: { type: String, required: true },
    team: String,
    points: Number,
    half: Number,
    clockRemainingMs: Number,
    note: String,
    createdAt: { type: Date, default: Date.now },
    clientEventId: { type: String, required: true },
  },
  { _id: false },
);

const matchSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    nameA: { type: String, default: "TEAM A", trim: true },
    nameB: { type: String, default: "TEAM B", trim: true },
    scoreA: { type: Number, default: 0, min: 0 },
    scoreB: { type: Number, default: 0, min: 0 },

    half: { type: Number, enum: [1, 2], default: 1 },
    sideSwapped: { type: Boolean, default: false },
    endedEarly: { type: Boolean, default: false },

    halfDurationMs: { type: Number, default: 20 * 60 * 1000, min: 60 * 1000 },
    raidDurationMs: { type: Number, default: 30 * 1000, min: 5 * 1000 },

    matchRunning: { type: Boolean, default: false },
    matchRemainingMs: { type: Number, default: 20 * 60 * 1000, min: 0 },
    // Stored as epoch milliseconds, NOT Date. The control panel and display
    // both do `endAt - Date.now()` on this value. A Date field serializes to
    // an ISO string over JSON, and `"2024-...Z" - Date.now()` is NaN — that
    // silently froze every countdown fetched from the API.
    matchEndAt: { type: Number, default: null },

    raidRunning: { type: Boolean, default: false },
    raidRemainingMs: { type: Number, default: 30 * 1000, min: 0 },
    raidEndAt: { type: Number, default: null },

    overlayText: { type: String, default: null },

    // Only three real states are ever assigned. "break" / "finished" (shown
    // to clients as `phase`) are derived from status + overlayText below —
    // they used to also be stored in a parallel `phase` field, which meant
    // two fields could disagree about what state the match was actually in.
    status: {
      type: String,
      enum: ["upcoming", "live", "completed"],
      default: "upcoming",
    },

    version: { type: Number, default: 0 },
    events: { type: [eventSchema], default: [] },
    appliedEventIds: { type: [String], default: [] },
  },
  { timestamps: true, _id: false },
);

matchSchema.index({ updatedAt: -1 });

// Keep the embedded event log bounded — this is a live raid-by-raid ticker,
// not a permanent audit trail, so an unbounded array isn't worth the risk of
// a document growing past MongoDB's 16MB limit over a long tournament day.
matchSchema.pre("save", function capEvents(next) {
  if (this.events.length > MAX_STORED_EVENTS) {
    this.events = this.events.slice(this.events.length - MAX_STORED_EVENTS);
  }
  next();
});

export const Match = mongoose.model("Match", matchSchema);