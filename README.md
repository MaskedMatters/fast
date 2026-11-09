# fast
Fast is a weird name for a DinD web application for quickly spinning up Chromium in a web browser per person.

## Carbon Labs authentication prototype

Run MongoDB locally with `docker compose up -d`, copy `.env.example` to `.env`, and set a
long random `SESSION_SECRET`. Install dependencies with `npm install`, then run `npm run dev`
to start the API and frontend together. Open the Vite URL printed in the terminal.

The API connects to MongoDB at `127.0.0.1:27017`; account data and server-side sessions are
stored in the `mongo_data` Docker volume. MongoDB is published only on the local host in
this development setup.

For production, build the frontend with `npm run build`, set `NODE_ENV=production` and the
environment variables from `.env.example`, then run `npm start`.
