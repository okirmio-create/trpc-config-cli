import { Command } from 'commander';
import chalk from 'chalk';

const program = new Command();

// ─── Helpers ────────────────────────────────────────────────────────────────

function printFile(filename: string, content: string) {
  console.log(chalk.cyan(`\n// ─── ${filename} ${'─'.repeat(Math.max(0, 60 - filename.length))}`));
  console.log(content.trim());
}

function success(msg: string) {
  console.log(chalk.green('✔') + ' ' + msg);
}

function info(msg: string) {
  console.log(chalk.blue('ℹ') + ' ' + msg);
}

function warn(msg: string) {
  console.log(chalk.yellow('⚠') + ' ' + msg);
}

// ─── Templates: init ────────────────────────────────────────────────────────

function trpcInitTemplate(framework: string): string {
  return `import { initTRPC } from '@trpc/server';
import superjson from 'superjson';
import { ZodError } from 'zod';
import type { Context } from './context';

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const middleware = t.middleware;
export const mergeRouters = t.mergeRouters;
`;
}

function contextTemplate(framework: string): string {
  if (framework === 'express') {
    return `import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';

export async function createContext({ req, res }: CreateExpressContextOptions) {
  return { req, res };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
`;
  }
  if (framework === 'fastify') {
    return `import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';

export async function createContext({ req, res }: CreateFastifyContextOptions) {
  return { req, res };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
`;
  }
  if (framework === 'next-app-router') {
    return `import type { NextRequest } from 'next/server';

export function createContext(req: NextRequest) {
  return { req };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
`;
  }
  if (framework === 'next-pages-router') {
    return `import type { CreateNextContextOptions } from '@trpc/server/adapters/next';

export async function createContext({ req, res }: CreateNextContextOptions) {
  return { req, res };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
`;
  }
  // standalone
  return `import type { NodeHTTPCreateContextFnOptions } from '@trpc/server/adapters/node-http';
import type { IncomingMessage, ServerResponse } from 'node:http';

export async function createContext(
  opts: NodeHTTPCreateContextFnOptions<IncomingMessage, ServerResponse>,
) {
  return { req: opts.req, res: opts.res };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
`;
}

function rootRouterTemplate(): string {
  return `import { router } from './trpc';
// import { userRouter } from './routers/user';

export const appRouter = router({
  // user: userRouter,
});

export type AppRouter = typeof appRouter;
`;
}

function expressServerTemplate(): string {
  return `import express from 'express';
import cors from 'cors';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { appRouter } from './router';
import { createContext } from './context';

const app = express();

app.use(cors());
app.use(express.json());

app.use(
  '/trpc',
  createExpressMiddleware({ router: appRouter, createContext }),
);

app.listen(3000, () => {
  console.log('tRPC server running at http://localhost:3000');
});
`;
}

function fastifyServerTemplate(): string {
  return `import Fastify from 'fastify';
import cors from '@fastify/cors';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import { appRouter } from './router';
import { createContext } from './context';

const server = Fastify({ logger: true });

await server.register(cors);
await server.register(fastifyTRPCPlugin, {
  prefix: '/trpc',
  trpcOptions: { router: appRouter, createContext },
});

await server.listen({ port: 3000 });
`;
}

function standaloneServerTemplate(): string {
  return `import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { appRouter } from './router';
import { createContext } from './context';

const server = createHTTPServer({ router: appRouter, createContext });

server.listen(3000, () => {
  console.log('tRPC standalone server running at http://localhost:3000');
});
`;
}

function nextAppRouterTemplate(): string {
  return `import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from '@/server/router';
import { createContext } from '@/server/context';

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => createContext(req as any),
  });

export { handler as GET, handler as POST };
`;
}

function nextPagesRouterTemplate(): string {
  return `import { createNextApiHandler } from '@trpc/server/adapters/next';
import { appRouter } from '@/server/router';
import { createContext } from '@/server/context';

export default createNextApiHandler({ router: appRouter, createContext });
`;
}

