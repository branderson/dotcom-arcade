import { DockerDriver } from './docker.ts';
import { GameCatalog } from './games.ts';
import { createApiServer, createStreamServer } from './server.ts';
import { SessionManager } from './sessions.ts';

function env(name: string, fallback?: string): string {
  const value = process.env[name] || fallback;
  if (value === undefined) {
    throw new Error(`${name} is required`);
  }
  return value;
}

const driver = new DockerDriver({
  image: env('STREAMER_IMAGE', 'flashpoint-streamer'),
  network: env('STREAMER_NETWORK', 'flashpoint-streams'),
  flashpointHostPath: env('FLASHPOINT_HOST_PATH'),
  uid: Number(env('PUID', '1000')),
  gid: Number(env('PGID', '1000')),
});
const sessions = new SessionManager(
  driver,
  new GameCatalog(env('FLASHPOINT_PATH', '/flashpoint')),
  Number(env('MAX_SESSIONS', '4')),
);

await driver.removeAll();
const api = createApiServer(sessions, env('API_TOKEN')).listen(Number(env('API_PORT', '8080')));
const stream = createStreamServer(sessions, driver).listen(Number(env('STREAM_PORT', '8081')));
console.log('Session manager started');

process.once('SIGTERM', async () => {
  api.close();
  stream.close();
  await sessions.teardownAll();
  process.exit(0);
});
