import { Links, Meta, Outlet, Scripts, ScrollRestoration, useRouteError, isRouteErrorResponse } from 'react-router';
import '../src/styles.css';

export function Layout({ children }) {
  return <html lang="en">
    <head>
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="color-scheme" content="light dark" />
      <meta name="theme-color" content="#f6f5f0" media="(prefers-color-scheme: light)" />
      <meta name="theme-color" content="#131b17" media="(prefers-color-scheme: dark)" />
      <meta name="description" content="TenRounds: ten card goals against Arlo or a friend at your own private table." />
      <title>TenRounds</title>
      <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='16' fill='%232d493e'/%3E%3Ctext x='32' y='42' text-anchor='middle' font-family='Georgia' font-size='28' fill='%23f7f5eb'%3ETR%3C/text%3E%3C/svg%3E" />
      <Meta /><Links />
    </head>
    <body>{children}<ScrollRestoration /><Scripts /></body>
  </html>;
}

export default function Root() { return <Outlet />; }

export function ErrorBoundary() {
  const error = useRouteError();
  return <main className="mx-auto max-w-[620px] px-6 py-16">
    <h1 className="font-display text-2xl">{isRouteErrorResponse(error) && error.status === 404 ? 'This table isn’t here.' : 'The connection was interrupted.'}</h1>
    <p className="my-4 text-secondary">Your computer-game save is still in this browser. Reload to reconnect, or return to Arlo.</p>
    <a className="text-accent underline" href="/">Computer play</a>
  </main>;
}