function initDepsFor(framework: string): string {
  const base = 'npm install @trpc/server @trpc/client zod superjson';
  if (framework === 'express') return base + ' express cors\nnpm install -D @types/express @types/cors';
  if (framework === 'fastify') return base + ' fastify @fastify/cors';
  if (framework === 'next-app-router' || framework === 'next-pages-router') return base + ' @trpc/react-query @tanstack/react-query next react react-dom';
  return base;
}

function runInit(framework: string) {
  const valid = ['next-app-router', 'next-pages-router', 'express', 'fastify', 'standalone'];
  if (!valid.includes(framework)) {
    console.log(chalk.red(`Invalid framework: "${framework}"`));
    console.log(chalk.gray(`Valid: ${valid.join(' | ')}`));
    process.exit(1);
  }

  console.log(chalk.bold(`\n🔧 Generating tRPC setup for ${chalk.cyan(framework)}...\n`));

  printFile('src/trpc.ts', trpcInitTemplate(framework));
  printFile('src/context.ts', contextTemplate(framework));
  printFile('src/router.ts', rootRouterTemplate());

  if (framework === 'express') {
    printFile('src/server.ts', expressServerTemplate());
  } else if (framework === 'fastify') {
    printFile('src/server.ts', fastifyServerTemplate());
  } else if (framework === 'standalone') {
    printFile('src/server.ts', standaloneServerTemplate());
  } else if (framework === 'next-app-router') {
    printFile('src/app/api/trpc/[trpc]/route.ts', nextAppRouterTemplate());
  } else if (framework === 'next-pages-router') {
    printFile('src/pages/api/trpc/[trpc].ts', nextPagesRouterTemplate());
  }

  console.log(chalk.bold('\n📦 Install dependencies:\n'));
  console.log(chalk.gray(initDepsFor(framework)));
  console.log();
  success('Done! Copy the file contents above into your project.');
}

// ─── Templates: add-router ───────────────────────────────────────────────────

function routerTemplate(name: string): string {
  const cap = name.charAt(0).toUpperCase() + name.slice(1);
  return `import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { observable } from '@trpc/server/observable';

const ${name}Schema = z.object({
  id: z.string().cuid(),
  name: z.string().min(1).max(255),
  createdAt: z.date(),
});

type ${cap} = z.infer<typeof ${name}Schema>;

export const ${name}Router = router({
  /** Fetch all records */
  list: publicProcedure
    .output(z.array(${name}Schema))
    .query(async (): Promise<${cap}[]> => {
      return [];
    }),

  /** Fetch single record by id */
  byId: publicProcedure
    .input(z.object({ id: z.string().cuid() }))
    .output(${name}Schema.nullable())
    .query(async ({ input }): Promise<${cap} | null> => {
      return null;
    }),

  /** Create a new record */
  create: publicProcedure
    .input(z.object({ name: z.string().min(1).max(255) }))
    .output(${name}Schema)
    .mutation(async ({ input }): Promise<${cap}> => {
      return { id: crypto.randomUUID(), name: input.name, createdAt: new Date() };
    }),

  /** Update an existing record */
  update: publicProcedure
    .input(z.object({ id: z.string().cuid(), name: z.string().min(1).max(255) }))
    .output(${name}Schema)
    .mutation(async ({ input }): Promise<${cap}> => {
      return { id: input.id, name: input.name, createdAt: new Date() };
    }),

  /** Delete a record */
  delete: publicProcedure
    .input(z.object({ id: z.string().cuid() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ input }) => {
      return { success: true };
    }),

  /** Real-time updates via WebSocket */
  onUpdate: publicProcedure.subscription(() => {
    return observable<${cap}>((emit) => {
      // Emit updates here
      return () => { /* cleanup */ };
    });
  }),
});
`;
}

// ─── Templates: add-middleware ───────────────────────────────────────────────

