import mongoose from "mongoose";

const eventSchema = new mongoose.Schema(
  {
    type: String,
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
    _id: String,
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    nameA: String,
    nameB: String,
    scoreA: Number,
    scoreB: Number,
    half: Number,
    sideSwapped: { type: Boolean, default: false },
    endedEarly: { type: Boolean, default: false },
    halfDurationMs: Number,
    raidDurationMs: Number,
    matchRunning: Boolean,
    matchRemainingMs: Number,
    matchEndAt: Date,
    raidRunning: Boolean,
    raidRemainingMs: Number,
    raidEndAt: Date,
    overlayText: String,
    status: {
      type: String,
      enum: ["upcoming", "live", "break", "finished", "completed"],
      default: "upcoming",
    },
    phase: {
      type: String,
      enum: ["upcoming", "live", "break", "finished", "completed"],
      default: "upcoming",
    },
    version: { type: Number, default: 0 },
    events: { type: [eventSchema], default: [] },
    appliedEventIds: { type: [String], default: [] },
  },
  { timestamps: true, _id: false },
);

export const Match = mongoose.model("Match", matchSchema);
