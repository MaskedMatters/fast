import WorkspaceSession from "./models/WorkspaceSession.js";

function isNotFound(error) {
  return error?.statusCode === 404;
}

function isNotRunning(error) {
  return error?.statusCode === 304;
}

export class WorkspaceManager {
  constructor({ docker, image, proxyHost }) {
    this.docker = docker;
    this.image = image;
    this.proxyHost = proxyHost;
    this.operations = new Map();
    this.pulledImage = false;
  }

  async withUserLock(userId, operation) {
    const previous = this.operations.get(userId) ?? Promise.resolve();
    let release;
    const current = new Promise((resolve) => {
      release = resolve;
    });
    this.operations.set(userId, current);
    await previous;

    try {
      return await operation();
    } finally {
      release();
      if (this.operations.get(userId) === current) {
        this.operations.delete(userId);
      }
    }
  }

  async getOrCreateSession(userId) {
    return WorkspaceSession.findOneAndUpdate(
      { userId },
      { $setOnInsert: { userId, status: "stopped" } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
  }

  async ensureImage() {
    if (this.pulledImage) {
      return;
    }

    try {
      await this.docker.getImage(this.image).inspect();
      this.pulledImage = true;
      return;
    } catch (error) {
      if (!isNotFound(error)) {
        throw error;
      }
    }

    await new Promise((resolve, reject) => {
      this.docker.pull(this.image, (pullError, stream) => {
        if (pullError) {
          reject(pullError);
          return;
        }
        this.docker.modem.followProgress(stream, (progressError) =>
          progressError ? reject(progressError) : resolve(),
        );
      });
    });
    this.pulledImage = true;
  }

  async ensureVolume(session, userId) {
    const volumeName = session.volumeName ?? `carbon-${userId}`;
    try {
      await this.docker.getVolume(volumeName).inspect();
    } catch (error) {
      if (!isNotFound(error)) {
        throw error;
      }
      await this.docker.createVolume({
        Name: volumeName,
        Labels: { "carbon.user-id": String(userId) },
      });
    }

    session.volumeName = volumeName;
    await session.save();
  }

  async inspectStoredContainer(session) {
    if (!session.containerId) {
      return null;
    }

    try {
      return await this.docker.getContainer(session.containerId).inspect();
    } catch (error) {
      if (!isNotFound(error)) {
        throw error;
      }
      session.containerId = null;
      session.status = "stopped";
      session.lastActiveAt = null;
      await session.save();
      return null;
    }
  }

  async reconcile(session) {
    const container = await this.inspectStoredContainer(session);
    if (!container) {
      return session;
    }

    const status = container.State.Running
      ? session.status === "starting" && !(await this.isContainerReady(session))
        ? "starting"
        : "running"
      : "stopped";
    if (session.status !== status || (status === "stopped" && session.lastActiveAt)) {
      session.status = status;
      if (status === "stopped") {
        session.lastActiveAt = null;
      }
      await session.save();
    }
    return session;
  }

  toPublicWorkspace(session) {
    return {
      status: session.status,
      hasSavedData: Boolean(session.volumeName),
      lastActiveAt: session.lastActiveAt,
    };
  }

  async getSnapshot(userId) {
    const session = await this.getOrCreateSession(userId);
    await this.reconcile(session);
    const activeUsers = await WorkspaceSession.countDocuments({
      status: "running",
      lastActiveAt: { $gte: new Date(Date.now() - 45_000) },
    });

    return {
      workspace: this.toPublicWorkspace(session),
      activeUsers,
    };
  }

  async start(userId) {
    return this.withUserLock(String(userId), async () => {
      const session = await this.getOrCreateSession(userId);
      const container = await this.inspectStoredContainer(session);

      if (container?.State.Running) {
        session.status = "starting";
        await session.save();
        await this.waitForContainerReady(session);
        session.status = "running";
        await session.save();
        return this.toPublicWorkspace(session);
      }

      session.status = "starting";
      session.lastActiveAt = null;
      await session.save();
      await this.ensureImage();
      await this.ensureVolume(session, userId);

      let managedContainer = container
        ? this.docker.getContainer(session.containerId)
        : null;

      if (!managedContainer) {
        managedContainer = await this.docker.createContainer({
          Image: this.image,
          name: `chromium-${userId}`,
          Labels: { "carbon.user-id": String(userId) },
          Env: ["PUID=1000", "PGID=1000", `TZ=${process.env.TZ ?? "UTC"}`],
          ExposedPorts: { "3000/tcp": {} },
          HostConfig: {
            Binds: [`${session.volumeName}:/config`],
            PortBindings: { "3000/tcp": [{ HostIp: "127.0.0.1", HostPort: "" }] },
            ShmSize: 1024 * 1024 * 1024,
            RestartPolicy: { Name: "unless-stopped" },
          },
        });
        session.containerId = managedContainer.id;
        await session.save();
      }

      try {
        await managedContainer.start();
      } catch (error) {
        if (!isNotRunning(error)) {
          session.status = "stopped";
          await session.save();
          throw error;
        }
      }

      await this.waitForContainerReady(session);
      session.status = "running";
      await session.save();
      return this.toPublicWorkspace(session);
    });
  }

  async getContainerTarget(session) {
    if (!session.containerId) {
      return null;
    }

    const container = await this.docker.getContainer(session.containerId).inspect();
    if (!container.State.Running) {
      return null;
    }
    const binding = container.NetworkSettings.Ports?.["3000/tcp"]?.[0];
    if (!binding?.HostPort) {
      return null;
    }
    return `http://${this.proxyHost}:${binding.HostPort}`;
  }

  async isContainerReady(session) {
    const target = await this.getContainerTarget(session);
    if (!target) {
      return false;
    }

    try {
      const response = await fetch(target, { signal: AbortSignal.timeout(2_000) });
      return response.ok;
    } catch {
      return false;
    }
  }

  async waitForContainerReady(session) {
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      if (await this.isContainerReady(session)) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    throw new Error("Chromium did not become ready in time. Please try again.");
  }

  async setPresence(userId, active) {
    return this.withUserLock(String(userId), async () => {
      const session = await this.getOrCreateSession(userId);
      await this.reconcile(session);

      if (active && session.status !== "running") {
        const error = new Error("Start your Chromium session before marking it active.");
        error.statusCode = 409;
        throw error;
      }

      session.lastActiveAt = active ? new Date() : null;
      await session.save();
      return this.toPublicWorkspace(session);
    });
  }

  async removeContainer(session) {
    const container = await this.inspectStoredContainer(session);
    if (!container) {
      return;
    }

    const managedContainer = this.docker.getContainer(session.containerId);
    if (container.State.Running) {
      try {
        await managedContainer.stop({ t: 10 });
      } catch (error) {
        if (!isNotRunning(error) && !isNotFound(error)) {
          throw error;
        }
      }
    }

    try {
      await managedContainer.remove({ force: true });
    } catch (error) {
      if (!isNotFound(error)) {
        throw error;
      }
    }
    session.containerId = null;
    session.status = "stopped";
    session.lastActiveAt = null;
    await session.save();
  }

  async stop(userId) {
    return this.withUserLock(String(userId), async () => {
      const session = await this.getOrCreateSession(userId);
      await this.removeContainer(session);
      session.status = "stopped";
      session.lastActiveAt = null;
      await session.save();
      return this.toPublicWorkspace(session);
    });
  }

  async reset(userId) {
    return this.withUserLock(String(userId), async () => {
      const session = await this.getOrCreateSession(userId);
      await this.removeContainer(session);

      if (session.volumeName) {
        try {
          await this.docker.getVolume(session.volumeName).remove();
        } catch (error) {
          if (!isNotFound(error)) {
            throw error;
          }
        }
      }

      session.volumeName = null;
      session.status = "stopped";
      session.lastActiveAt = null;
      await session.save();
      return this.toPublicWorkspace(session);
    });
  }

  async getProxyTarget(userId) {
    const session = await this.getOrCreateSession(userId);
    await this.reconcile(session);
    if (session.status !== "running") {
      return null;
    }

    const target = await this.getContainerTarget(session);
    if (!target) {
      throw new Error("The Chromium container has no published internal web port.");
    }
    return target;
  }
}