function middlewareTemplate(name: string): string {
  if (name === 'auth') {
    return `import { middleware, publicProcedure } from './trpc';
import { TRPCError } from '@trpc/server';

/** Verify the caller is authenticated */
export const isAuthed = middleware(({ ctx, next }) => {
  const user = (ctx as any).user;
  if (!user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'You must be signed in to perform this action.',
    });
  }
  return next({ ctx: { ...ctx, user } });
});

export const protectedProcedure = publicProcedure.use(isAuthed);
`;
  }
  if (name === 'logging') {
    return `import { middleware } from './trpc';

/** Log procedure calls with timing information */
export const loggingMiddleware = middleware(async ({ path, type, next }) => {
  const start = Date.now();
  const result = await next();
  const durationMs = Date.now() - start;

  const icon = result.ok ? '✔' : '✖';
  console.log(\`[\${icon}] \${type} \${path} — \${durationMs}ms\`);
  return result;
});
`;
  }
  if (name === 'rateLimit') {
    return `import { middleware } from './trpc';
import { TRPCError } from '@trpc/server';

const requestCounts = new Map<string, { count: number; resetAt: number }>();

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 60;

/** Simple in-process rate limiter. Replace Map with Redis for production. */
export const rateLimitMiddleware = middleware(({ ctx, next }) => {
  const ip = ((ctx as any).req?.ip ?? 'unknown') as string;
  const now = Date.now();
  const entry = requestCounts.get(ip) ?? { count: 0, resetAt: now + WINDOW_MS };

  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + WINDOW_MS;
  }

  entry.count += 1;
  requestCounts.set(ip, entry);

  if (entry.count > MAX_REQUESTS) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: \`Rate limit exceeded. Retry after \${Math.ceil((entry.resetAt - now) / 1000)}s.\`,
    });
  }

  return next();
});
`;
  }
  if (name === 'timing') {
    return `import { middleware } from './trpc';

/** Attach elapsed time to response headers (when using Node adapters) */
export const timingMiddleware = middleware(async ({ ctx, path, next }) => {
  const start = performance.now();
  const result = await next();
  const elapsed = (performance.now() - start).toFixed(2);

  const res = (ctx as any).res;
  if (res && typeof res.setHeader === 'function') {
    res.setHeader('Server-Timing', \`trpc-\${path};dur=\${elapsed}\`);
  }

  return result;
});
`;
  }
  // generic fallback
  return `import { middleware } from './trpc';

export const ${name}Middleware = middleware(async ({ ctx, next }) => {
  // TODO: implement ${name} logic
  return next();
});
`;
}

function runAddMiddleware(name: string) {
  const valid = ['auth', 'logging', 'rateLimit', 'timing'];
  if (!valid.includes(name)) {
    warn(`Unknown middleware type "${name}". Generating generic middleware.`);
  }
  console.log(chalk.bold(`\n🔒 Generating middleware: ${chalk.cyan(name)}\n`));
  printFile(`src/middleware/${name}.ts`, middlewareTemplate(name));
  console.log();
  success('Done!');
}

// ─── Templates: add-context ──────────────────────────────────────────────────

function richContextTemplate(): string {
  return `import { PrismaClient } from '@prisma/client';
import type { Session } from 'next-auth';
import { getServerSession } from 'next-auth';
import { authOptions } from './auth';

/** Singleton Prisma instance */
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ log: ['error'] });
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export interface CreateContextOptions {
  req: Request | { headers: Record<string, string> };
}

/** Build context for every tRPC request */
export async function createContext({ req }: CreateContextOptions) {
  let session: Session | null = null;

  try {
    session = await getServerSession(authOptions);
  } catch {
    // session unavailable (e.g. non-Next.js environments)
  }

  return {
    prisma,
    session,
    req,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
`;
}

// ─── Templates: add-client ───────────────────────────────────────────────────

