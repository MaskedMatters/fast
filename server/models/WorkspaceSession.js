import mongoose from "mongoose";

const workspaceSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    containerId: {
      type: String,
      default: null,
    },
    volumeName: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ["stopped", "starting", "running"],
      default: "stopped",
      required: true,
    },
    lastActiveAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

export default mongoose.model("WorkspaceSession", workspaceSessionSchema);
