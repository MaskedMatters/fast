# fast

Fast provides a private Chromium browser session for each account. Browser profiles
are stored in per-user Docker volumes, so stopping a session removes its container
without deleting its saved profile.

## Run the complete application

1. Copy `.env.example` to `.env` and set `SESSION_SECRET` to a long random value.
2. Start the stack with `docker compose up --build -d`.
3. Open `http://localhost:8080` (or the port selected with `FRONTEND_PORT`).

The frontend publishes `FRONTEND_PORT` (default `8080`) as the only public
Compose port. The API runs on the host network but binds only to the Docker
bridge gateway address (default `172.17.0.1:3001`), where the frontend can reach
it through the Docker host gateway; the API port is not published. MongoDB
remains on a private bridge network and is not published to a host port. The
backend talks directly to the host Docker Engine through the mounted
`/var/run/docker.sock`; there is no DinD service. Chromium containers are
created by the host Docker Engine, and their browser ports bind only to
`127.0.0.1` before being accessed through the authenticated API proxy.

The Docker socket grants the backend root-equivalent control of the host Docker
Engine. Protect the Docker host and Compose configuration accordingly. Set
`DOCKER_GID` to the group ID that owns the host socket (check with
`stat -c '%g' /var/run/docker.sock`). Set `DOCKER_HOST_GATEWAY` if your Docker
host uses a different bridge gateway address. The private MongoDB subnet
`172.30.254.0/24` must not conflict with existing host networks. Place the
frontend behind HTTPS in a public deployment, forwarding the original
`X-Forwarded-Proto` value from the TLS terminator.

## Local development

`npm run dev` starts the Vite frontend and Express API. The API expects a running
MongoDB instance at `MONGO_URI` and a Docker Engine accessible through
`DOCKER_HOST` (by default, `/var/run/docker.sock`). Vite proxies `/api` and the
authenticated `/session` browser route to the API.

`npm run build` builds the frontend assets. The Compose deployment builds the
frontend and API as separate containers.