function clientTemplate(framework: string): string {
  if (framework === 'react-query') {
    return `'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink, loggerLink, wsLink, splitLink } from '@trpc/client';
import { createTRPCReact } from '@trpc/react-query';
import { useState } from 'react';
import superjson from 'superjson';
import type { AppRouter } from '@/server/router';

export const trpc = createTRPCReact<AppRouter>();

function getBaseUrl() {
  if (typeof window !== 'undefined') return '';
  if (process.env.VERCEL_URL) return \`https://\${process.env.VERCEL_URL}\`;
  return \`http://localhost:\${process.env.PORT ?? 3000}\`;
}

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 60 * 1000 } },
  }));

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        loggerLink({ enabled: (opts) => process.env.NODE_ENV === 'development' || opts.direction === 'down' && opts.result instanceof Error }),
        httpBatchLink({
          url: \`\${getBaseUrl()}/api/trpc\`,
          transformer: superjson,
        }),
      ],
    }),
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
`;
  }
  if (framework === 'solid-query') {
    return `import { QueryClient } from '@tanstack/solid-query';
import { httpBatchLink } from '@trpc/client';
import { createTRPCSolid } from '@trpc/solid-query';
import superjson from 'superjson';
import type { AppRouter } from '../server/router';

export const trpc = createTRPCSolid<AppRouter>();

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60 * 1000 } },
});

export const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: 'http://localhost:3000/trpc',
      transformer: superjson,
    }),
  ],
});
`;
  }
  if (framework === 'svelte-query') {
    return `import { QueryClient } from '@tanstack/svelte-query';
import { httpBatchLink } from '@trpc/client';
import { createTRPCSvelte } from '@trpc/svelte-query';
import superjson from 'superjson';
import type { AppRouter } from '../server/router';

export const trpc = createTRPCSvelte<AppRouter>();

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60 * 1000 } },
});

export const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: 'http://localhost:3000/trpc',
      transformer: superjson,
    }),
  ],
});
`;
  }
  // vanilla
  return `import { createTRPCClient, httpBatchLink, loggerLink } from '@trpc/client';
import superjson from 'superjson';
import type { AppRouter } from '../server/router';

export const trpc = createTRPCClient<AppRouter>({
  links: [
    loggerLink({ enabled: () => process.env.NODE_ENV === 'development' }),
    httpBatchLink({
      url: 'http://localhost:3000/trpc',
      transformer: superjson,
    }),
  ],
});

// Usage:
// const users = await trpc.user.list.query();
// const user = await trpc.user.create.mutate({ name: 'Alice' });
`;
}

function clientDepsFor(framework: string): string {
  if (framework === 'react-query') return 'npm install @trpc/client @trpc/react-query @tanstack/react-query superjson';
  if (framework === 'solid-query') return 'npm install @trpc/client @trpc/solid-query @tanstack/solid-query superjson';
  if (framework === 'svelte-query') return 'npm install @trpc/client @trpc/svelte-query @tanstack/svelte-query superjson';
  return 'npm install @trpc/client superjson';
}

function runAddClient(framework: string) {
  const valid = ['react-query', 'solid-query', 'svelte-query', 'vanilla'];
  if (!valid.includes(framework)) {
    console.log(chalk.red(`Invalid framework: "${framework}"`));
    console.log(chalk.gray(`Valid: ${valid.join(' | ')}`));
    process.exit(1);
  }
  console.log(chalk.bold(`\n📡 Generating client for ${chalk.cyan(framework)}...\n`));
  printFile(`src/client/${framework}.ts`, clientTemplate(framework));
  console.log(chalk.bold('\n📦 Install dependencies:\n'));
  console.log(chalk.gray(clientDepsFor(framework)));
  console.log();
  success('Done!');
}

// ─── Templates: add-subscription ────────────────────────────────────────────

