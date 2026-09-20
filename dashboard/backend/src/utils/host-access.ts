// Whether the dashboard container has been given access to the host it runs on.
//
// Managing the Remote Desktop service means running commands in the host's namespaces (nsenter into
// PID 1), which needs a privileged container sharing the host PID namespace. The default stack does
// not grant that; docker-compose.host-access.yml does, and sets HOST_ACCESS=true. The default
// compose file sets HOST_ACCESS=false so the dashboard can say so plainly instead of failing
// obscurely. When the variable is absent (for example running natively on the host) access is
// assumed, because there is no container boundary to cross.

export function hostAccessEnabled(): boolean {
  return process.env.HOST_ACCESS !== 'false';
}

export const HOST_ACCESS_DISABLED_MESSAGE =
  'Host access is not enabled for this container. Start the stack with docker-compose.host-access.yml ' +
  'to let the dashboard manage the Remote Desktop service on the host.';