function subscriptionTemplate(name: string): string {
  const cap = name.charAt(0).toUpperCase() + name.slice(1);
  return `import { z } from 'zod';
import { observable } from '@trpc/server/observable';
import { EventEmitter } from 'events';
import { router, publicProcedure } from '../trpc';

/** Typed event payload for ${name} updates */
interface ${cap}Event {
  id: string;
  payload: unknown;
  timestamp: Date;
}

/** In-process event bus — replace with Redis Pub/Sub or SSE in production */
const ee = new EventEmitter();
ee.setMaxListeners(100);

/** Emit a new ${name} event from anywhere in your server */
export function emit${cap}(data: ${cap}Event) {
  ee.emit('${name}', data);
}

export const ${name}SubscriptionRouter = router({
  /** Subscribe to live ${name} events */
  on${cap}: publicProcedure
    .input(z.object({ filter: z.string().optional() }))
    .subscription(({ input }) => {
      return observable<${cap}Event>((emit) => {
        function handler(data: ${cap}Event) {
          if (!input.filter || JSON.stringify(data).includes(input.filter)) {
            emit.next(data);
          }
        }

        ee.on('${name}', handler);
        return () => ee.off('${name}', handler);
      });
    }),
});

// ─── WebSocket server setup ──────────────────────────────────────────────────
// Add to your tRPC server (e.g. standalone):
//
// import { applyWSSHandler } from '@trpc/server/adapters/ws';
// import { WebSocketServer } from 'ws';
//
// const wss = new WebSocketServer({ port: 3001 });
// applyWSSHandler({ wss, router: appRouter, createContext });
// console.log('WebSocket server on ws://localhost:3001');
`;
}

// ─── Templates: add-error-handler ────────────────────────────────────────────

function errorHandlerTemplate(): string {
  return `import { initTRPC } from '@trpc/server';
import { ZodError } from 'zod';

// ─── Custom error codes ───────────────────────────────────────────────────────

export class NotFoundError extends Error {
  constructor(resource: string, id: string | number) {
    super(\`\${resource} with id "\${id}" not found.\`);
    this.name = 'NotFoundError';
  }
}

export class ForbiddenError extends Error {
  constructor(message = 'You do not have permission to perform this action.') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

// ─── TRPC error formatter ─────────────────────────────────────────────────────

export type ErrorShape = {
  message: string;
  code: number;
  data: {
    code: string;
    httpStatus: number;
    path?: string;
    zodError?: ZodError['flatten'] extends (...args: any) => infer R ? R : never;
    stack?: string;
  };
};

export const errorFormatter: NonNullable<
  Parameters<ReturnType<typeof initTRPC.create>['create']>[0]
>['errorFormatter'] = ({ shape, error, ctx, path }) => {
  const isDev = process.env.NODE_ENV === 'development';

  let code = shape.data.code;
  let httpStatus = shape.data.httpStatus;

  if (error.cause instanceof NotFoundError) {
    code = 'NOT_FOUND';
    httpStatus = 404;
  } else if (error.cause instanceof ForbiddenError) {
    code = 'FORBIDDEN';
    httpStatus = 403;
  } else if (error.cause instanceof ConflictError) {
    code = 'CONFLICT';
    httpStatus = 409;
  }

  return {
    ...shape,
    data: {
      ...shape.data,
      code,
      httpStatus,
      path,
      zodError:
        error.cause instanceof ZodError
          ? error.cause.flatten()
          : undefined,
      stack: isDev ? error.stack : undefined,
    },
  };
};

// ─── Usage in trpc.ts ─────────────────────────────────────────────────────────
// import { errorFormatter } from './errorHandler';
//
// const t = initTRPC.context<Context>().create({
//   transformer: superjson,
//   errorFormatter,
// });
`;
}

// ─── Templates: validate ─────────────────────────────────────────────────────

async function runValidate() {
  console.log(chalk.bold('\n🔍 Validating tRPC router structure...\n'));

  const fs = await import('node:fs').then((m) => m.default).catch(() => null);

  const checks = [
    { path: 'src/trpc.ts', label: 'tRPC init (src/trpc.ts)' },
    { path: 'src/context.ts', label: 'Context (src/context.ts)' },
    { path: 'src/router.ts', label: 'Root router (src/router.ts)' },
  ];

  let allOk = true;

  for (const check of checks) {
    const exists = fs ? fs.existsSync(check.path) : false;
    if (exists) {
      success(check.label);
    } else {
      warn(`Missing: ${check.label}`);
      allOk = false;
    }
  }

  // Check for AppRouter export
  if (fs && fs.existsSync('src/router.ts')) {
    const content = fs.readFileSync('src/router.ts', 'utf8');
    if (content.includes('export type AppRouter')) {
      success('AppRouter type export found');
    } else {
      warn('Missing "export type AppRouter" in src/router.ts');
      allOk = false;
    }
  }

  console.log();
  if (allOk) {
    success('Router structure is valid!');
  } else {
    console.log(chalk.yellow('Run `trpc-config init <framework>` to generate missing files.'));
    process.exit(1);
  }
}

// ─── CLI setup ───────────────────────────────────────────────────────────────

program
  .name('trpc-config')
  .description(chalk.cyan('Generate type-safe tRPC configuration for your project'))
  .version('1.0.0');

// init <framework>
program
  .command('init <framework>')
  .description('Generate tRPC setup: next-app-router | next-pages-router | express | fastify | standalone')
  .action((framework: string) => runInit(framework));

// add-router <name>
program
  .command('add-router <name>')
  .description('Generate a router with typed query, mutation, and subscription procedures')
  .action((name: string) => {
    console.log(chalk.bold(`\n🔀 Generating router: ${chalk.cyan(name)}\n`));
    printFile(`src/routers/${name}.ts`, routerTemplate(name));
    console.log(chalk.bold('\n📎 Register in root router (src/router.ts):\n'));
    console.log(chalk.gray(`import { ${name}Router } from './routers/${name}';`));
    console.log(chalk.gray(`// add to appRouter: { ${name}: ${name}Router }`));
    console.log();
    success('Done!');
  });

// add-middleware <name>
program
  .command('add-middleware <name>')
  .description('Generate middleware: auth | logging | rateLimit | timing')
  .action((name: string) => runAddMiddleware(name));

// add-context
program
  .command('add-context')
  .description('Generate context creation with database, session, and auth')
  .action(() => {
    console.log(chalk.bold('\n🗄️  Generating rich context...\n'));
    printFile('src/context.ts', richContextTemplate());
    console.log(chalk.bold('\n📦 Install dependencies:\n'));
    console.log(chalk.gray('npm install @prisma/client next-auth\nnpm install -D prisma\nnpx prisma init'));
    console.log();
    success('Done!');
  });

// add-client <framework>
program
  .command('add-client <framework>')
  .description('Generate client setup: react-query | solid-query | svelte-query | vanilla')
  .action((framework: string) => runAddClient(framework));

// add-subscription <name>
program
  .command('add-subscription <name>')
  .description('Generate a WebSocket subscription handler with EventEmitter')
  .action((name: string) => {
    console.log(chalk.bold(`\n📡 Generating subscription: ${chalk.cyan(name)}\n`));
    printFile(`src/routers/${name}Subscription.ts`, subscriptionTemplate(name));
    console.log(chalk.bold('\n📦 Install dependencies:\n'));
    console.log(chalk.gray('npm install ws @trpc/server\nnpm install -D @types/ws'));
    console.log();
    success('Done!');
  });

// add-error-handler
program
  .command('add-error-handler')
  .description('Generate custom error formatter and typed error classes')
  .action(() => {
    console.log(chalk.bold('\n⚡ Generating error handler...\n'));
    printFile('src/errorHandler.ts', errorHandlerTemplate());
    console.log();
    success('Done! Import errorFormatter into your trpc.ts init.');
  });

// validate
program
  .command('validate')
  .description('Validate tRPC router structure in the current project')
  .action(() => {
    void runValidate();
  });

program.parse(process.argv);
